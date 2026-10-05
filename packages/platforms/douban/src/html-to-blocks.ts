/* 豆瓣正文 HTML → dwarf drafts 的 blocks/entityMap（Draft.js 形态，编辑器端是 Lexical，能直接吃）
 *
 * 真机验证（2026-10-05，探针草稿 + 编辑器恢复，详见 docs/platforms.md §2.6）：
 * - 块类型：header-one/two/three 一律恢复成平台标题（DRE-h3）；unordered-list-item / ordered-list-item /
 *   blockquote / code-block 原样保留
 * - 行内样式：BOLD / ITALIC / UNDERLINE / STRIKETHROUGH（LINE_THROUGH 同义）/ CODE / MARK（高亮）全部保留；
 *   注意高亮的样式名是 MARK，不是 HIGHLIGHT（HIGHLIGHT 会被静默丢弃）
 * - 实体：LINK（data.url）恢复成链接；atomic IMAGE 块插在段落之间可按位置恢复（图文混排位置保留）
 * 应用编辑器（Tiptap）产物词汇：p / h1-h3 / blockquote / ul / ol / li / figure.m-fig[data-asset] /
 * strong / em / u / s / del / strike / mark / code / a / br / span（#标签着色是应用侧样式，正文只保文字）
 * 解析按 Tiptap/Obsidian 产出的良构 HTML 设计；结构异常时上层回退纯文本分段，不让发布挂掉。
 */

export type HNode =
  | { kind: "text"; text: string }
  | { kind: "el"; tag: string; attrs: Record<string, string>; children: HNode[] };

export type DoubanInlineRange = { offset: number; length: number; style: string };
export type DoubanEntityRange = { key: string; offset: number; length: number };
export type DoubanLinkEntity = { type: "LINK"; mutability: "MUTABLE"; data: { url: string } };

/** 中间产物：text 项由适配器补 key/data.align 后直接进 draft_props；image 项等图片上传后落 atomic 块 */
export type DoubanBlockDraft =
  | { kind: "text"; type: string; depth: number; text: string; inlineStyleRanges: DoubanInlineRange[]; entityRanges: DoubanEntityRange[] }
  | { kind: "image"; assetId: string };

export type HtmlToBlocksResult = {
  items: DoubanBlockDraft[];
  /** 行内 LINK 实体，key 与 entityRanges 引用一致（IMAGE 实体由适配器在上传后另起 key） */
  entities: Record<string, DoubanLinkEntity>;
};

const VOID_TAGS = new Set(["br", "img", "hr", "input", "meta", "link", "source"]);

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    switch (body) {
      case "amp": return "&";
      case "lt": return "<";
      case "gt": return ">";
      case "quot": return '"';
      case "apos": return "'";
      case "nbsp": return " ";
      default: return whole;
    }
  });
}

