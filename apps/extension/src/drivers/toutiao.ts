import type { ExtensionJobResult } from "@tassello/shared";
import {
  articleHtml,
  coverMedia,
  figureSourceMap,
  mediaOfKind,
  plainBody,
  summaryText,
} from "../driver-utils.ts";
import {
  clearEditable,
  clickText,
  executeInPage,
  replaceEditableHtml,
  setControlValue,
  setInputFiles,
  sleepPage,
  waitForEnabledButton,
  waitForSelector,
  waitForText,
  waitForUploadIdle,
} from "../page-runtime.ts";
import type { LoadedMedia, PublishRuntime } from "../publish-runtime.ts";

const ARTICLE_URL = "https://mp.toutiao.com/profile_v4/graphic/publish";
const MICRO_POST_URL = "https://mp.toutiao.com/profile_v4/weitoutiao/publish";
const VIDEO_URL = "https://mp.toutiao.com/profile_v4/xigua/upload-video";
const AUDIO_URL = "https://mp.toutiao.com/profile_v4/audio/upload";

function charCount(value: string): number {
  return Array.from(value).length;
}

export function fitToutiaoArticleTitle(title: string): string {
  const normalized = title.trim();
  const chars = Array.from(normalized);
  if (chars.length < 2) throw new Error("头条号文章标题至少需要 2 个字");
  return chars.slice(0, 30).join("");
}

export function socialText(runtime: PublishRuntime): string {
  const title = runtime.job.snapshot.title.trim();
  const body = plainBody(runtime).trim();
  if (!body) return title;
  return title && !body.startsWith(title) ? `${title}\n\n${body}` : body;
}

async function waitForArticleSave(tabId: number): Promise<void> {
  const state = await executeInPage(tabId, async () => {
    const deadline = Date.now() + 45_000;
    const startedAt = Date.now();
    let sawBusy = false;
    while (Date.now() < deadline) {
      const text = document.body?.innerText ?? "";
      if (/草稿保存失败|保存失败/.test(text)) return "failed";
      if (/草稿保存中|保存中/.test(text)) sawBusy = true;
      if (/草稿已保存/.test(text) && (sawBusy || Date.now() - startedAt >= 2_500)) return "saved";
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return /草稿已保存/.test(document.body?.innerText ?? "") ? "saved" : "timeout";
  }, [], 50_000);
  if (state === "failed") throw new Error("头条号文章草稿保存失败");
  if (state !== "saved") throw new Error("头条号文章草稿保存超时");
}

async function openArticleImagePanel(tabId: number): Promise<void> {
  const opened = await executeInPage(tabId, () => {
    const button = Array.from(document.querySelectorAll("button.syl-toolbar-button"))
      .find((candidate) => !!candidate.querySelector('svg g[transform="translate(3.7 5)"]'));
    if (!(button instanceof HTMLElement)) return false;
    button.click();
    return true;
  }, []);
  if (!opened) throw new Error("未找到头条号文章图片入口");
}

async function uploadArticleImages(
  runtime: PublishRuntime,
  tabId: number,
  images: LoadedMedia[],
): Promise<Map<string, string>> {
  if (!images.length) return new Map();
  runtime.report({
    status: "uploading",
    stage: 1,
    progress: 30,
    message: `上传头条号文章配图 ${images.length} 张`,
  });
  await openArticleImagePanel(tabId);
  await waitForSelector(tabId, 'input[type="file"][accept="image/*"]', {
    visible: false,
    timeoutMs: 20_000,
  });
  if (!(await setInputFiles(tabId, 'input[type="file"][accept="image/*"]', images))) {
    throw new Error("头条号文章图片没有进入上传控件");
  }
  await waitForEnabledButton(tabId, ["确认", "确定", "插入"], 180_000);
  if (!(await clickText(tabId, ["确认", "确定", "插入"], { selector: "button", exact: true, timeoutMs: 10_000 }))) {
    throw new Error("头条号文章图片没有完成插入");
  }
  const sources = await executeInPage(tabId, async ({ expected }) => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const urls = Array.from(document.querySelectorAll(".ProseMirror img"))
        .filter((image) => image.closest(".pgc-img"))
        .map((image) => (image as HTMLImageElement).src)
        .filter(Boolean);
      if (urls.length >= expected) return urls;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return [] as string[];
  }, { expected: images.length }, 35_000);
  if (sources.length < images.length) throw new Error("头条号文章图片上传后没有全部进入正文");
  const remote = new Map<string, string>();
  for (const [index, image] of images.entries()) {
    const url = sources[index];
    if (!url) continue;
    remote.set(image.assetId ?? image.resolved, url);
    remote.set(image.resolved, url);
  }
  await sleepPage(1_200);
  return remote;
}

