import type { ContentType } from "@tassello/shared";

export type MediaRef = {
  raw: string;
  alt: string;
  kind: "image" | "video" | "audio";
  source: "relative" | "absolute" | "url";
  resolved: string;
  order: number;
  role?: "body" | "cover";
};

export function titleFromMarkdown(body: string, fallback: string): string {
  let inFence = false;
  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s{0,3}(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = line.match(/^ {0,3}#\s+(.+?)\s*$/);
    if (match?.[1]) return stripInlineMarkdown(match[1]);
  }
  return fallback;
}

export function stripLeadingTitle(body: string, title: string): string {
  let inFence = false;
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^ {0,3}(?:```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const match = line.match(/^ {0,3}#\s+(.+?)\s*$/);
    if (match?.[1] && stripInlineMarkdown(match[1]) === title) {
      return lines.slice(0, index).concat(lines.slice(index + 1)).join("\n").replace(/^\n+/, "").trim();
    }
  }
  return body.trim();
}

export function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(?:\*\*|__)(?=\S)([\s\S]*?\S)(?:\*\*|__)/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(?=\S)([\s\S]*?\S)\*(?!\*)/g, "$1")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1")
    .replace(/==(?=\S)([\s\S]*?\S)==/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function plainFromMarkdown(markdown: string): string {
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

export function unsupportedMarkdownFeatures(markdown: string): string[] {
  const findings = new Set<string>();
  if (/\[\[[^\]]+\]\]/.test(markdown)) findings.add("不支持 Obsidian wiki link");
  if (/!\[\[[^\]]+\]\]/.test(markdown)) findings.add("不支持 Obsidian wiki embed");
  if (/^>\s*\[![^\]]+\]/m.test(markdown)) findings.add("不支持 Obsidian callout");
  if (/\s\^[a-zA-Z0-9-]+\s*$/m.test(markdown)) findings.add("不支持 Obsidian block id");
  if (/```(?:dataview|query)\b/i.test(markdown)) findings.add("不支持 Dataview");
  if (/<!--|<\/?[A-Za-z][^>]*>/.test(markdown)) findings.add("不支持原始 HTML");
  return [...findings];
}

function mediaKind(path: string): MediaRef["kind"] | null {
  const clean = path.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  if (/\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(clean)) return "image";
  if (/\.(avi|m4v|mkv|mov|mp4|webm)$/.test(clean)) return "video";
  if (/\.(aac|flac|m4a|mp3|ogg|wav)$/.test(clean)) return "audio";
  return null;
}

export function extractMedia(markdown: string): MediaRef[] {
  const media: MediaRef[] = [];
  const imageRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of markdown.matchAll(imageRe)) {
    const raw = match[0];
    const alt = match[1] ?? "";
    const target = match[2] ?? "";
    const kind = mediaKind(target);
    if (!kind) continue;
    const source = /^https?:\/\//i.test(target)
      ? "url"
      : target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target)
        ? "absolute"
        : "relative";
    media.push({ raw, alt, kind, source, resolved: target, order: media.length });
  }
  return media;
}

export function normalizeMediaOrder(type: ContentType, media: MediaRef[]): MediaRef[] {
  if (type === "article" || type === "image") return media.filter((item) => item.kind === "image");
  /* 视频/音频的图片是平台封面等附加素材，不能被主媒体类型过滤掉。 */
  return media.filter((item) => item.kind === type || item.kind === "image");
}
