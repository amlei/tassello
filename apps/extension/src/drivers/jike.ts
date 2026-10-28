import type { ExtensionJobResult } from "@tassello/shared";
import { plainBody } from "../driver-utils.ts";
import { executeInPage, pasteInto, setInputFiles, waitForSelector } from "../page-runtime.ts";
import type { PublishRuntime } from "../publish-runtime.ts";

const HOME = "https://web.okjike.com/";

export async function publishJike(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const type = runtime.job.snapshot.type;
  if (type !== "image" && type !== "video") throw new Error("即刻只支持贴图和视频");
  const tabId = await runtime.open(HOME, true);
  await waitForSelector(tabId, '[contenteditable="true"]', { visible: true, timeoutMs: 40_000 });
  const media = await runtime.loadMedia(runtime.job.snapshot.media.filter((item) => item.kind === type));
  if (media.length) {
    runtime.report({ status: "uploading", stage: 1, progress: 35, message: `注入${type === "video" ? "视频" : "图片"}` });
    const selector = type === "video"
      ? 'input[type="file"][accept*="video"]'
      : 'input[type="file"][accept*="image"], input[type="file"]';
    await waitForSelector(tabId, selector, { visible: false, timeoutMs: 30_000 });
    if (!(await setInputFiles(tabId, selector, media))) {
      throw new Error("即刻媒体文件没有进入上传控件");
    }
    const ready = await executeInPage(tabId, async ({ kind, expected }) => {
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        const body = document.body?.innerText ?? "";
        if (/上传失败|图片上传失败|视频上传失败/.test(body)) return false;
        const previews = kind === "video"
          ? document.querySelectorAll("video, [class*=videoPreview], [class*=video-preview]").length
          : document.querySelectorAll('img[src^="blob:"]').length;
        const send = Array.from(document.querySelectorAll("button"))
          .find((button) => (button.textContent || "").trim() === "发送") as HTMLButtonElement | undefined;
        if (previews >= expected && send && !send.disabled && send.getAttribute("aria-disabled") !== "true") return true;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return false;
    }, { kind: type, expected: media.length }, 185_000);
    if (!ready) throw new Error("即刻媒体上传或处理未完成");
  }
  const title = runtime.job.snapshot.title.trim();
  const body = plainBody(runtime).trim();
  const content = title && body ? `${title}\n\n${body}` : title || body;
  if (content) {
    runtime.report({ status: "filling", stage: 2, progress: 70, message: "填充即刻正文" });
    const pasted = await pasteInto(tabId, '[contenteditable="true"]', content);
    if (!pasted) throw new Error("未找到即刻正文编辑器");
  }
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}
