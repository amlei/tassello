import type { ExtensionJobResult } from "@tassello/shared";
import { plainBody } from "../driver-utils.ts";
import { executeInPage, pasteInto, setControlValue, setInputFiles, waitForSelector, waitForText } from "../page-runtime.ts";
import type { PublishRuntime } from "../publish-runtime.ts";

const HOME = "https://weibo.com";
const ARTICLE_EDITOR = "https://card.weibo.com/article/v5/editor#/draft";

function wrapTopics(text: string): string {
  return text.replace(/#([^#\s，。！？；：,.!?;:]+)(?!#)/g, "#$1#");
}

export async function publishWeibo(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const type = runtime.job.snapshot.type;
  const title = runtime.job.snapshot.title.trim();
  const body = plainBody(runtime).trim();
  const text = wrapTopics(title && body && !body.startsWith(title) ? `${title}\n\n${body}` : body || title);
  if (type === "article") {
    const tabId = await runtime.open(ARTICLE_EDITOR, true);
    await waitForSelector(tabId, 'textarea[placeholder="请输入标题"], .ProseMirror', { visible: true, timeoutMs: 45_000 });
    await setControlValue(tabId, 'textarea[placeholder="请输入标题"]', runtime.job.snapshot.title);
    if (text) await pasteInto(tabId, ".ProseMirror", text);
    runtime.report({ status: "filling", stage: 2, progress: 85, message: "微博文章已填入编辑器" });
    return {
      status: "awaiting_confirm",
      url: null,
      pageUrl: await runtime.currentUrl(tabId),
      tabId,
      error: null,
    };
  }

  if (!text) throw new Error("微博正文为空");
  const video = runtime.job.snapshot.media.find((item) => item.kind === "video");
  const images = runtime.job.snapshot.media.filter((item) => item.kind === "image");
  if (!video && images.length > 18) throw new Error("微博单条最多 18 张图");
  const tabId = await runtime.open(HOME, true);
  await waitForSelector(tabId, 'textarea[placeholder*="分享"], textarea, [contenteditable="true"]', { visible: true, timeoutMs: 45_000 });
  const media = await runtime.loadMedia(video ? [video] : images);
  if (media.length) {
    runtime.report({ status: "uploading", stage: 1, progress: 35, message: `上传${video ? "视频" : `${images.length} 张图片`}` });
    const before = await executeInPage(tabId, () =>
      document.querySelectorAll("#homeWrap .woo-picture-img").length, []);
    if (!(await setInputFiles(tabId, 'input[type="file"]', media))) {
      throw new Error("微博媒体文件没有进入上传控件");
    }
    if (video) {
      await waitForText(tabId, "上传成功", 600_000);
    } else {
      const attached = await executeInPage(tabId, async ({ before }) => {
        const deadline = Date.now() + 180_000;
        while (Date.now() < deadline) {
          const text = document.body?.innerText ?? "";
          if (/上传失败|图片上传失败/.test(text)) return false;
          if (document.querySelectorAll("#homeWrap .woo-picture-img").length > before) return true;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return false;
      }, { before }, 185_000);
      if (!attached) throw new Error("微博图片上传未完成");
    }
  }
  runtime.report({ status: "filling", stage: 2, progress: 75, message: "填充微博正文" });
  const pasted = await pasteInto(tabId, 'textarea[placeholder*="分享"], textarea, [contenteditable="true"]', text);
  if (!pasted) throw new Error("未找到微博编辑器");
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}
