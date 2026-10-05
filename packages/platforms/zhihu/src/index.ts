/* @tassello/platform-zhihu —— 知乎适配器：HTTP 接口通道（想法直发 + 专栏直发）
 *
 * 通道选型与真机结论（2026-10-02，详见 NOTES.md，可并入 docs/platforms.md §2）：
 * - verify：GET https://www.zhihu.com/api/v4/me（页面上下文 fetch，带 cookie，干净 JSON，无需签名）
 * - 想法：POST /api/v4/content/publish（action=pin）。图片先走 POST /api/images + OSS PUT，
 *   再用 media.medias 提交给 pin；只需 cookie + _xsrf cookie 作 x-xsrftoken 头，
 *   x-zse-96/x-zst-81 签名头实测非强制。回执 https://www.zhihu.com/pin/<id>。
 * - 文章：zhuanlan 域三步直发 ——
 *     1) POST https://zhuanlan.zhihu.com/api/articles/drafts   {title, delta_time:0, can_reward:true} → {id}
 *     2) PATCH https://zhuanlan.zhihu.com/api/articles/<id>/draft {content, table_of_contents:false, ...}
 *     3) POST https://www.zhihu.com/api/v4/content/publish（action=article，data.draft.id=草稿id）
 *   → 回执 https://zhuanlan.zhihu.com/p/<id>；第 3 步失败则停留在草稿（needsManualConfirm）。
 *   本地图片先走 POST /api/images + OSS PUT，并替换正文中的 <img> src。
 * - 视频：打开官方上传页，DOM.setFileInputFiles 注入视频；等待知乎 OSS 分片上传完成并自动保存
 *   为想法视频草稿，返回 needsManualConfirm=true。
 * - 老接口已死：POST /api/v4/pins（400 Missing argument content，真实端点已迁到 content/publish）、
 *   zhuanlan /api/posts/drafts（404，已迁到 /api/articles/drafts）
 *
 * 运行时走 @tassello/cdp 共享池（ctx.runPage("zhihu", ...)，应用专用 profile）。图片上传用页面
 * fetch/OSS SDK；视频使用官方上传页的文件输入并等待草稿自动保存。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AdapterPublishOptions, PlatformAdapter, PostDraft, AdapterCtx, StageReporter, PublishResult, PublishIntent } from "@tassello/platform-core";
import type { CdpLike } from "@tassello/platform-core";

type CdpConnection = CdpLike;
/** 页面上下文表达式里使用 document；Node 类型环境只需为宿主表达式声明最小形状。 */
declare const document: { cookie: string };
import { getPlatformMeta } from "@tassello/platform-core";
import { evaluateScalar } from "@tassello/cdp";

export const zhihuProfileSchema = z.object({
  uid: z.string(),
  name: z.string().nullable().optional(),
  headline: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  isOrg: z.boolean().nullable().optional(),
  urlToken: z.string().nullable().optional(),
});
export type ZhihuProfile = z.infer<typeof zhihuProfileSchema>;

export const ZHIHU_CREATOR_URL = "https://www.zhihu.com/creator";
/** zhuanlan 域页面（提供专栏接口的 fetch 上下文，避开跨域） */
export const ZHIHU_WRITE_URL = "https://zhuanlan.zhihu.com/write";
/** 想法回执链接前缀：https://www.zhihu.com/pin/<id> */
export const ZHIHU_PIN_URL = "https://www.zhihu.com/pin/";
/** 文章回执链接前缀：https://zhuanlan.zhihu.com/p/<id> */
export const ZHIHU_ARTICLE_URL = "https://zhuanlan.zhihu.com/p/";
/** 视频上传编辑器；浏览器负责选择封面、字段校验与草稿自动保存 */
export const ZHIHU_UPLOAD_VIDEO_URL = "https://www.zhihu.com/zvideo/upload-video";

type ZhihuImageUpload = {
  id: string;
  url: string;
  originalUrl: string;
  watermark: string;
  watermarkUrl: string;
  width: number;
  height: number;
};

