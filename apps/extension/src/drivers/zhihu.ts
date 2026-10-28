import type { ExtensionJobResult } from "@tassello/shared";
import { articleHtml, mediaOfKind, plainBody, publishIntent } from "../driver-utils.ts";
import { executeInPage, setControlValue, setInputFiles, waitForSelector, waitForText } from "../page-runtime.ts";
import type { LoadedMedia } from "../publish-runtime.ts";
import type { PublishRuntime } from "../publish-runtime.ts";
import { md5Base64 } from "../md5.ts";

const WRITE_URL = "https://zhuanlan.zhihu.com/write";
const PIN_DRAFT_URL = "https://www.zhihu.com/creator/manage/creation/draft?type=pin";

type ZhihuImage = {
  id: string;
  url: string;
  originalUrl: string;
  watermark: string;
  watermarkUrl: string;
  width: number;
  height: number;
};

type ZhihuImageCreateResponse = {
  upload_file?: { image_id?: string; object_key?: string; state?: number };
  upload_token?: { access_id?: string; access_key?: string; access_token?: string };
};

export function parseZhihuImageCache(value: unknown): ZhihuImage | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<ZhihuImage>;
  if (
    typeof payload.id !== "string"
    || typeof payload.url !== "string"
    || typeof payload.originalUrl !== "string"
    || typeof payload.width !== "number"
    || typeof payload.height !== "number"
  ) {
    return null;
  }
  return {
    id: payload.id,
    url: payload.url,
    originalUrl: payload.originalUrl,
    watermark: typeof payload.watermark === "string" ? payload.watermark : "watermark",
    watermarkUrl: typeof payload.watermarkUrl === "string" ? payload.watermarkUrl : payload.url,
    width: payload.width,
    height: payload.height,
  };
}

async function uploadImage(runtime: PublishRuntime, tabId: number, image: LoadedMedia, scope: "pin" | "article"): Promise<ZhihuImage> {
  const query = {
    platformId: "zhihu",
    accountUid: runtime.job.snapshot.accountUid ?? "zhihu",
    contentHash: image.contentHash,
    kind: "image",
    scope,
  };
  const cached = await runtime.lookupUpload(query);
  if (cached) {
    const cachedImage = parseZhihuImageCache(cached.payload);
    if (cachedImage) return cachedImage;
    await runtime.forgetUpload(query).catch(() => undefined);
  }

  const imageHash = md5Base64(image.base64);
  const uploaded = await executeInPage(tabId, async ({ base64, name, mime, scope, imageHash }) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const file = new File([bytes], name, { type: mime });
    const createResponse = await fetch("https://api.zhihu.com/images", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_hash: imageHash, source: scope }),
    });
    const responseText = await createResponse.text();
    let created: ZhihuImageCreateResponse | null = null;
    try {
      created = JSON.parse(responseText) as ZhihuImageCreateResponse;
    } catch {}
    if (!createResponse.ok || !created?.upload_file?.image_id) {
      throw new Error(`知乎图片上传初始化失败（HTTP ${createResponse.status}）：${responseText.slice(0, 180)}`);
    }
    const imageId = created.upload_file.image_id;
    if (created.upload_file.object_key && created.upload_file.state !== 1) {
      const token = created.upload_token;
      if (!token?.access_id || !token.access_key || !token.access_token) throw new Error("知乎图片 STS 凭据缺失");
      const sdk = (globalThis as typeof globalThis & {
        OSS?: new (options: Record<string, unknown>) => { put(key: string, file: File, options: { mime: string }): Promise<unknown> };
      }).OSS;
      let Client = sdk;
      if (!Client) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://unpkg.zhimg.com/ali-oss@6.8.0/dist/aliyun-oss-sdk.min.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("加载知乎 OSS SDK 失败"));
          document.head.appendChild(script);
        });
        Client = (globalThis as typeof globalThis & {
          OSS?: new (options: Record<string, unknown>) => { put(key: string, file: File, options: { mime: string }): Promise<unknown> };
        }).OSS;
      }
      if (!Client) throw new Error("知乎 OSS SDK 不可用");
      const client = new Client({
        secure: true,
        cname: true,
        endpoint: "https://zhihu-pics-upload.zhimg.com",
        bucket: "zhihu-pics",
        accessKeyId: token.access_id,
        accessKeySecret: token.access_key,
        stsToken: token.access_token,
      });
      await client.put(created.upload_file.object_key, file, { mime: file.type });
      const ack = await fetch(`https://api.zhihu.com/images/${imageId}/uploading_status`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_result: "success" }),
      });
      if (!ack.ok) throw new Error(`知乎图片上传状态上报失败（HTTP ${ack.status}）`);
    }
    let info: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await fetch(`https://api.zhihu.com/images/${imageId}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      info = await response.json() as Record<string, unknown>;
      if (info.status === "success") break;
      if (info.status !== "processing") throw new Error(`知乎图片处理失败：${JSON.stringify(info).slice(0, 180)}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (info?.status !== "success") throw new Error("知乎图片处理超时");
    const bitmap = await createImageBitmap(file);
    return {
      id: imageId,
      url: String(info.src || ""),
      originalUrl: String(info.original_src || info.src || ""),
      watermark: String(info.watermark || "watermark"),
      watermarkUrl: String(info.watermark_src || info.src || ""),
      width: bitmap.width,
      height: bitmap.height,
    };
  }, {
    base64: image.base64,
    name: image.fileName || "image.png",
    mime: image.mime,
    scope,
    imageHash,
  }, 120_000);
  await runtime.saveUpload(query, {
    id: uploaded.id,
    url: uploaded.url,
    payload: uploaded as unknown as Record<string, unknown>,
  });
  return uploaded;
}

