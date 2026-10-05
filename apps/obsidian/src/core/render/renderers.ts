import { effectiveContentType, PLATFORM_BY_ID, type Finding, type PlatformId, type ResolvedAsset, type SourceDraft } from "../types";

export type PlatformPayload =
  | { kind: "weibo-post"; body: string; imagePaths: string[] }
  | { kind: "weibo-article"; title: string; body: string; lead: string }
  | { kind: "zhihu-article"; title: string; html: string }
  | { kind: "zhihu-pin"; body: string }
  | { kind: "xhs-note"; title: string; body: string; imagePaths: string[] }
  | { kind: "xhs-article"; title: string; body: string }
  | { kind: "thought"; platformId: "jike" | "douban" | "x"; title: string; body: string; imagePaths: string[] };

export type RenderedPlatform = {
  payload: PlatformPayload;
  findings: Finding[];
};

export function renderForPlatform(source: SourceDraft, platformId: PlatformId): RenderedPlatform {
  if (platformId === "weibo") return renderWeibo(source);
  if (platformId === "zhihu") return renderZhihu(source);
  if (platformId === "xhs") return renderXhs(source);
  return renderThought(source, platformId);
}

function removeLocalImageSyntax(body: string): string {
  return body
    .replace(/!\[\[[^\]]+\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 纯文本编辑器既保留单回车，也保留段落间的空行语义。 */
function compactPlainText(body: string): string {
  return removeLocalImageSyntax(body)
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.split("\n").map((line) => line.trim()).join("\n"))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function plainToPreviewHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function titleToPreviewHtml(title: string): string {
  return `<h1>${escapeHtml(title)}</h1>`;
}

/** 微博话题是两端包裹语法：Obsidian 的 #tag 要发布成 #tag#。 */
function toWeiboTopics(body: string): string {
  return body.replace(
    /(^|[\s（(【])#([^\s#，。！？；：,.!?;:]+)(?=$|[\s）)】，。！？；：,.!?;:])/gu,
    (_, prefix: string, topic: string) => `${prefix}#${topic}#`,
  );
}

function renderWeibo(source: SourceDraft): RenderedPlatform {
  const findings: Finding[] = [];
  // 微博 composer 没有标题字段；文章的 H1 必须并入正文，不能因为“标题已剥离”而丢失。
  const content = compactPlainText(source.plain || source.body);
  const postBody = source.type === "article"
    ? compactPlainText(`${source.title}\n\n${content}`)
    : content;
  const imagePaths = source.assets.map((asset) => asset.absolutePath);

  if (!postBody && imagePaths.length === 0) findings.push({ level: "error", message: "微博正文和图片都为空" });
  if (imagePaths.length > 18) findings.push({ level: "error", message: `微博最多支持 18 张图片，当前 ${imagePaths.length} 张` });

  // 微博一律走首页 composer 直发（普通微博），不使用头条文章草稿链路。
  return { payload: { kind: "weibo-post", body: toWeiboTopics(postBody), imagePaths }, findings };
}

function renderZhihu(source: SourceDraft): RenderedPlatform {
  const findings: Finding[] = [];

  if (source.type === "image" && source.assets.length === 0) {
    // 知乎“想法”通道仅支持纯文字；这里通过空 assets 自然表达。
  }

  if (source.type === "article") {
    let html = source.html;
    const localImageCount = (html.match(/<img\b/g) ?? []).length;
    // MVP 的知乎文章草稿先支持文字排版；本地图片上传协议另行接入，避免把 file:// 或 app:// 引用发到平台。
    html = html.replace(/<figure[\s\S]*?<\/figure>/gi, "").replace(/<img\b[^>]*>/gi, "");
    if (localImageCount > 0) {
      findings.push({ level: "warning", message: `知乎文章草稿暂不上传 ${localImageCount} 张本地图片；请保存草稿后到知乎编辑器补图` });
    }
    const textLength = html.replace(/<[^>]+>/g, "").trim().length;
    if (!textLength) findings.push({ level: "error", message: "知乎文章正文为空" });
    if (source.title.length > 100) findings.push({ level: "warning", message: "知乎标题较长，可能被平台截断" });
    return {
      payload: { kind: "zhihu-article", title: source.title, html },
      findings,
    };
  }

  const body = compactPlainText(source.plain || source.body);
  if (!body) findings.push({ level: "error", message: "知乎想法正文为空" });
  if (body.length > 3000) findings.push({ level: "error", message: `知乎想法长度 ${body.length} 字，超过 3000 字上限` });
  if (source.assets.length) findings.push({ level: "warning", message: "知乎想法 MVP 只发送文字，附件不会上传" });
  return { payload: { kind: "zhihu-pin", body }, findings };
}

function renderXhs(source: SourceDraft): RenderedPlatform {
  const findings: Finding[] = [];
  // 长文和图文 payload 都进入纯文本编辑器；必须使用已转换的 plain，而不是残留 Markdown 记号的 body。
  const plain = compactPlainText(source.plain || source.body);
  const imagePaths = source.assets.map((asset) => asset.absolutePath);

  if (source.type === "article") {
    if (!plain) findings.push({ level: "error", message: "小红书长文正文为空" });
    if (source.title.length > 64) findings.push({ level: "error", message: `小红书长文标题 ${source.title.length} 字，超过 64 字上限` });
    return {
      payload: { kind: "xhs-article", title: source.title, body: plain },
      findings,
    };
  }

  if (source.title.length > 20) findings.push({ level: "warning", message: "标题超过 20 字，平台通常会截断" });
  if (plain.length > 1000) findings.push({ level: "error", message: `小红书正文 ${plain.length} 字，超过 1000 字上限` });
  if (!imagePaths.length) findings.push({ level: "error", message: "小红书图文笔记需要至少 1 张本地图片" });
  if (imagePaths.length > 18) findings.push({ level: "error", message: `小红书最多 18 张图片，当前 ${imagePaths.length} 张` });
  return { payload: { kind: "xhs-note", title: source.title, body: plain, imagePaths }, findings };
}

function renderThought(source: SourceDraft, platformId: PlatformId): RenderedPlatform {
  const findings: Finding[] = [];
  const body = compactPlainText(source.plain || source.body);
  const imagePaths = source.assets.map((asset) => asset.absolutePath);
  const name = platformId === "jike" ? "即刻" : platformId === "douban" ? "豆瓣" : "X";

  if (!body && !imagePaths.length) findings.push({ level: "error", message: `${name}正文和图片都为空` });
  if (platformId === "x" && imagePaths.length > 4) findings.push({ level: "error", message: `X 最多支持 4 张图片，当前 ${imagePaths.length} 张` });
  if (platformId === "jike" && imagePaths.length > 9) findings.push({ level: "warning", message: `即刻图文通常最多 9 张图片，当前 ${imagePaths.length} 张` });

  return {
    payload: {
      kind: "thought",
      platformId: platformId as "jike" | "douban" | "x",
      title: platformId === "x" ? "" : source.title,
      body,
      imagePaths,
    },
    findings,
  };
}

export function previewHtmlForPlatform(source: SourceDraft, platformId: PlatformId): string {
  const rendered = renderForPlatform(source, platformId);
  const payload = rendered.payload;
  const attachments = attachmentsToPreviewHtml(source.assets);
  if (payload.kind === "weibo-post") return `${attachments}${plainToPreviewHtml(payload.body || "(无文字)")}`;
  if (payload.kind === "zhihu-article") {
    // 知乎标题是 API 的独立字段；预览必须同时呈现它，用户才不会误以为正文漏了 H1。
    return `${attachments}${titleToPreviewHtml(payload.title)}${payload.html || "<p>(无内容)</p>"}`;
  }
  if (payload.kind === "xhs-note") {
    return `${attachments}${titleToPreviewHtml(payload.title)}${plainToPreviewHtml(payload.body || "(无文字)")}`;
  }
  if (payload.kind === "xhs-article") {
    return `${attachments}${titleToPreviewHtml(payload.title)}${plainToPreviewHtml(payload.body)}`;
  }
  if (payload.kind === "thought") {
    const heading = payload.title ? titleToPreviewHtml(payload.title) : "";
    return `${attachments}${heading}${plainToPreviewHtml(payload.body || "(无文字)")}`;
  }
  if (payload.kind === "zhihu-pin") return `${attachments}${plainToPreviewHtml(payload.body)}`;
  return `${attachments}${plainToPreviewHtml(payload.body)}`;
}

export function platformSupportsType(platformId: PlatformId, type: SourceDraft["type"]): boolean {
  const effectiveType = effectiveContentType(platformId, type);
  return PLATFORM_BY_ID.get(platformId)?.supports.includes(effectiveType) ?? false;
}

function attachmentsToPreviewHtml(assets: ResolvedAsset[]): string {
  const images = assets.filter((asset) => asset.kind === "image");
  if (!images.length) return "";
  const items = images.map((asset) =>
    `<figure class="attachment"><img src="${escapeHtml(asset.resourcePath)}" alt="${escapeHtml(asset.alt)}"><figcaption>${escapeHtml(asset.alt)}</figcaption></figure>`,
  ).join("");
  return `<div class="attachments" data-role="preview-attachments">${items}</div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