type ZhihuVideoDraft = {
  draftId: string;
  videoId: string;
  coverUrl: string;
  title: string;
};

/** 页面里统一的 fetch 封装前缀：取 _xsrf cookie 作 x-xsrftoken（写操作必需） */
const XSRF = `(globalThis.document?.cookie.match(/_xsrf=([^;]+)/) || [])[1] || ""`;

/** /api/v4/me 响应里用到的字段（snake_case，见 NOTES.md §2） */
type MeFields = {
  id?: number | string;
  name?: string;
  headline?: string;
  avatar_url?: string;
  is_org?: boolean;
  url_token?: string;
};

type PublishApiResp = { code?: number; message?: string; data?: { result?: string } };

/** 从 content/publish 的 result 字符串里抠 id（result 是转义过的 JSON 字符串） */
function extractId(resp: PublishApiResp): string | null {
  const raw = resp.data?.result;
  if (!raw) return null;
  const m = raw.match(/"id"\s*:\s*"(\d+)"/);
  return m?.[1] ?? null;
}

/** 等页面就绪且已登录（/api/v4/me 200） */
async function waitForLogin(
  cdp: Parameters<typeof evaluateScalar>[0],
  sessionId: string,
  timeoutMs = 30_000,
): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    try {
      const r = await evaluateScalar<{ status: number }>(
        cdp,
        sessionId,
        `(async () => {
          try {
            const r = await fetch("https://www.zhihu.com/api/v4/me", { credentials: "include", headers: { Accept: "application/json" } });
            return JSON.parse(JSON.stringify({ status: r.status }));
          } catch { return JSON.parse(JSON.stringify({ status: 0 })); }
        })()`,
        { timeoutMs: 15_000 },
      );
      if (r.status === 200) return true;
    } catch {}
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((res) => setTimeout(res, 1_500));
  }
}

/** 正文 → 段落 HTML（与编辑器产物一致：<p> 一段一个） */
function toHtml(text: string): string {
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `<p>${s}</p>`)
    .join("");
}

/** 正文 → 纯文本（算 textLength） */
function toText(text: string): string {
  return text.replace(/\n+/g, "").trim();
}

type ZhihuChannel = "article" | "pin";

function resolveZhihuOptions(options?: AdapterPublishOptions): {
  intent: PublishIntent;
  channel?: ZhihuChannel;
} {
  const channel = options?.channel;
  const normalizedChannel: ZhihuChannel | undefined = channel === "pin" || channel === "article"
    ? channel
    : undefined;
  return {
    intent: options?.intent ?? "auto",
    channel: normalizedChannel,
  };
}

