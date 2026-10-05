export type ParsedImageEmbed = {
  kind: "wiki" | "markdown";
  linkpath: string;
  alt: string;
};

const WIKI_EMBED = /!\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;
const MARKDOWN_EMBED = /!\[([^\]]*)\]\(\s*([^)]*?)\s*\)/g;

function decodeLinkpath(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

/** 解析 Markdown 图片目标，兼容 Obsidian 的尖括号路径、未编码空格和标题。 */
function parseMarkdownTarget(target: string): { linkpath: string; title: string } {
  const value = target.trim();
  const angle = /^<(.+)>$/.exec(value);
  if (angle?.[1]) return { linkpath: angle[1].trim(), title: "" };

  const quotedTitle = /\s+("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|&quot;[\s\S]*?&quot;|&apos;[\s\S]*?&apos;)$/.exec(value);
  const linkpath = quotedTitle ? value.slice(0, quotedTitle.index).trim() : value;
  const title = quotedTitle
    ? (quotedTitle[1] ?? "").replace(/^["'&]+|["']+$/g, "").trim()
    : "";
  return { linkpath, title };
}

/** 按正文出现顺序解析 wiki 和 Markdown 图片；外链由调用方过滤。 */
export function parseImageEmbeds(body: string): ParsedImageEmbed[] {
  const result: ParsedImageEmbed[] = [];

  for (const match of body.matchAll(WIKI_EMBED)) {
    result.push({
      kind: "wiki",
      linkpath: decodeLinkpath(match[1] ?? ""),
      alt: (match[2] ?? "").trim(),
    });
  }

  for (const match of body.matchAll(MARKDOWN_EMBED)) {
    const { linkpath, title } = parseMarkdownTarget(match[2] ?? "");
    if (!linkpath) continue;
    result.push({
      kind: "markdown",
      linkpath: decodeLinkpath(linkpath),
      alt: (match[1] ?? "").trim() || title,
    });
  }

  return result;
}
