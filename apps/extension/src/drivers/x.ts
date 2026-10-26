import type { ExtensionJobResult } from "@tassello/shared";
import { mediaOfKind, plainBody, publishIntent } from "../driver-utils.ts";
import { dropFiles, executeInPage, pasteInto, setInputFiles, sleepPage, waitForSelector } from "../page-runtime.ts";
import type { PublishRuntime } from "../publish-runtime.ts";

const COMPOSE = "https://x.com/compose/post";

function xText(runtime: PublishRuntime): string {
  const title = runtime.job.snapshot.title.trim();
  const body = plainBody(runtime).trim();
  return title && body && !body.startsWith(title) ? `${title}\n\n${body}` : body || title;
}

export async function publishX(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const type = runtime.job.snapshot.type;
  if (type === "audio") throw new Error("X 音频发布尚未实现");
  const images = await runtime.loadMedia(mediaOfKind(runtime, "image"));
  const videos = await runtime.loadMedia(mediaOfKind(runtime, "video"));
  if (images.length > 4) throw new Error(`X 单帖最多 4 张图片，当前 ${images.length} 张`);
  if (videos.length && images.length) throw new Error("X 单帖视频与图片不能混用");
  if (type === "video" && !videos.length) throw new Error("X 视频帖需要视频素材");
  const text = xText(runtime);
  if (!text && !images.length && !videos.length) throw new Error("X 帖子需要正文或媒体");
  const tabId = await runtime.open(COMPOSE, true);
  await waitForSelector(tabId, '[data-testid="tweetTextarea_0"]', { visible: true, timeoutMs: 40_000 });
  await sleepPage(1_000);
  const media = videos.length ? videos : images;
  if (media.length) {
    runtime.report({ status: "uploading", stage: 1, progress: 35, message: `上传 ${videos.length ? "视频" : `${images.length} 张图片`}` });
    const dropped = await dropFiles(tabId, '[data-testid="tweetTextarea_0"]', media);
    const accepted = dropped && await executeInPage(tabId, async () => {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        if (document.querySelector('[data-testid="attachments"]')) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return false;
    }, [], 7_000);
    if (!accepted && !(await setInputFiles(tabId, '[data-testid="fileInput"]', media))) {
      throw new Error("X 媒体文件没有进入上传控件");
    }
  }
  if (text) {
    runtime.report({ status: "filling", stage: 2, progress: 70, message: "填充 X 正文" });
    const pasted = await pasteInto(tabId, '[data-testid="tweetTextarea_0"]', text);
    if (!pasted) throw new Error("无法填入 X 正文");
  }
  const intent = publishIntent(runtime);
  if (media.length) {
    const state = await executeInPage(tabId, async ({ expected, video }) => {
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        const bodyText = document.body?.innerText ?? "";
        if (/上传失败|上传出错|something went wrong|failed to upload/i.test(bodyText)) return "failed";
        const button = document.querySelector('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]') as HTMLButtonElement | null;
        const buttonReady = !!(button && !button.disabled && button.getAttribute("aria-disabled") !== "true");
        const uploading = /Uploading\s*\(|上传中/.test(bodyText);
        const ready = video
          ? !!document.querySelector('[data-testid="attachments"] video, [data-testid="videoPlayer"]')
          : document.querySelectorAll('[data-testid="attachments"] img').length >= expected;
        if (ready && buttonReady && !uploading) return "ready";
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return "timeout";
    }, {
      expected: images.length,
      video: videos.length > 0,
    }, 185_000);
    if (state === "failed") throw new Error("X 媒体上传失败，请检查页面提示");
    if (state !== "ready") throw new Error("X 媒体上传未完成");
  }
  if (intent === "draft") {
    return {
      status: "awaiting_confirm",
      url: null,
      pageUrl: await runtime.currentUrl(tabId),
      tabId,
      error: null,
    };
  }
  runtime.report({ status: "filling", stage: 3, progress: 90, message: "提交 X 帖子" });
  const clicked = await executeInPage(tabId, () => {
    const button = document.querySelector('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]') as HTMLButtonElement | null;
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return false;
    button.click();
    return true;
  }, []);
  if (!clicked) throw new Error("X Post 按钮不可用");
  await sleepPage(3000);
  const submitted = await executeInPage(tabId, () => !document.querySelector('[data-testid="tweetTextarea_0"]'), []);
  runtime.report({
    message: submitted
      ? "X 已提交，请核对页面回执并填写帖子链接"
      : "已点击发送但尚未收到平台提交确认，请检查页面并填写回执链接",
  });
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}