/** 极简 HTML 解析：按良构输入设计，容忍未闭合/多余闭合标签（就近配对），不抛错 */
export function parseHtml(html: string): HNode[] {
  const root: HNode[] = [];
  const stack: Extract<HNode, { kind: "el" }>[] = [];
  const slot = () => (stack.length ? stack[stack.length - 1]!.children : root);
  const pushText = (raw: string) => {
    const text = decodeEntities(raw);
    if (text) slot().push({ kind: "text", text });
  };
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      pushText(html.slice(i));
      break;
    }
    if (lt > i) pushText(html.slice(i, lt));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>])*?)\/?>/.exec(html.slice(lt));
    if (!m) {
      pushText("<");
      i = lt + 1;
      continue;
    }
    i = lt + m[0].length;
    const closing = m[1] === "/";
    const tag = m[2]!.toLowerCase();
    const attrSrc = m[3] ?? "";
    if (closing) {
      const idx = stack.findLastIndex((n) => n.tag === tag);
      if (idx >= 0) stack.length = idx;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const am of attrSrc.matchAll(/([a-zA-Z-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s"'>]+))?/g)) {
      attrs[am[1]!.toLowerCase()] = am[3] ?? am[4] ?? am[2] ?? "";
    }
    const node: Extract<HNode, { kind: "el" }> = { kind: "el", tag, attrs, children: [] };
    slot().push(node);
    if (!VOID_TAGS.has(tag)) stack.push(node);
  }
  return root;
}

/** 行内构建器：text 追加 + 记号范围（offset/length 按 JS 字符串单位，与 Draft.js 一致） */
class InlineBuf {
  text = "";
  ranges: DoubanInlineRange[] = [];
  entityRanges: DoubanEntityRange[] = [];
  private opens: { start: number; style?: string; entityKey?: string }[] = [];

  write(s: string): void {
    this.text += s;
  }
  /** 进出一个行内记号；style 省略表示纯容器（span 等），只递归不改样式 */
  open(style?: string, entityKey?: string): void {
    this.opens.push({ start: this.text.length, style, entityKey });
  }
  close(): void {
    const top = this.opens.pop();
    if (!top) return;
    const length = this.text.length - top.start;
    if (length <= 0) return;
    if (top.style) this.ranges.push({ offset: top.start, length, style: top.style });
    if (top.entityKey) this.entityRanges.push({ key: top.entityKey, offset: top.start, length });
  }
}

const INLINE_STYLE_BY_TAG: Record<string, string> = {
  strong: "BOLD", b: "BOLD",
  em: "ITALIC", i: "ITALIC",
  u: "UNDERLINE",
  s: "STRIKETHROUGH", del: "STRIKETHROUGH", strike: "STRIKETHROUGH",
  code: "CODE",
  mark: "MARK",
};

function walkInline(nodes: HNode[], buf: InlineBuf, ctx: { entities: Record<string, DoubanLinkEntity>; seq: () => string }): void {
  for (const node of nodes) {
    if (node.kind === "text") {
      buf.write(node.text);
      continue;
    }
    const link = node.tag === "a" && node.attrs.href ? node.attrs.href : null;
    if (link) {
      const key = ctx.seq();
      ctx.entities[key] = { type: "LINK", mutability: "MUTABLE", data: { url: link } };
      buf.open(undefined, key);
      walkInline(node.children, buf, ctx);
      buf.close();
      continue;
    }
    const style = INLINE_STYLE_BY_TAG[node.tag];
    buf.open(style);
    if (node.tag === "br") buf.write("\n");
    walkInline(node.children, buf, ctx);
    buf.close();
  }
}

/** 去掉首尾空白并平移行内范围；空段落（无可见字符）返回 null */
function trimInline(buf: InlineBuf): { text: string; inlineStyleRanges: DoubanInlineRange[]; entityRanges: DoubanEntityRange[] } | null {
  const raw = buf.text;
  const leading = raw.length - raw.trimStart().length;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const trailing = raw.length - leading - trimmed.length;
  const keep = <T extends { offset: number; length: number }>(r: T): T | null => {
    const start = Math.max(r.offset, leading);
    const end = Math.min(r.offset + r.length, leading + trimmed.length);
    return end - start > 0 ? ({ ...r, offset: start - leading, length: end - start } as T) : null;
  };
  return {
    text: trimmed,
    inlineStyleRanges: buf.ranges.map(keep).filter((r): r is DoubanInlineRange => !!r),
    entityRanges: buf.entityRanges.map(keep).filter((r): r is DoubanEntityRange => !!r),
  };
}

function inlineOf(nodes: HNode[], ctx: { entities: Record<string, DoubanLinkEntity>; seq: () => string }) {
  const buf = new InlineBuf();
  walkInline(nodes, buf, ctx);
  return trimInline(buf);
}

function walkBlocks(nodes: HNode[], items: DoubanBlockDraft[], ctx: { entities: Record<string, DoubanLinkEntity>; seq: () => string }, listDepth = 0): void {
  for (const node of nodes) {
    if (node.kind === "text") {
      const t = node.text.trim();
      if (t) items.push({ kind: "text", type: "unstyled", depth: 0, text: t, inlineStyleRanges: [], entityRanges: [] });
      continue;
    }
    switch (node.tag) {
      case "h1":
      case "h2":
      case "h3": {
        const inline = inlineOf(node.children, ctx);
        if (inline) items.push({ kind: "text", type: "header-two", depth: 0, ...inline });
        break;
      }
      case "p": {
        const inline = inlineOf(node.children, ctx);
        if (inline) items.push({ kind: "text", type: "unstyled", depth: 0, ...inline });
        break;
      }
      case "blockquote": {
        const inline = inlineOf(node.children, ctx);
        if (inline) items.push({ kind: "text", type: "blockquote", depth: 0, ...inline });
        break;
      }
      case "ul":
      case "ol": {
        const type = node.tag === "ol" ? "ordered-list-item" : "unordered-list-item";
        for (const li of node.children) {
          if (li.kind !== "el") continue;
          if (li.tag === "li") {
            const inline = inlineOf(li.children.filter((c) => !(c.kind === "el" && (c.tag === "ul" || c.tag === "ol"))), ctx);
            if (inline) items.push({ kind: "text", type, depth: listDepth, ...inline });
            for (const sub of li.children) {
              if (sub.kind === "el" && (sub.tag === "ul" || sub.tag === "ol")) walkBlocks([sub], items, ctx, listDepth + 1);
            }
          } else if (li.tag === "ul" || li.tag === "ol") {
            walkBlocks([li], items, ctx, listDepth);
          }
        }
        break;
      }
      case "figure": {
        const assetId = node.attrs["data-asset"];
        if (assetId) items.push({ kind: "image", assetId });
        break;
      }
      case "hr":
      case "script":
      case "style":
        break;
      default: {
        /* div/section 等容器按内含块展开；纯文本容器退化为段落 */
        if (node.children.some((c) => c.kind === "el" && BLOCK_TAGS.has(c.tag))) {
          walkBlocks(node.children, items, ctx, listDepth);
        } else {
          const inline = inlineOf(node.children, ctx);
          if (inline) items.push({ kind: "text", type: "unstyled", depth: 0, ...inline });
        }
      }
    }
  }
}

const BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "blockquote", "ul", "ol", "figure", "div", "section", "article"]);

/** bodyHtml → 豆瓣草稿中间产物；figure 的 data-asset 对应 post.assets 里的图片素材 id */
export function htmlToDoubanBlocks(html: string): HtmlToBlocksResult {
  const entities: Record<string, DoubanLinkEntity> = {};
  let seq = 0;
  const items: DoubanBlockDraft[] = [];
  walkBlocks(parseHtml(html), items, { entities, seq: () => "l" + seq++ });
  return { items, entities };
}
