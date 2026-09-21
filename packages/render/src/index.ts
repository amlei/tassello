/* @tassello/render —— 正文渲染：纯文本 ↔ 平台无关 HTML（移植原型 bits.jsx 的 mdToHtml 逻辑） */

/** 正文里的插图记号：![说明](asset://id)，独占一行时落成图块 */
export const ASSET_IMG_RE = /^!\[([^\]]*)\]\(asset:\/\/([^)]+)\)$/;

export type RenderAsset = { id: string; color?: string | null; path?: string | null };

export function escHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** #标签 包成 span（颜色随内容类型），字号字重都不动 */
export function wrapTags(escaped: string, color: string): string {
  return escaped.replace(/(#[^\s#，。！？；：,.!?;:]+)/g, (m) =>
    '<span class="m-tag" style="color:' + color + ";background:" + color + '1A">' + m + "</span>",
  );
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
    out.push("<p>" + buf.map((l) => wrapTags(escHtml(l), color)).join("<br>") + "</p>");
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

/** 平台回执链接（与原型 platformLink 一致） */
export function platformLink(prefix: string, token: string): string {
  return (prefix || "example.com/") + token;
}

export function newToken(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}
