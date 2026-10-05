import { Marked } from "marked";

const obsidianMarked = new Marked({
  gfm: true,
  breaks: true,
  extensions: [
    {
      name: "obsidian-highlight",
      level: "inline",
      start(src: string) {
        return src.indexOf("==");
      },
      tokenizer(src: string) {
        const match = /^==(?=\S)([\s\S]*?\S)==/.exec(src);
        if (!match) return undefined;
        return {
          type: "obsidian-highlight",
          raw: match[0],
          tokens: this.lexer.inlineTokens(match[1] ?? ""),
        };
      },
      renderer(token) {
        return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`;
      },
    },
  ],
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 首个非代码块 H1 作为文章标题；标题在平台侧单独投递。 */
export function titleFromMarkdown(body: string, fallback: string): string {
  let inFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s{0,3}(?:```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const heading = line.match(/^ {0,3}#\s+(.+?)\s*$/);
    if (heading?.[1]) return stripInlineMarkdown(heading[1]);
  }
  return fallback;
}

/** 剥离被选为平台标题的首个 H1；其余标题都是正文结构，必须保留。 */
export function stripLeadingTitleHeading(body: string, title: string): string {
  let inFence = false;
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  for (const [index, line] of lines.entries()) {
    if (/^ {0,3}(?:```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const heading = line.match(/^ {0,3}#\s+(.+?)\s*$/);
    if (heading?.[1] && stripInlineMarkdown(heading[1]) === title) {
      return [...lines.slice(0, index), ...lines.slice(index + 1)]
        .join("\n")
        .replace(/^(?:[ \t]*\n)+/, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
  }
  return body;
}

/** 生成知乎可接受的 HTML：保留换行、GFM 样式、原始行内标签和 Obsidian 高亮。 */
export async function markdownToHtml(body: string): Promise<string> {
  return await obsidianMarked.parse(body, { gfm: true, breaks: true });
}

/** 生成纯文本平台 payload：去掉标记但保留标题文字、列表、回车和标签。 */
export function plainFromMarkdown(body: string): string {
  return body
    .replace(/^```[^\n]*\n([\s\S]*?)^```$/gm, (_, code: string) => code.replace(/\n$/, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[\[[^\]]+\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) => label?.trim() || target.trim())
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^ {0,3}#{1,6}\s+/gm, "")
    .replace(/^ {0,3}>\s?/gm, "")
    .replace(/^([ \t]*)[-*+]\s+/gm, "$1• ")
    .replace(/(?:\*\*|__)(?=\S)([\s\S]*?\S)(?:\*\*|__)/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(?=\S)([\s\S]*?\S)\*(?!\*)/g, "$1")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1")
    .replace(/==(?=\S)([\s\S]*?\S)==/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 标题里不应携带 Markdown 记号；平台标题输入框都是纯文本。 */
export function stripInlineMarkdown(value: string): string {
  return plainFromMarkdown(value);
}
