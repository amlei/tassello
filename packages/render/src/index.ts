/* @tassello/render —— 正文渲染：纯文本 ↔ 平台无关 HTML（移植原型 bits.jsx 的 mdToHtml 逻辑） */
import { Marked } from "marked";

/** 正文里的插图记号：![说明](asset://id)，独占一行时落成图块 */
export const ASSET_IMG_RE = /^!\[([^\]]*)\]\(asset:\/\/([^)]+)\)$/;

export type RenderAsset = { id: string; color?: string | null; path?: string | null };

export function escHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escAttr(s: string): string {
  return escHtml(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeHref(value: string): string | null {
  const href = value.trim();
  if (!href) return null;
  if (/^(?:https?:|mailto:|tel:)/i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return null;
  return href;
}

/** #标签 包成 span（颜色随内容类型），字号字重都不动 */
export function wrapTags(escaped: string, color: string): string {
  return escaped.replace(/(#[^\s#，。！？；：,.!?;:]+)/g, (m) =>
    '<span class="m-tag" style="color:' + color + ";background:" + color + '1A">' + m + "</span>",
  );
}

/** ==高亮== 包成 mark（荧光笔效果），底色随主题换（见应用侧 globals.css） */
export function wrapHighlights(escaped: string): string {
  return escaped.replace(/==([^=\n]+)==/g, '<mark class="m-mark">$1</mark>');
}

/** 正文里的图块：编辑器里不可编辑 figure，预览里是同一份 HTML。
 *  有真实文件的素材渲染 <img>；无 path 的历史素材回退色块 */
export function figHtml(id: string, alt: string, color: string, path?: string | null): string {
  const img = path
    ? '<img class="m-fig-img" src="/api/assets/' + id + '/raw" alt="' + escHtml(alt || "配图") + '" draggable="false">'
    : "";
  return (
    '<figure class="m-fig" contenteditable="false" data-asset="' + id + '" data-alt="' + escHtml(alt || "配图") +
    '" style="background:' + color + '">' + img + '<span class="m-fig-lb">' + escHtml(alt || "配图") +
    '</span><button type="button" class="m-fig-del" aria-label="移除这张图">×</button></figure>'
  );
}

/** 纯文本正文 → HTML：段落 + #标签 + 独占一行的插图 */
export function mdToHtml(body: string, color: string, assets?: RenderAsset[]): string {
  const list = assets ?? [];
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    out.push("<p>" + buf.map((l) => wrapHighlights(wrapTags(escHtml(l), color))).join("<br>") + "</p>");
    buf = [];
  };
  for (const line of (body || "").split("\n")) {
    const m = line.trim().match(ASSET_IMG_RE);
    if (m) {
      flush();
      const im = list.find((x) => x.id === m[2]);
      out.push(figHtml(m[2]!, m[1] || "配图", im?.color || "var(--onda-hover)", im?.path));
    } else if (!line.trim()) {
      flush();
    } else {
      buf.push(line);
    }
  }
  flush();
  return out.join("");
}

/** 列表摘要：跳过插图记号和空行，取第一段真正的文字 */
export function plainSummary(body: string): string {
  const lines = (body || "").split("\n").map((s) => s.trim()).filter(Boolean);
  return lines.find((l) => !ASSET_IMG_RE.test(l)) || "";
}

export type MarkdownImage = {
  href: string;
  title: string | null;
  alt: string;
};

/** CommonMark + GFM → HTML。原始 HTML 在 Vault 解析阶段拒绝，不会进入这里。 */
export function markdownToHtml(
  markdown: string,
  options: { renderImage?: (image: MarkdownImage) => string } = {},
): string {
  const instance = new Marked({
    async: false,
    breaks: false,
    gfm: true,
    renderer: {
      image(token) {
        if (options.renderImage) return options.renderImage({
          href: token.href,
          title: token.title ?? null,
          alt: token.text,
        });
        const href = safeHref(token.href);
        const title = token.title ? ` title="${escAttr(token.title)}"` : "";
        return href
          ? `<img src="${escAttr(href)}" alt="${escAttr(token.text)}"${title}>`
          : escHtml(token.text);
      },
      link(token) {
        const label = this.parser.parseInline(token.tokens);
        const href = safeHref(token.href);
        if (!href) return label;
        const title = token.title ? ` title="${escAttr(token.title)}"` : "";
        return `<a href="${escAttr(href)}"${title}>${label}</a>`;
      },
      html(token) {
        return escHtml(token.text);
      },
    },
  });
  return (instance.parse(markdown) as string)
    .replace(/<p>(<figure[\s\S]*?<\/figure>)<\/p>/g, "$1");
}

/** Markdown → 平台纯文本。保留段落、列表符号和链接文字，去掉标记与媒体。 */
export function markdownToPlain(markdown: string): string {
  return markdown
    .replace(/^```[^\n]*\n([\s\S]*?)^```$/gm, (_, code: string) => code.replace(/\n$/, ""))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/^ {0,3}#{1,6}\s+/gm, "")
    .replace(/^ {0,3}>\s?/gm, "")
    .replace(/^([ \t]*)[-*+]\s+/gm, "$1• ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(?:\*\*|__)(?=\S)([\s\S]*?\S)(?:\*\*|__)/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(?=\S)([\s\S]*?\S)\*(?!\*)/g, "$1")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1")
    .replace(/==(?=\S)([\s\S]*?\S)==/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^ {0,3}(?:---+|\*\*\*+)\s*$/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 平台回执链接（与原型 platformLink 一致） */
export function platformLink(prefix: string, token: string): string {
  return (prefix || "example.com/") + token;
}

export function newToken(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}