function stripFigures(html: string): string {
  return html.replace(/<figure\b[\s\S]*?<\/figure>/gi, "");
}

async function publishPin(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const tabId = await runtime.open(WRITE_URL, false);
  const images = await runtime.loadMedia(mediaOfKind(runtime, "image"));
  runtime.report({ status: "uploading", stage: 1, progress: 20, message: images.length ? "上传知乎想法图片" : "准备想法内容" });
  const uploads: ZhihuImage[] = [];
  for (const [index, image] of images.entries()) {
    uploads.push(await uploadImage(runtime, tabId, image, "pin"));
    runtime.report({ stage: 1, progress: 20 + Math.round(((index + 1) / images.length) * 30) });
  }
  const title = runtime.job.snapshot.title.trim();
  const text = plainBody(runtime).trim();
  if (!text) throw new Error("知乎想法需要正文");
  const html = text.split(/\n+/).map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("");
  const intent = publishIntent(runtime);
  runtime.report({ status: "filling", stage: 2, progress: 65, message: "提交知乎想法" });
  const response = await executeInPage(tabId, async ({ title, text, html, uploads, intent }) => {
    const cookie = document.cookie.match(/_xsrf=([^;]+)/)?.[1] ?? "";
    const data: Record<string, unknown> = {
      publish: { traceId: `${Date.now()},${crypto.randomUUID()}` },
      commentsPermission: { comment_permission: "all" },
      extra_info: { view_permission: "all", publisher: "pc" },
      draft: { disabled: intent === "draft" ? 0 : 1 },
      hybrid: { html, textLength: text.length },
      textLength: text.length,
    };
    if (title) data.title = { title };
    if (uploads.length) {
      data.media = {
        medias: (uploads as Array<{
          width: number;
          height: number;
          url: string;
          originalUrl: string;
          watermark: string;
          watermarkUrl: string;
        }>).map((item) => ({
          image: {
            width: item.width,
            height: item.height,
            url: item.url,
            originalUrl: item.originalUrl,
            watermark: item.watermark,
            watermarkUrl: item.watermarkUrl,
          },
        })),
      };
    }
    const endpoint = intent === "draft"
      ? "https://api.zhihu.com/content/drafts"
      : "https://www.zhihu.com/api/v4/content/publish";
    const result = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-requested-with": "fetch", "x-xsrftoken": cookie },
      body: JSON.stringify({ action: "pin", data }),
    });
    return { status: result.status, body: (await result.text()).slice(0, 5000) };
  }, { title, text, html, uploads, intent });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`知乎想法提交失败（HTTP ${response.status}）：${response.body.slice(0, 180)}`);
  }
  const id = response.body.match(/"id"\s*:\s*"?(\d{10,25})"?/)?.[1] ?? null;
  return intent === "draft"
    ? { status: "awaiting_confirm", url: PIN_DRAFT_URL, pageUrl: PIN_DRAFT_URL, tabId, error: null }
    : { status: "success", url: id ? `https://www.zhihu.com/pin/${id}` : null, pageUrl: runtime.job.snapshot.platformId, tabId, error: null };
}