export const zhihuAdapter: PlatformAdapter<ZhihuProfile> = {
  meta: getPlatformMeta("zhihu")!,

  account: {
    profileSchema: zhihuProfileSchema,

    async verify(_acct, ctx) {
      ctx.log("zhihu.verify.start");
      try {
        const r = await ctx.runPage("zhihu", { url: ZHIHU_CREATOR_URL, keepOpen: false, activate: false }, async (cdp, sid) => {
          if (!(await waitForLogin(cdp, sid))) return { status: 0, data: null };
          return evaluateScalar<{ status: number; data: MeFields | null; err?: string }>(
            cdp,
            sid,
            `(async () => {
              try {
                const r = await fetch("https://www.zhihu.com/api/v4/me", { credentials: "include", headers: { Accept: "application/json" } });
                let data = null;
                try { data = await r.json(); } catch {}
                return JSON.parse(JSON.stringify({ status: r.status, data }));
              } catch (e) {
                return JSON.parse(JSON.stringify({ status: 0, data: null, err: String(e) }));
              }
            })()`,
            { timeoutMs: 20_000 },
          );
        });
        const me = r.data as MeFields | null;
        if (r.status !== 200 || !me?.id) {
          return { state: "fail", failReason: "知乎登录态已失效，请重新登录" };
        }
        ctx.log("zhihu.verify.ok", { uid: String(me.id) });
        return {
          state: "ok",
          profile: {
            uid: String(me.id),
            name: me.name ?? null,
            headline: me.headline ?? null,
            avatarUrl: me.avatar_url ?? null,
            isOrg: me.is_org ?? null,
            urlToken: me.url_token ?? null,
          },
          name: me.name ?? null,
          uid: String(me.id),
          avatarUrl: me.avatar_url ?? null,
        };
      } catch (e) {
        return { state: "fail", failReason: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  async publish(
    post: PostDraft,
    _acct,
    ctx: AdapterCtx,
    onStage: StageReporter,
    options?: AdapterPublishOptions,
  ): Promise<PublishResult> {
    if (post.type === "video") {
      const video = post.assets.find((asset) => asset.kind === "video" && asset.path);
      if (!video) throw new Error("知乎视频草稿需要视频文件");
      const title = (post.title || "").trim();
      const result = await ctx.runPage("zhihu", {
        url: ZHIHU_UPLOAD_VIDEO_URL, keepOpen: true, activate: true,
      }, async (cdp, sessionId) => uploadZhihuVideoDraft(cdp, sessionId, video.path, title, onStage));
      return {
        url: ZHIHU_UPLOAD_VIDEO_URL,
        needsManualConfirm: true,
        receipt: { draftId: result.draftId, videoId: result.videoId },
      };
    }

    const config = resolveZhihuOptions(options);
    const channel = config.channel ?? (post.type === "image" ? "pin" : "article");
    if (channel === "pin") return publishPin(post, ctx, onStage, config.intent);
    return publishArticle(post, ctx, onStage, config.intent);
  },
};

/* ---------- 想法（贴图）：POST /api/v4/content/publish（action=pin）接口直发 ---------- */

function imageMime(pathname: string): string {
  const ext = path.extname(pathname).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".avif") return "image/avif";
  if (ext === ".heic" || ext === ".heif") return "image/heic";
  return "image/png";
}

async function uploadZhihuImage(
  cdp: CdpLike,
  sessionId: string,
  assetPath: string,
  source: "article" | "pin",
): Promise<ZhihuImageUpload> {
  const bytes = readFileSync(assetPath);
  const base64 = bytes.toString("base64");
  const hash = createHash("md5").update(bytes).digest("hex");
  const fileName = path.basename(assetPath);
  const mime = imageMime(assetPath);
  const expression = `(async () => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (char) => char.charCodeAt(0));
    const file = new File([bytes], ${JSON.stringify(fileName)}, { type: ${JSON.stringify(mime)} });
    if (!window.OSS) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.crossOrigin = "";
        script.src = "https://unpkg.zhimg.com/ali-oss@6.8.0/dist/aliyun-oss-sdk.min.js";
        script.onload = () => resolve(null);
        script.onerror = () => reject(new Error("加载知乎 OSS SDK 失败"));
        document.head.appendChild(script);
      });
    }
    if (!window.OSS) throw new Error("知乎 OSS SDK 不可用");
    const createResponse = await fetch("https://api.zhihu.com/images", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_hash: ${JSON.stringify(hash)}, source: ${JSON.stringify(source)} }),
    });
    const created = await createResponse.json();
    if (!createResponse.ok) throw new Error(\`知乎图片上传状态创建失败（HTTP \${createResponse.status}）\`);
    const uploadFile = created.upload_file;
    const uploadToken = created.upload_token;
    if (!uploadFile?.image_id) throw new Error("知乎图片上传状态缺少 image_id");
    if (!uploadFile.object_key) {
      let existing = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        existing = await (await fetch(\`https://api.zhihu.com/images/\${uploadFile.image_id}\`, {
          credentials: "include", headers: { "Content-Type": "application/json" },
        })).json();
        if (existing?.status === "success") break;
        if (existing?.status !== "processing") throw new Error(\`知乎已有图片处理失败：\${JSON.stringify(existing).slice(0, 200)}\`);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (existing?.status !== "success") throw new Error("知乎图片已存在但处理超时");
      const bitmap = await createImageBitmap(file);
      return {
        id: String(uploadFile.image_id), url: existing.src,
        originalUrl: existing.original_src || existing.src,
        watermark: existing.watermark || "watermark",
        watermarkUrl: existing.watermark_src || existing.src,
        width: bitmap.width, height: bitmap.height,
      };
    }
    if (uploadFile.state !== 1) {
      if (!uploadToken) throw new Error("知乎图片上传缺少 STS 凭据");
      const client = new window.OSS({
        secure: true, cname: true,
        endpoint: "https://zhihu-pics-upload.zhimg.com",
        bucket: "zhihu-pics",
        accessKeyId: uploadToken.access_id,
        accessKeySecret: uploadToken.access_key,
        stsToken: uploadToken.access_token,
      });
      await client.put(uploadFile.object_key, file, { mime: file.type });
      const statusResponse = await fetch(\`https://api.zhihu.com/images/\${uploadFile.image_id}/uploading_status\`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_result: "success" }),
      });
      if (!statusResponse.ok) throw new Error(\`知乎图片上传状态上报失败（HTTP \${statusResponse.status}）\`);
    }
    let info = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await fetch(\`https://api.zhihu.com/images/\${uploadFile.image_id}\`, {
        credentials: "include", headers: { "Content-Type": "application/json" },
      });
      info = await response.json();
      if (info.status === "success") break;
      if (info.status !== "processing") throw new Error(\`知乎图片处理失败：\${JSON.stringify(info).slice(0, 200)}\`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (info?.status !== "success") throw new Error("知乎图片处理超时");
    const bitmap = await createImageBitmap(file);
    return {
      id: String(uploadFile.image_id),
      url: info.src,
      originalUrl: info.original_src || info.src,
      watermark: info.watermark || "watermark",
      watermarkUrl: info.watermark_src || info.src,
      width: bitmap.width,
      height: bitmap.height,
    };
  })()`;
  return await evaluateScalar<ZhihuImageUpload>(cdp, sessionId, expression, { timeoutMs: 90_000 });
}

function isLocalZhihuImageSource(source: string): boolean {
  return !/^https?:\/\//i.test(source);
}

function replaceLocalZhihuImages(
  html: string,
  assets: PostDraft["assets"],
  uploads: ZhihuImageUpload[],
): string {
  if (uploads.length < assets.length) throw new Error("知乎文章图片上传数量不足");
  let cursor = 0;
  const replaced = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const source = tag.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const value = source?.[1] ?? source?.[2];
    if (!value || !isLocalZhihuImageSource(value)) return tag;
    const upload = uploads[cursor++];
    if (!upload) throw new Error("知乎文章图片上传数量不足");
    return tag.replace(value, upload.url)
      .replace(/(\sdata-original-src\s*=\s*)(?:"[^"]*"|'[^']*')/i, `$1"${upload.originalUrl}"`)
      .replace(/(\sdata-rawwidth\s*=\s*)(?:"[^"]*"|'[^']*')/i, `$1"${upload.width}"`)
      .replace(/(\sdata-rawheight\s*=\s*)(?:"[^"]*"|'[^']*')/i, `$1"${upload.height}"`);
  });
  if (cursor !== assets.length) throw new Error(`知乎文章图片占位数量不匹配：正文 ${cursor} 张，资产 ${assets.length} 张`);
  return replaced;
}

async function uploadZhihuVideoDraft(
  cdp: CdpLike,
  sessionId: string,
  assetPath: string,
  title: string,
  onStage: StageReporter,
): Promise<ZhihuVideoDraft> {
  onStage({ stage: 1, progress: 10, message: "连接知乎视频上传编辑器" });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = await evaluateScalar<boolean>(cdp, sessionId, `location.hostname === "www.zhihu.com" && !!document.querySelector('input[type="file"][accept*=".mp4"]')`).catch(() => false);
    if (ready) break;
    if (attempt === 29) throw new Error("知乎视频上传入口加载失败");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const documentResponse = await cdp.send("DOM.getDocument", {}, { sessionId });
  const documentRoot = (documentResponse as { root?: { nodeId?: number } }).root?.nodeId;
  if (!documentRoot) throw new Error("知乎视频上传编辑器 DOM 不可用");
  const inputResponse = await cdp.send("DOM.querySelectorAll", {
    nodeId: documentRoot,
    selector: 'input[type="file"][accept*=".mp4"],input[type="file"][accept*="video"]',
  }, { sessionId });
  const nodeIds = (inputResponse as { nodeIds?: number[] }).nodeIds ?? [];
  if (!nodeIds.length) throw new Error("未找到知乎视频上传文件输入");
  onStage({ stage: 1, progress: 20, message: "上传视频文件" });
  await cdp.send("DOM.setFileInputFiles", { files: [assetPath], nodeId: nodeIds[0]! }, { sessionId });
  const normalizedTitle = title || path.basename(assetPath, path.extname(assetPath));
  await evaluateScalar<boolean>(cdp, sessionId, `(() => {
    const editor = document.querySelector('textarea[name="title"]');
    if (!editor) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(editor, ${JSON.stringify(normalizedTitle)});
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`).catch(() => false);
  onStage({ stage: 1, progress: 50, message: "等待知乎视频转码与草稿保存" });
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const drafts = await evaluateScalar<ZhihuVideoDraft[]>(cdp, sessionId, `(async () => {
      const response = await fetch("https://www.zhihu.com/content/drafts?action=pin&offset=0&limit=20", {
        credentials: "include", headers: { Accept: "application/json" },
      });
      const payload = await response.json();
      return (payload.data || []).map((item) => {
        let plugin = {};
        try { plugin = JSON.parse(item.plugin || "{}"); } catch {}
        const videos = (item.result?.content || []).filter((part) => part.type === "video");
        const video = videos[0] || {};
        return {
          draftId: String(item.content_id || item.result?.id || ""),
          videoId: String(video.video_id || ""),
          coverUrl: video.thumbnail || "",
          title: plugin.title?.title || "",
        };
      }).filter((item) => item.videoId);
    })()`, { timeoutMs: 20_000 }).catch(() => [] as ZhihuVideoDraft[]);
    const matched = drafts.find((draft) => draft.title === normalizedTitle) ?? drafts[0];
    if (matched) {
      onStage({ stage: 3, progress: 100, message: "视频已上传并保存为知乎想法草稿" });
      return matched;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("知乎视频上传后未找到草稿");
}

async function publishPin(
  post: PostDraft,
  ctx: AdapterCtx,
  onStage: StageReporter,
  intent: PublishIntent,
): Promise<PublishResult> {
  const title = (post.title || "").trim();
  const body = (post.body || "").trim();
  if (!title && !body) throw new Error("知乎想法需要正文内容");
  const plain = toText(body);
  if (plain.length > 3000) throw new Error(`知乎想法正文过长（${plain.length} > 3000 字）`);
  const html = toHtml(body);
  const images = post.assets.filter((asset) => asset.kind === "image" && asset.path);

  ctx.log("zhihu.publish.pin.start", { len: plain.length, images: images.length, intent });
  onStage({ stage: 1, progress: 20, message: images.length ? "上传知乎想法图片" : "调用知乎想法接口" });

  const result = await ctx.runPage(
    "zhihu",
    { url: ZHIHU_WRITE_URL, keepOpen: false, activate: false },
    async (cdp, sessionId) => {
      if (!(await waitForLogin(cdp, sessionId))) throw new Error("知乎登录态已失效，请重新登录");
      const uploads: ZhihuImageUpload[] = [];
      for (const [index, image] of images.entries()) {
        onStage({ stage: 1, progress: 20 + Math.round(((index + 1) / images.length) * 20), message: `上传想法图片 ${index + 1}/${images.length}` });
        uploads.push(await uploadZhihuImage(cdp, sessionId, image.path, "pin"));
      }
      const media = uploads.length ? {
        medias: uploads.map((upload) => ({
          image: {
            width: upload.width,
            height: upload.height,
            url: upload.url,
            originalUrl: upload.originalUrl,
            watermark: upload.watermark,
            watermarkUrl: upload.watermarkUrl,
          },
        })),
      } : undefined;
      const buildPayload = (draftDisabled: number) => {
        const data: Record<string, unknown> = {
          publish: { traceId: `${Date.now()},${crypto.randomUUID()}` },
          commentsPermission: { comment_permission: "all" },
          extra_info: { view_permission: "all", publisher: "pc" },
          draft: { disabled: draftDisabled },
          hybrid: { html, textLength: html.replace(/<[^>]+>/g, "").length },
          textLength: html.replace(/<[^>]+>/g, "").length,
        };
        if (title) data.title = { title };
        if (media) data.media = media;
        return { action: "pin", data };
      };
      const draftDisabled = intent === "draft" ? 0 : 1;
      const endpoint = intent === "draft"
        ? "https://api.zhihu.com/content/drafts"
        : "https://www.zhihu.com/api/v4/content/publish";
      const payload = buildPayload(draftDisabled);
      return await evaluateScalar<{ kind: "draft" | "publish"; status: number; body: string; data?: PublishApiResp | null }>(
        cdp,
        sessionId,
        `(async () => {
          try {
            const payload = ${JSON.stringify(payload)};
            const response = await fetch(${JSON.stringify(endpoint)}, {
              method: "POST", credentials: "include",
              headers: {
                "Content-Type": "application/json",
                "x-requested-with": "fetch",
                "x-xsrftoken": (document.cookie.match(/_xsrf=([^;]+)/) || [])[1] || "",
              },
              body: JSON.stringify(payload),
            });
            const body = (await response.text()).slice(0, 5000);
            let data = null;
            try { data = JSON.parse(body); } catch {}
            return JSON.parse(JSON.stringify({ kind: ${JSON.stringify(intent)}, status: response.status, body, data }));
          } catch (error) {
            return JSON.parse(JSON.stringify({ kind: ${JSON.stringify(intent)}, status: 0, body: String(error), data: null }));
          }
        })()`,
        { timeoutMs: 45_000 },
      );
    },
  );

  if (result.kind === "draft") {
    const draftId = result.body.match(/"id"\s*:\s*"?(\d{10,25})"?/)?.[1];
    if (result.status < 200 || result.status >= 300 || !draftId) {
      throw new Error(`知乎想法草稿创建失败（HTTP ${result.status}）：${result.body.slice(0, 180)}`);
    }
    ctx.log("zhihu.publish.pin.draft.ok", { draftId });
    onStage({ stage: 3, progress: 100, message: "想法草稿已创建；请检查后手动发布" });
    return { url: "https://www.zhihu.com/creator/manage/creation/draft?type=pin", needsManualConfirm: true, receipt: { draftId } };
  }

  const pinId = extractId(result.data ?? {});
  if (result.status !== 200 || (result.data as PublishApiResp | null)?.code !== 0 || !pinId) {
    const message = (result.data as PublishApiResp | null)?.message || result.body.slice(0, 200);
    ctx.log("zhihu.publish.pin.fail", { status: result.status, message });
    throw new Error(`知乎想法发布失败（HTTP ${result.status}）：${message}`);
  }
  const url = ZHIHU_PIN_URL + pinId;
  ctx.log("zhihu.publish.pin.ok", { pinId, url });
  onStage({ stage: 3, progress: 100, message: `想法已发布：${url}` });
  return { url, needsManualConfirm: false, receipt: { pinId } };
}

/* ---------- 文章：zhuanlan 草稿接口 + content/publish（action=article）直发 ---------- */

async function publishArticle(
  post: PostDraft,
  ctx: AdapterCtx,
  onStage: StageReporter,
  intent: PublishIntent,
): Promise<PublishResult> {
  const title = (post.title || "").trim();
  if (!title) throw new Error("知乎文章需要标题");
  let html = (post.bodyHtml || "").trim() || toHtml(post.body || "");
  if (!html.replace(/<[^>]+>/g, "").trim()) throw new Error("知乎文章需要正文内容");
  const images = post.assets.filter((asset) => asset.kind === "image" && asset.path);

  ctx.log("zhihu.publish.article.start", { titleLen: title.length, images: images.length, intent });
  if (images.length) {
    onStage({ stage: 1, progress: 20, message: "上传知乎文章图片" });
    const uploads = await ctx.runPage("zhihu", {
      url: ZHIHU_WRITE_URL, keepOpen: false, activate: false,
    }, async (cdp, sessionId) => {
      if (!(await waitForLogin(cdp, sessionId))) throw new Error("知乎登录态已失效，请重新登录");
      const uploaded: ZhihuImageUpload[] = [];
      for (const [index, image] of images.entries()) {
        onStage({ stage: 1, progress: 20 + Math.round(((index + 1) / images.length) * 20), message: `上传文章图片 ${index + 1}/${images.length}` });
        uploaded.push(await uploadZhihuImage(cdp, sessionId, image.path, "article"));
      }
      return uploaded;
    });
    html = replaceLocalZhihuImages(html, images, uploads);
  }
  onStage({ stage: 0, progress: 30, message: "创建知乎专栏草稿" });

  const r = await ctx.runPage("zhihu", { url: ZHIHU_WRITE_URL, keepOpen: false, activate: false }, async (cdp, sid) => {
    if (!(await waitForLogin(cdp, sid))) throw new Error("知乎登录态已失效，请重新登录");

    // 1. 建草稿（zhuanlan 域，裸 fetch + xsrf）
    const created = await evaluateScalar<{ status: number; body: string; err?: string }>(
      cdp,
      sid,
      `(async () => {
        try {
          const r = await fetch("https://zhuanlan.zhihu.com/api/articles/drafts", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json", "x-requested-with": "fetch", "x-xsrftoken": ${XSRF} },
            body: JSON.stringify({ title: ${JSON.stringify(title)}, delta_time: 0, can_reward: true }),
          });
          return JSON.parse(JSON.stringify({ status: r.status, body: (await r.text()).slice(0, 2000) }));
        } catch (e) {
          return JSON.parse(JSON.stringify({ status: 0, body: "", err: String(e) }));
        }
      })()`,
      { timeoutMs: 30_000 },
    );
    const draftId = String((created.body.match(/"id"\s*:\s*"(\d+)"/) || [])[1] || "");
    if (created.status !== 200 || !draftId) {
      return { draftId: "", articleId: "", msg: `建草稿失败（HTTP ${created.status}）：${created.err || created.body.slice(0, 200)}`, stoppedDraft: false };
    }
    ctx.log("zhihu.publish.article.draft", { draftId });

    // 2. 存正文（PATCH draft）
    const patched = await evaluateScalar<{ status: number }>(
      cdp,
      sid,
      `(async () => {
        const r = await fetch("https://zhuanlan.zhihu.com/api/articles/${draftId}/draft", {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json", "x-requested-with": "fetch", "x-xsrftoken": ${XSRF} },
          body: JSON.stringify({ content: ${JSON.stringify(html)}, table_of_contents: false, delta_time: 1, can_reward: true }),
        });
        return JSON.parse(JSON.stringify({ status: r.status }));
      })()`,
      { timeoutMs: 30_000 },
    );
    if (patched.status !== 200) {
      return { draftId, articleId: "", msg: `草稿正文保存失败（HTTP ${patched.status}）`, stoppedDraft: false };
    }
    if (intent === "draft") {
      return { draftId, articleId: "", msg: "", stoppedDraft: true };
    }
    onStage({ stage: 1, progress: 70, message: "调用知乎发布接口" });

    // 3. 发布（www 域 content/publish，action=article；从 zhuanlan 页面 fetch 实测可跨域）
    const pub = await evaluateScalar<{ status: number; data: PublishApiResp | null; err?: string }>(
      cdp,
      sid,
      `(async () => {
        try {
          const payload = { action: "article", data: {
            publish: { traceId: String(Date.now()) + "," + crypto.randomUUID() },
            extra_info: { publisher: "pc", pc_business_params: JSON.stringify({
              commentPermission: "anyone", disclaimer_type: "none", disclaimer_status: "close",
              table_of_contents_enabled: false, content: ${JSON.stringify(html)}, title: ${JSON.stringify(title)},
              commercial_report_info: { commercial_types: [] }, commercial_zhitask_bind_info: null, canReward: true,
            }) },
            draft: { disabled: 1, id: "${draftId}", isPublished: false },
            commentsPermission: { comment_permission: "anyone" },
            creationStatement: { disclaimer_type: "none", disclaimer_status: "close" },
            contentsTables: { table_of_contents_enabled: false },
            commercialReportInfo: { isReport: 0 },
            appreciate: { can_reward: true, tagline: "真诚赞赏，手留余香" },
            hybridInfo: {},
            hybrid: { html: ${JSON.stringify(html)}, textLength: ${JSON.stringify(html.replace(/<[^>]+>/g, "").length)} },
            title: { title: ${JSON.stringify(title)} },
          } };
          const r = await fetch("https://www.zhihu.com/api/v4/content/publish", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json", "x-requested-with": "fetch", "x-xsrftoken": ${XSRF} },
            body: JSON.stringify(payload),
          });
          const t = await r.text();
          let data = null;
          try { data = JSON.parse(t); } catch {}
          return JSON.parse(JSON.stringify({ status: r.status, data }));
        } catch (e) {
          return JSON.parse(JSON.stringify({ status: 0, data: null, err: String(e) }));
        }
      })()`,
      { timeoutMs: 30_000 },
    );
    const articleId = extractId(pub.data ?? {}) || draftId;
    return { draftId, articleId, msg: pub.status === 200 && pub.data?.code === 0 ? "" : `发布失败（HTTP ${pub.status}）：${pub.data?.message || pub.err || ""}`, stoppedDraft: false };
  });

  if (r.draftId && intent === "draft") {
    const url = `${ZHIHU_ARTICLE_URL}${r.draftId}/edit`;
    ctx.log("zhihu.publish.article.draft-intent", { draftId: r.draftId });
    onStage({ stage: 3, progress: 100, message: "文章草稿已创建；请检查后手动发布" });
    return { url, needsManualConfirm: true, receipt: { draftId: r.draftId } };
  }
  if (r.draftId && !r.msg) {
    const url = ZHIHU_ARTICLE_URL + r.articleId;
    ctx.log("zhihu.publish.article.ok", { articleId: r.articleId, draftId: r.draftId, url });
    onStage({ stage: 3, progress: 100, message: `文章已发布：${url}` });
    return { url, needsManualConfirm: false, receipt: { articleId: r.articleId, draftId: r.draftId } };
  }
  // 发布失败但草稿已建成 → 只存草稿，回执给草稿编辑链接，人工点发布
  if (r.draftId) {
    const url = `${ZHIHU_ARTICLE_URL}${r.draftId}/edit`;
    ctx.log("zhihu.publish.article.draft-only", { draftId: r.draftId, msg: r.msg });
    onStage({ stage: 3, progress: 100, message: `文章已存草稿，请到知乎后台点发布：${url}（${r.msg}）` });
    return { url, needsManualConfirm: true, receipt: { draftId: r.draftId } };
  }
  ctx.log("zhihu.publish.article.fail", { msg: r.msg });
  throw new Error(`知乎文章发布失败：${r.msg}`);
}