async function publishArticle(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const tabId = await runtime.open(ARTICLE_URL, true);
  await waitForSelector(tabId, 'textarea[placeholder*="文章标题"]', { visible: true, timeoutMs: 60_000 });
  await waitForSelector(tabId, ".ProseMirror", { visible: true, timeoutMs: 30_000 });
  const title = fitToutiaoArticleTitle(runtime.job.snapshot.title);
  if (!(await setControlValue(tabId, 'textarea[placeholder*="文章标题"]', title))) {
    throw new Error("头条号文章标题写入失败");
  }
  await clearEditable(tabId, ".ProseMirror");
  const images = await runtime.loadMedia(mediaOfKind(runtime, "image"));
  const remote = await uploadArticleImages(runtime, tabId, images);
  await clearEditable(tabId, ".ProseMirror");
  runtime.report({ status: "filling", stage: 2, progress: 75, message: "填充头条号文章正文" });
  if (!(await replaceEditableHtml(
    tabId,
    ".ProseMirror",
    plainBody(runtime),
    articleHtml(runtime, figureSourceMap(images, remote)),
  ))) {
    throw new Error("头条号文章正文写入失败");
  }
  await waitForArticleSave(tabId);
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}

async function publishMicroPost(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const text = socialText(runtime).trim();
  if (!text) throw new Error("微头条需要正文");
  const images = await runtime.loadMedia(mediaOfKind(runtime, "image"));
  if (images.length > 18) throw new Error("微头条一次最多 18 张图片");
  const tabId = await runtime.open(MICRO_POST_URL, true);
  await waitForSelector(tabId, ".ProseMirror", { visible: true, timeoutMs: 60_000 });
  if (!(await replaceEditableHtml(tabId, ".ProseMirror", text))) {
    throw new Error("微头条正文写入失败");
  }
  if (images.length) {
    runtime.report({
      status: "uploading",
      stage: 1,
      progress: 35,
      message: `上传微头条图片 ${images.length} 张`,
    });
    if (!(await clickText(tabId, "图片", { selector: "button", exact: true, timeoutMs: 15_000 }))) {
      throw new Error("未找到微头条图片入口");
    }
    await waitForSelector(tabId, 'input[type="file"]', { visible: false, timeoutMs: 15_000 });
    if (!(await setInputFiles(tabId, 'input[type="file"]', images))) {
      throw new Error("微头条图片没有进入上传控件");
    }
    const accepted = await executeInPage(tabId, async ({ expected }) => {
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        const text = document.body?.innerText ?? "";
        if (/上传失败|图片上传失败/.test(text)) return false;
        if (document.querySelectorAll(".ProseMirror .pgc-img img").length >= expected) return true;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      return false;
    }, { expected: images.length }, 185_000);
    if (!accepted) throw new Error("微头条图片上传未完成");
    await waitForUploadIdle(tabId, 30_000);
  }
  runtime.report({ status: "filling", stage: 2, progress: 80, message: "保存微头条草稿" });
  if (!(await clickText(tabId, "存草稿", { selector: "button", exact: true, timeoutMs: 15_000 }))) {
    throw new Error("未找到微头条存草稿按钮");
  }
  await waitForText(tabId, "保存成功", 60_000);
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}