async function publishArticle(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const tabId = await runtime.open(WRITE_URL, false);
  const images = await runtime.loadMedia(mediaOfKind(runtime, "image"));
  const uploaded: ZhihuImage[] = [];
  for (const [index, image] of images.entries()) {
    runtime.report({ status: "uploading", stage: 1, progress: 20 + Math.round(((index + 1) / images.length) * 20), message: `上传知乎文章图片 ${index + 1}/${images.length}` });
    uploaded.push(await uploadImage(runtime, tabId, image, "article"));
  }
  let cursor = 0;
  let html = stripFigures(articleHtml(runtime));
  html = html.replace(/<\/p>/g, () => images[cursor] ? `</p><p><img src="${uploaded[cursor++]?.url ?? ""}" data-original-src="${uploaded[cursor - 1]?.originalUrl ?? ""}" data-rawwidth="${uploaded[cursor - 1]?.width ?? 0}" data-rawheight="${uploaded[cursor - 1]?.height ?? 0}"></p>` : "</p>");
  if (cursor !== images.length) {
    html = images.map((_image, index) => `<p><img src="${uploaded[index]?.url ?? ""}" data-original-src="${uploaded[index]?.originalUrl ?? ""}" data-rawwidth="${uploaded[index]?.width ?? 0}" data-rawheight="${uploaded[index]?.height ?? 0}"></p>`).join("") + html;
  }
  const title = runtime.job.snapshot.title.trim();
  if (!title) throw new Error("知乎文章需要标题");
  const intent = publishIntent(runtime);
  runtime.report({ status: "filling", stage: 2, progress: 50, message: "创建知乎专栏草稿" });
  const draftId = await executeInPage(tabId, async ({ title }) => {
    const xsrf = document.cookie.match(/_xsrf=([^;]+)/)?.[1] ?? "";
    const response = await fetch("https://zhuanlan.zhihu.com/api/articles/drafts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-requested-with": "fetch", "x-xsrftoken": xsrf },
      body: JSON.stringify({ title, delta_time: 0, can_reward: true }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`知乎建草稿失败（HTTP ${response.status}）：${text.slice(0, 160)}`);
    return text.match(/"id"\s*:\s*"(\d+)"/)?.[1] ?? "";
  }, { title });
  if (!draftId) throw new Error("知乎草稿 ID 缺失");
  await executeInPage(tabId, async ({ draftId, html }) => {
    const xsrf = document.cookie.match(/_xsrf=([^;]+)/)?.[1] ?? "";
    const response = await fetch(`https://zhuanlan.zhihu.com/api/articles/${draftId}/draft`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-requested-with": "fetch", "x-xsrftoken": xsrf },
      body: JSON.stringify({ content: html, table_of_contents: false, delta_time: 1, can_reward: true }),
    });
    if (!response.ok) throw new Error(`知乎草稿正文保存失败（HTTP ${response.status}）`);
  }, { draftId, html });
  if (intent === "draft") {
    return { status: "awaiting_confirm", url: `https://zhuanlan.zhihu.com/p/${draftId}/edit`, pageUrl: WRITE_URL, tabId, error: null };
  }
  runtime.report({ status: "filling", stage: 3, progress: 85, message: "发布知乎文章" });
  const articleId = await executeInPage(tabId, async ({ draftId, title, html }) => {
    const xsrf = document.cookie.match(/_xsrf=([^;]+)/)?.[1] ?? "";
    const payload = {
      action: "article",
      data: {
        publish: { traceId: `${Date.now()},${crypto.randomUUID()}` },
        extra_info: { publisher: "pc", pc_business_params: JSON.stringify({
          commentPermission: "anyone",
          disclaimer_type: "none",
          disclaimer_status: "close",
          table_of_contents_enabled: false,
          content: html,
          title,
          commercial_report_info: { commercial_types: [] },
          commercial_zhitask_bind_info: null,
          canReward: true,
        }) },
        draft: { disabled: 1, id: draftId, isPublished: false },
        commentsPermission: { comment_permission: "anyone" },
        creationStatement: { disclaimer_type: "none", disclaimer_status: "close" },
        contentsTables: { table_of_contents_enabled: false },
        commercialReportInfo: { isReport: 0 },
        appreciate: { can_reward: true, tagline: "真诚赞赏，手留余香" },
        hybridInfo: {},
        hybrid: { html, textLength: html.replace(/<[^>]+>/g, "").length },
        title: { title },
      },
    };
    const response = await fetch("https://www.zhihu.com/api/v4/content/publish", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-requested-with": "fetch", "x-xsrftoken": xsrf },
      body: JSON.stringify(payload),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`知乎文章发布失败（HTTP ${response.status}）：${body.slice(0, 160)}`);
    return body.match(/"id"\s*:\s*"(\d+)"/)?.[1] ?? draftId;
  }, { draftId, title, html });
  return { status: "success", url: `https://zhuanlan.zhihu.com/p/${articleId}`, pageUrl: WRITE_URL, tabId, error: null };
}

async function publishVideo(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const video = (await runtime.loadMedia(mediaOfKind(runtime, "video")))[0];
  if (!video) throw new Error("知乎视频草稿需要视频文件");
  const tabId = await runtime.open("https://www.zhihu.com/zvideo/upload-video", true);
  await waitForSelector(tabId, 'input[type="file"][accept*="video"], input[type="file"][accept*=".mp4"]', { visible: false, timeoutMs: 30_000 });
  if (!(await setInputFiles(tabId, 'input[type="file"][accept*="video"], input[type="file"][accept*=".mp4"]', [video]))) {
    throw new Error("知乎视频没有进入上传控件");
  }
  runtime.report({ status: "uploading", stage: 1, progress: 40, message: "上传知乎视频，等待平台转码" });
  await waitForSelector(tabId, 'textarea[name="title"]', { visible: true, timeoutMs: 300_000 });
  if (!(await setControlValue(tabId, 'textarea[name="title"]', runtime.job.snapshot.title))) {
    throw new Error("知乎视频标题写入失败");
  }
  return {
    status: "awaiting_confirm",
    url: "https://www.zhihu.com/zvideo/upload-video",
    pageUrl: await runtime.currentUrl(tabId),
    tabId,
    error: null,
  };
}

export async function publishZhihu(runtime: PublishRuntime): Promise<ExtensionJobResult["result"]> {
  const type = runtime.job.snapshot.type;
  if (type === "video") return publishVideo(runtime);
  if (type === "image") return publishPin(runtime);
  return publishArticle(runtime);
}
