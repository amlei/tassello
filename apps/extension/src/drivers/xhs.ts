import type { ExtensionJobResult } from "@tassello/shared";
import { coverMedia, mediaOfKind, plainBody } from "../driver-utils.ts";
import { clickText, executeInPage, pasteInto, setControlValue, setInputFiles, waitForSelector, waitForText } from "../page-runtime.ts";
import type { PublishRuntime } from "../publish-runtime.ts";

const PUBLISH_URL = "https://creator.xiaohongshu.com/publish/publish?source=official";

async function waitForCreator(tabId: number): Promise<void> {
  const loggedIn = await executeInPage(tabId, async () => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch("/api/galaxy/user/info", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        const payload = await response.json() as { code?: number; data?: unknown };
        if (response.ok && payload.code === 0 && payload.data) return true;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
  }, []);
  if (!loggedIn) throw new Error("小红书创作者中心未登录");
}

export async function publishXhs(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const type = runtime.job.snapshot.type;
  const video = runtime.job.snapshot.media.find((item) => item.kind === "video");
  const audio = runtime.job.snapshot.media.find((item) => item.kind === "audio");
  const images = mediaOfKind(runtime, "image");
  const cover = coverMedia(runtime);
  if (images.length > 18) throw new Error("小红书一篇笔记最多 18 张图");
  if (audio && !cover) throw new Error("小红书播客需要一张封面图（推荐 1:1）");
  const isArticle = type === "article" && !video && !audio && images.length === 0;
  const tabText = audio ? "发播客" : isArticle ? "写长文" : video ? "上传视频" : "上传图文";
  const tabId = await runtime.open(PUBLISH_URL, true);
  await waitForCreator(tabId);
  if (!(await clickText(tabId, tabText, { selector: "*", timeoutMs: 20_000 }))) {
    throw new Error(`未找到小红书发布入口：${tabText}`);
  }
  if (isArticle) {
    if (!(await clickText(tabId, "新的创作", { timeoutMs: 20_000 }))) {
      throw new Error("未找到小红书长文「新的创作」入口");
    }
  } else if (audio) {
    const [audioMedia, coverFile] = await runtime.loadMedia([audio, cover!]);
    runtime.report({ status: "uploading", stage: 1, progress: 30, message: "上传小红书播客音频" });
    if (!(await clickText(tabId, "上传音频", { timeoutMs: 20_000 }))) {
      throw new Error("未找到小红书播客上传入口");
    }
    await waitForSelector(tabId, 'input[type="file"][accept*=".mp3"]', { visible: false, timeoutMs: 30_000 });
    if (!(await setInputFiles(tabId, 'input[type="file"][accept*=".mp3"]', [audioMedia!]))) {
      throw new Error("小红书播客音频没有进入上传控件");
    }
    await waitForText(tabId, "去发布", 15 * 60_000);
    runtime.report({ status: "uploading", stage: 1, progress: 65, message: "设置小红书播客封面" });
    await waitForSelector(tabId, 'input[type="file"][accept*=".jpg"]', { visible: false, timeoutMs: 30_000 });
    if (!(await setInputFiles(tabId, 'input[type="file"][accept*=".jpg"]', [coverFile!]))) {
      throw new Error("小红书播客封面没有进入上传控件");
    }
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await clickText(tabId, "确定", { timeoutMs: 3_000 }).catch(() => false);
    if (!(await clickText(tabId, "去发布", { timeoutMs: 15_000 }))) {
      throw new Error("未找到小红书播客「去发布」按钮");
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  } else {
    const media = await runtime.loadMedia(video ? [video] : images);
    if (!media.length) throw new Error("小红书发布需要图片、视频或音频素材");
    runtime.report({ status: "uploading", stage: 1, progress: 35, message: `上传小红书${audio ? "播客" : video ? "视频" : "图片"}` });
    await waitForSelector(tabId, 'input[type="file"]', { visible: false, timeoutMs: 30_000 });
    if (!(await setInputFiles(tabId, 'input[type="file"]', media))) {
      throw new Error("小红书媒体文件没有进入上传控件");
    }
    await waitForText(tabId, "标题", 300_000).catch(() => undefined);
  }
  const titleSelector = isArticle ? 'textarea[placeholder*="标题"], input[placeholder*="标题"]' : 'input[placeholder*="标题"]';
  await waitForSelector(tabId, titleSelector, { visible: true, timeoutMs: 60_000 });
  const title = runtime.job.snapshot.title.trim();
  if (title && !(await setControlValue(tabId, titleSelector, title))) {
    throw new Error("小红书标题写入失败");
  }
  const body = plainBody(runtime).trim();
  if (body) {
    runtime.report({ status: "filling", stage: 2, progress: 75, message: "填充小红书正文" });
    if (!(await pasteInto(tabId, ".tiptap.ProseMirror, .ProseMirror, [contenteditable=true]", body))) {
      throw new Error("小红书正文写入失败");
    }
  }
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}