async function publishVideo(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const video = (await runtime.loadMedia(mediaOfKind(runtime, "video")))[0];
  if (!video) throw new Error("头条号视频稿需要视频素材");
  const tabId = await runtime.open(VIDEO_URL, true);
  await waitForSelector(tabId, 'input[type="file"][accept*="video"]', {
    visible: false,
    timeoutMs: 60_000,
  });
  const blocked = await executeInPage(
    tabId,
    () => (document.body?.innerText ?? "").includes("该账号信息未完善"),
    [],
  );
  if (blocked) throw new Error("头条号账号资料未完善，请先在头条号后台完成账号信息");
  runtime.report({ status: "uploading", stage: 1, progress: 30, message: "上传头条号视频" });
  if (!(await setInputFiles(tabId, 'input[type="file"][accept*="video"]', [video]))) {
    throw new Error("头条号视频没有进入上传控件");
  }
  await waitForSelector(tabId, 'input[placeholder*="标题"], textarea[placeholder*="标题"]', {
    visible: true,
    timeoutMs: 15 * 60_000,
  });
  await waitForUploadIdle(tabId, 15 * 60_000);
  const title = fitToutiaoArticleTitle(runtime.job.snapshot.title);
  await setControlValue(tabId, 'input[placeholder*="标题"], textarea[placeholder*="标题"]', title);
  const summary = summaryText(runtime, 300);
  if (summary) {
    await setControlValue(
      tabId,
      'textarea[placeholder*="简介"], textarea[placeholder*="描述"], textarea',
      summary,
    ).catch(() => false);
  }
  runtime.report({ message: "头条号视频已上传，请核对标题、简介与封面后发布" });
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}

async function publishAudio(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const cover = coverMedia(runtime);
  if (!cover || cover.kind !== "image") throw new Error("头条号音频需要先设置一张封面");
  const title = runtime.job.snapshot.title.trim();
  if (charCount(title) < 5) throw new Error("头条号音频名称至少需要 5 个字");
  const description = summaryText(runtime, 200);
  if (charCount(description) < 5) throw new Error("头条号音频详情至少需要 5 个字");
  const [coverFile] = await runtime.loadMedia([cover]);
  if (!coverFile) throw new Error("头条号音频封面读取失败");
  const tabId = await runtime.open(AUDIO_URL, true);
  await waitForSelector(tabId, 'textarea[placeholder*="专辑名称"]', { visible: true, timeoutMs: 60_000 });
  await setControlValue(
    tabId,
    'textarea[placeholder*="专辑名称"]',
    Array.from(title).slice(0, 15).join(""),
  );
  await setControlValue(
    tabId,
    'textarea[placeholder*="专辑详情"]',
    Array.from(description).slice(0, 200).join(""),
  );
  runtime.report({ status: "uploading", stage: 1, progress: 45, message: "上传头条号音频封面" });
  await waitForSelector(tabId, 'input[type="file"][accept*="image"]', { visible: false, timeoutMs: 20_000 });
  if (!(await setInputFiles(tabId, 'input[type="file"][accept*="image"]', [coverFile]))) {
    throw new Error("头条号音频封面没有进入上传控件");
  }
  if (!(await clickText(tabId, "选择分类", { selector: "*", exact: true, timeoutMs: 10_000 }))) {
    throw new Error("未找到头条号音频分类入口");
  }
  if (!(await clickText(tabId, "其他", { selector: "*", exact: true, timeoutMs: 10_000 }))) {
    throw new Error("头条号音频分类选择失败");
  }
  runtime.report({
    message: "头条号 Web 当前加载的是专辑信息表单；请在平台内创建或选择专辑后上传音频，核对分类并发布",
  });
  return {
    status: "awaiting_confirm",
    url: null,
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}

export async function publishToutiao(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const type = runtime.job.snapshot.type;
  if (type === "article") return publishArticle(runtime);
  if (type === "image") return publishMicroPost(runtime);
  if (type === "video") return publishVideo(runtime);
  if (type === "audio") return publishAudio(runtime);
  throw new Error(`头条号不支持的内容类型：${type}`);
}
