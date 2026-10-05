/* editor —— 编辑器：Tiptap 内核 + 写作区 + 实时预览 + 自动/手动保存。
   内核从手写 contentEditable/execCommand 迁到 Tiptap（ProseMirror），
   序列化格式不变：bodyHtml（富文本）+ body（纯文本）双列照旧落库，
   旧数据、手机预览列、微信/微博发布通道均无需改动。 */
"use client";

import React from "react";
import { TYPE_META, type PostDTO } from "@tassello/shared";
import { useLongPressReorder } from "./dnd";
import { AudioBar, fmtTime } from "./bits";
import { Button, Dropdown, Popover } from "@heroui/react";
import { PreviewColumn } from "./phone";
import {
  Add, ArrowLeft, ChevronDown, ChevronUp, Send, X,
  Bold, Italic, Underline, List, Minus, Link2, Image as ImageIcon, Undo, Redo,
} from "reicon-react";
import { Heading as HeadingIcon, Strikethrough, Highlighter, Quote, ListOrdered } from "lucide-react";
import { Editor, EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { Placeholder } from "@tiptap/extensions";
import type { DOMOutputSpec, Mark as PMark, MarkType } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView as PMEditorView } from "@tiptap/pm/view";

export const ASSET_IMG_RE = /^!\[([^\]]*)\]\(asset:\/\/([^)]+)\)$/;

/* ---------- 序列化辅助（旧数据的兜底渲染仍走这套字符串模板） ---------- */
function escHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/* reicon「X」outline 的同款 path：序列化富文本里挂不了 React 组件，内联保持视觉一致 */
const X_PATH = "M18.4697 19.5303C18.7626 19.8232 19.2374 19.8232 19.5303 19.5303C19.8232 19.2374 19.8232 18.7626 19.5303 18.4697L13.0607 12L19.5303 5.53033C19.8232 5.23744 19.8232 4.76256 19.5303 4.46967C19.8232 4.17678 18.7626 4.17678 18.4697 4.46967L12 10.9393L5.53033 4.46967C5.23744 4.17678 5.23744 4.17678 5.53033 4.46967C4.17678 4.76256 4.17678 5.23744 4.46967 5.53033L10.9393 12L4.46967 18.4697C4.17678 18.7626 4.17678 19.2374 4.46967 19.5303C4.17678 19.8232 5.23744 19.8232 5.53033 19.5303L12 13.0607L18.4697 19.5303Z";
/* contenteditable="false"：标签是完整 token —— 预览/发布侧保持原子，不会被继续吞进文字里 */
function wrapTags(escaped: string, color: string): string {
  return escaped.replace(/(#[^\s#，。！？；：,.!?;:]+)/g, (m) =>
    `<span class="m-tag" contenteditable="false" style="color:${color};background:${color}1A">${m}</span>`);
}
/* ==高亮== 包成 mark（荧光笔效果），底色随主题换（见 globals.css） */
function wrapHighlights(escaped: string): string {
  return escaped.replace(/==([^=\n]+)==/g, '<mark class="m-mark">$1</mark>');
}
function figHtml(id: string, alt: string, color: string, path?: string | null): string {
  const img = path
    ? `<img class="m-fig-img" src="/api/assets/${id}/raw" alt="${escHtml(alt || "配图")}" draggable="false">`
    : "";
  return (
    `<figure class="m-fig" contenteditable="false" data-asset="${id}" data-alt="${escHtml(alt || "配图")}" style="background:${color}">` +
    img +
    `<span class="m-fig-lb">${escHtml(alt || "配图")}</span>` +
    `<button type="button" class="m-fig-del" aria-label="移除这张图"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${X_PATH}" fill="currentColor"/></svg></button></figure>`
  );
}
function mdToHtmlLocal(body: string, color: string, assets: { id: string; color?: string | null; path?: string | null }[]): string {
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
      const im = assets.find((x) => x.id === m[2]);
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
/* 富文本 → 纯文本（body 列）：顶层块取 innerText，配图还原成 asset:// 记号。
   与旧实现同一算法，微博纯文本发布、列表摘要、字数统计都吃这份 */
function htmlToPlain(root: HTMLElement): string {
  const blocks: string[] = [];
  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === 1 && node instanceof HTMLElement && node.classList.contains("m-fig")) {
      blocks.push(`![${node.getAttribute("data-alt") || "配图"}](asset://${node.getAttribute("data-asset")})`);
      return;
    }
    const text = (("innerText" in node ? (node as HTMLElement).innerText : node.textContent) || "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text) blocks.push(text);
  });
  return blocks.join("\n\n");
}

/* ---------- Tiptap 自定义扩展 ---------- */
const TAG_SRC = "[^\\s#，。！？；：,.!?;:]+";
const TAG_RE = new RegExp(`#${TAG_SRC}`, "g");
const TAG_FULL_RE = new RegExp(`^#${TAG_SRC}$`);
/* 标签记号的收尾字符：后面跟着这些（或到头）才算一个完整标签 */
const TAG_STOP_RE = /[\s#，。！？；：,.!?;:]/;
/* 行内记号转换的黑名单：文字已带这些 mark 就不再转（对齐旧行内规则的宿主黑名单） */
const INLINE_MARK_SKIP = ["tag", "link", "highlight", "code", "bold", "italic", "strike"];

/* 话题标签 mark：#标签 → span.m-tag，颜色随稿子类型注入 style */
const TagMark = Mark.create({
  name: "tag",
  /* 非延伸：紧挨着标签往后打字不会被吞进标签里 */
  inclusive: false,
  addOptions() {
    return { color: "var(--onda-hover)" };
  },
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.style.color || null,
        renderHTML: (attributes) => {
          const color = attributes.color as string | null;
          return color ? { style: `color:${color};background:${color}1A` } : {};
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: "span.m-tag" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-type": "tag", class: "m-tag" }, HTMLAttributes), 0];
  },
});

/* 配图块：figure.m-fig[data-asset]，正文里存 asset:// 引用，真实文件经 /api/assets/[id]/raw */
const AssetFigure = Node.create({
  name: "assetFigure",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      assetId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-asset"),
        renderHTML: (attributes) => ({ "data-asset": attributes.assetId }),
      },
      alt: {
        default: "配图",
        parseHTML: (element) => element.getAttribute("data-alt") || "配图",
        renderHTML: (attributes) => ({ "data-alt": attributes.alt }),
      },
      color: {
        default: "var(--onda-hover)",
        parseHTML: (element) => element.style.background || null,
        renderHTML: (attributes) => ({ style: `background:${attributes.color}` }),
      },
      hasPath: {
        default: false,
        parseHTML: (element) => !!element.querySelector("img"),
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "figure[data-asset]" }];
  },
  renderHTML({ node }): DOMOutputSpec {
    const { assetId, alt, color, hasPath } = node.attrs as { assetId: string; alt: string; color: string; hasPath: boolean };
    const children: DOMOutputSpec[] = [];
    if (hasPath) {
      children.push(["img", { class: "m-fig-img", src: `/api/assets/${assetId}/raw`, alt: alt || "配图", draggable: "false" }]);
    }
    children.push(["span", { class: "m-fig-lb" }, alt || "配图"]);
    children.push([
      "button", { type: "button", class: "m-fig-del", "aria-label": "移除这张图" },
      ["svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" },
        ["path", { d: X_PATH, fill: "currentColor" }],
      ],
    ]);
    return ["figure", { class: "m-fig", "data-asset": assetId, "data-alt": alt || "配图", style: `background:${color}` }, ...children];
  },
});

/* 单趟行内规范化：在一趟里只处理一种记号，改动落到同一个事务上（= 一步撤销） */
type InlineOp =
  | { kind: "mark"; from: number; to: number; mark: PMark }
  | { kind: "unmark"; from: number; to: number }
  | { kind: "convert"; from: number; to: number; before: number; after: number; mark: PMark };

function collectTagOps(doc: Transaction["doc"], markT: MarkType, color: string, ops: InlineOp[]) {
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const existing = node.marks.find((m) => m.type === markT);
    if (existing) {
      /* 校验整个标签 run：文字不再是完整标签，或后面还跟着可续字的字符
         （在标签中间改字会拆成两截），整段解开 —— 下一轮规范化会按新文字重新着色 */
      let runStart = pos;
      let runEnd = pos + node.nodeSize;
      for (;;) {
        const nb = doc.resolve(runStart).nodeBefore;
        if (nb && nb.isText && markT.isInSet(nb.marks)) runStart -= nb.nodeSize;
        else break;
      }
      for (;;) {
        const na = doc.resolve(runEnd).nodeAfter;
        if (na && na.isText && markT.isInSet(na.marks)) runEnd += na.nodeSize;
        else break;
      }
      const text = doc.textBetween(runStart, runEnd);
      const after = doc.resolve(runEnd).nodeAfter;
      const cont = after && after.isText && after.text ? after.text.charAt(0) : "";
      const valid = TAG_FULL_RE.test(text) && (!cont || TAG_STOP_RE.test(cont));
      if (!valid) ops.push({ kind: "unmark", from: runStart, to: runEnd });
      return;
    }
    if (node.marks.some((m) => ["tag", "link", "highlight", "code"].includes(m.type.name))) return;
    TAG_RE.lastIndex = 0;
    let m = TAG_RE.exec(node.text);
    while (m) {
      ops.push({ kind: "mark", from: pos + m.index, to: pos + m.index + m[0].length, mark: markT.create({ color }) });
      m = TAG_RE.exec(node.text);
    }
  });
}

function collectInlineMarkdownOps(doc: Transaction["doc"], markT: MarkType, re: RegExp, ops: InlineOp[]) {
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    if (node.marks.some((m) => INLINE_MARK_SKIP.includes(m.type.name))) return;
    re.lastIndex = 0;
    let m = re.exec(node.text);
    while (m) {
      /* 记号替换成内容：只删前后记号，内容原位补 mark（内容本身不进删除范围）。
         记号字符不出现在内容里（如 ** 的内层不含 *），indexOf 即前记号长度 */
      const before = m[0].indexOf(m[1]!);
      const after = m[0].length - before - m[1]!.length;
      ops.push({ kind: "convert", from: pos + m.index, to: pos + m.index + m[0].length, before, after, mark: markT.create() });
      m = re.exec(node.text);
    }
  });
}

function normalizeInline(editor: Editor, color: string) {
  const { state, view } = editor;
  if (view.isDestroyed || view.composing) return;
  const { tr } = state;
  const schema = state.schema;
  const passes: { markT?: MarkType; re?: RegExp }[] = [
    { markT: schema.marks.tag },
    { markT: schema.marks.bold, re: /\*\*([^*\n]+)\*\*/g },
    { markT: schema.marks.strike, re: /~~([^~\n]+)~~/g },
    { markT: schema.marks.highlight, re: /==([^=\n]+)==/g },
    { markT: schema.marks.italic, re: /\*([^*\n]+)\*/g },
  ];
  let changed = false;
  for (const pass of passes) {
    if (!pass.markT) continue;
    const ops: InlineOp[] = [];
    const doc = tr.doc;
    if (pass.re) collectInlineMarkdownOps(doc, pass.markT, pass.re, ops);
    else collectTagOps(doc, pass.markT, color, ops);
    if (!ops.length) continue;
    ops.sort((a, b) => b.from - a.from);
    for (const op of ops) {
      if (op.kind === "mark") tr.addMark(op.from, op.to, op.mark);
      else if (op.kind === "unmark") tr.removeMark(op.from, op.to, pass.markT);
      else {
        /* 先删后记号（高位不踩低位），再删前记号；内容落在 [from, from+内长) 原位加 mark */
        tr.delete(op.to - op.after, op.to);
        tr.delete(op.from, op.from + op.before);
        tr.addMark(op.from, op.from + (op.to - op.from - op.before - op.after), op.mark);
      }
      changed = true;
    }
  }
  if (!changed) return;
  tr.setMeta("addToHistory", true);
  view.dispatch(tr);
}

/* 行内规范化：停手 500ms 后把 #标签 / **粗** / ~~删~~ / ==亮== / *斜* 就地转成 mark。
   打字态由 Tiptap inputRule 即时转换，这里兜底粘贴、legacy 纯文本和标签场景
   （旧行内规则也是 500ms 防抖后重写 DOM，节奏保持一致） */
const InlineNormalize = Extension.create({
  name: "inlineNormalize",
  addOptions() {
    return { color: "var(--onda-hover)", delay: 500 };
  },
  addStorage() {
    return { timer: 0 as number };
  },
  onTransaction() {
    if (this.editor.isDestroyed || this.editor.view.composing) return;
    if (this.storage.timer) window.clearTimeout(this.storage.timer);
    this.storage.timer = window.setTimeout(() => {
      this.storage.timer = 0;
      normalizeInline(this.editor, this.options.color);
    }, this.options.delay);
  },
  onDestroy() {
    if (this.storage.timer) window.clearTimeout(this.storage.timer);
  },
});

/* 标签是完整 token：光标紧跟标签尾部按退格，整枚标签一起删
   （对齐旧 contenteditable=false 的原子语义，也免去逐字符拆标签） */
function tagBackspace(editor: Editor): boolean {
  const { state, view } = editor;
  const tagT = state.schema.marks.tag as MarkType | undefined;
  const { selection, doc } = state;
  if (!tagT || !selection.empty) return false;
  const before = selection.$from.nodeBefore;
  if (!before || !before.isText || !tagT.isInSet(before.marks)) return false;
  let from = selection.from - before.nodeSize;
  let to = selection.from;
  for (;;) {
    const nb = doc.resolve(from).nodeBefore;
    if (nb && nb.isText && tagT.isInSet(nb.marks)) from -= nb.nodeSize;
    else break;
  }
  for (;;) {
    const na = doc.resolve(to).nodeAfter;
    if (na && na.isText && tagT.isInSet(na.marks)) to += na.nodeSize;
    else break;
  }
  view.dispatch(state.tr.delete(from, to));
  return true;
}

const TagToken = Extension.create({
  name: "tagToken",
  addKeyboardShortcuts() {
    return {
      Backspace: () => tagBackspace(this.editor),
    };
  },
});

/* 引用回车逃逸：空引用回车解壳回正文；引用末尾回车在下方另起正文段落
   （Tiptap 默认回车继续留在引用里，与旧编辑器行为不一致 —— hr 等独立块会被塞进引用） */
const QuoteEscape = Extension.create({
  name: "quoteEscape",
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { editor } = this;
        if (!editor.isActive("blockquote")) return false;
        const { state } = editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;
        let depth = -1;
        for (let d = $from.depth; d > 0; d -= 1) {
          if ($from.node(d).type.name === "blockquote") {
            depth = d;
            break;
          }
        }
        if (depth < 0) return false;
        /* 空引用：解壳回正文段落 */
        if ($from.parent.content.size === 0) {
          return editor.commands.lift("blockquote");
        }
        /* 末尾回车：引用下方另起一段，光标落进新段 */
        if ($from.pos !== $from.end()) return false;
        const tr = state.tr;
        const at = $from.after(depth);
        tr.insert(at, state.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, at + 1));
        tr.scrollIntoView();
        editor.view.dispatch(tr);
        return true;
      },
    };
  },
});

function buildExtensions(color: string, placeholder: string) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      /* 本编辑器没有代码场景：schema 里不注册 code/codeBlock，
         行内转换的黑名单也就不用考虑它们（` 引号照常当普通字符） */
      code: false,
      codeBlock: false,
      link: { openOnClick: false },
      trailingNode: { node: "paragraph" },
    }),
    Highlight.configure({ HTMLAttributes: { class: "m-mark" } }),
    TagMark.configure({ color }),
    AssetFigure,
    TagToken,
    QuoteEscape,
    InlineNormalize.configure({ color }),
    Placeholder.configure({ placeholder }),
  ];
}

/* ---------- 正文（Tiptap） ---------- */
function insertFigureAt(view: PMEditorView, im: { id: string; color: string; path?: string | null }) {
  const nodeT = view.state.schema.nodes.assetFigure;
  if (!nodeT) return;
  const fig = nodeT.create({ assetId: im.id, alt: "配图", color: im.color, hasPath: !!im.path });
  view.dispatch(view.state.tr.replaceSelectionWith(fig).scrollIntoView());
}

function RichBody({
  postId, html, plain, color, assets, placeholder, insertPastedImages, onChangeBody, onUploadImage, onRemoveAsset, onReady,
}: {
  postId: string;
  html: string;
  plain: string;
  color: string;
  assets: { id: string; color?: string | null; path?: string | null }[];
  placeholder: string;
  /** 图片稿的粘贴目标是素材区；只有文章稿才把粘贴图插入正文 */
  insertPastedImages: boolean;
  onChangeBody: (html: string, plain: string) => void;
  /** 上传图片并返回新素材（插入正文用真实文件） */
  onUploadImage: (file: File) => Promise<{ id: string; color: string; path?: string | null } | null>;
  onRemoveAsset: (id: string) => void;
  onReady: (editor: Editor | null) => void;
}) {
  /* editorProps 在编辑器创建时就固化了（不随重渲染更新），回调一律走 ref 取最新 */
  const cbRef = React.useRef({ onChangeBody, onUploadImage, onRemoveAsset, insertPastedImages });
  React.useEffect(() => {
    cbRef.current = { onChangeBody, onUploadImage, onRemoveAsset, insertPastedImages };
  });
  /* 首次回填：bodyHtml 为空时用纯文本现渲染一份（老数据/新稿）；只在切稿时重算，
     编辑过程中的 props 更新不回灌编辑器 */
  const initialContent = React.useMemo(
    () => (html && html.trim() ? html : mdToHtmlLocal(plain || "", color, assets)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 内容只随稿子切换重算
    [postId],
  );

  const editor = useEditor({
    immediatelyRender: false,
    content: initialContent || undefined,
    extensions: buildExtensions(color, placeholder),
    editorProps: {
      attributes: {
        class: "m-richbody",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "正文",
        spellcheck: "false",
      },
      /* 粘贴一律降级为纯文本：网页/整选区 HTML 会把外部结构样式原样带进正文 */
      transformPastedHTML: (paste) => {
        const box = document.createElement("div");
        box.innerHTML = paste;
        return box.textContent || "";
      },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const img = items.find((it) => it.type.startsWith("image"));
        if (!img) return false;
        const file = img.getAsFile();
        if (!file) return false;
        void cbRef.current.onUploadImage(file).then((im) => {
          if (im && cbRef.current.insertPastedImages) insertFigureAt(view, im);
        });
        return true;
      },
      /* 配图块右上角的删除钮：点它从正文摘掉这张图；素材不再被引用时通知外层删素材 */
      handleClick: (view, pos, event) => {
        const target = event.target instanceof Element ? event.target : null;
        const del = target?.closest(".m-fig-del");
        if (!del) return false;
        const $pos = view.state.doc.resolve(pos);
        let nodePos = -1;
        let node = $pos.nodeAfter;
        if (node && node.type.name === "assetFigure") {
          nodePos = pos;
        } else if ($pos.nodeBefore && $pos.nodeBefore.type.name === "assetFigure") {
          node = $pos.nodeBefore;
          nodePos = pos - node.nodeSize;
        }
        if (nodePos < 0 || !node) return false;
        const assetId = String(node.attrs.assetId ?? "");
        view.dispatch(view.state.tr.delete(nodePos, nodePos + node.nodeSize));
        let still = false;
        view.state.doc.descendants((n) => {
          if (!still && n.type.name === "assetFigure" && n.attrs.assetId === assetId) still = true;
        });
        if (assetId && !still) cbRef.current.onRemoveAsset(assetId);
        return true;
      },
    },
    onCreate: ({ editor: ed }) => onReady(ed),
    onDestroy: () => onReady(null),
    onUpdate: ({ editor: ed }) => {
      cbRef.current.onChangeBody(ed.getHTML(), htmlToPlain(ed.view.dom as HTMLElement));
    },
  }, [postId]);

  return <EditorContent editor={editor} />;
}

/* ---------- 工具栏 ---------- */
/* ---------- 图片素材（真实文件上传；正文插图/粘贴即真实图片） ---------- */
const IMG_W = 72;
const IMG_GAP = 8;

function ImageAssets({
  images, color, onUploadFiles, onMove, onDelete, onClear,
}: {
  images: { id: string; path?: string; color?: string | null }[];
  color: string;
  onUploadFiles: (files: File[]) => Promise<void>;
  onMove: (from: number, to: number) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const list = images || [];
  const [expanded, setExpanded] = React.useState(false);
  const [overflow, setOverflow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  /* 长按拖拽排序：按住拎起 → 其余格子实时让位（FLIP）→ 松手滑进槽位。
     关键：渲染顺序必须由 dnd.order 驱动 —— order 变格子才真的让位，
     只让被拖格跟着指针走而其余不动，就是「看起来不可用」的根源 */
  const orderRef = React.useRef<string[]>([]);
  // eslint-disable-next-line react-hooks/refs -- 渲染期同步 ids：拖拽判定要用最新顺序（原型同款模式）
  orderRef.current = list.map((im) => im.id);
  // eslint-disable-next-line react-hooks/refs -- 同上
  const dnd = useLongPressReorder({
    // eslint-disable-next-line react-hooks/refs
    ids: orderRef.current,
    ignoreSelector: "[aria-label^='删除素材']",
    onCommit: (ids, draggedId) => {
      // 被拖格的前后位置差就是一次 splice 移动，其余格只是被挤开
      const from = orderRef.current.indexOf(draggedId);
      const to = ids.indexOf(draggedId);
      if (from < 0 || to < 0 || from === to) return;
      onMove(from, to);
    },
  });
  const byId = React.useMemo(() => new Map(list.map((im) => [im.id, im])), [list]);
  const view = React.useMemo(() => {
    if (!dnd.order) return list;
    const ordered = dnd.order.map((id) => byId.get(id)).filter(Boolean) as typeof list;
    return ordered.length === list.length ? ordered : list;
  }, [dnd.order, byId, list]);
  React.useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const check = () => {
      const cells = list.length + 1;
      const need = cells * IMG_W + (cells - 1) * IMG_GAP;
      setOverflow(need > el.clientWidth + 1);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [list.length]);
  return (
    <div className="mb-[26px]">
      <div className="mb-2.5 flex items-center gap-[9px]">
        <span className="h-[13px] w-[13px] rounded" style={{ background: color }} />
        <span className="text-[13px] font-black">图片素材</span>
        <span className="font-mono text-[11px] text-ink2">{list.length} 张 · 长按拖拽换顺序</span>
        {busy && <span className="font-mono text-[11px] text-ink2">上传中…</span>}
        {/* 清空：钉在素材头部最右；最少保留一张，所以只有一张时灰着 */}
        <span className="ml-auto" title={list.length <= 1 ? "至少保留一张" : "清空全部图片（保留第一张）"}>
          <Button
            variant="ghost"
            className="h-auto min-w-0 rounded-full px-3 py-1 text-xs font-bold text-ink2 data-[disabled=true]:opacity-40 data-[hovered=true]:bg-hover data-[hovered=true]:text-ink"
            isDisabled={list.length <= 1}
            onPress={onClear}
            aria-label="清空图片素材"
          >
            清空
          </Button>
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        {/* 拖拽进行中放开裁剪：被拖的格子要能甩出素材条外，否则拖到边缘就被「吃掉」。
            relative 是必须的：格子的 offsetLeft 要以这行为基准，与指针坐标同系，拖拽判定才准 */}
        <div className={"relative flex min-w-0 flex-1 gap-2" + (expanded ? " flex-wrap" : "") + (expanded || dnd.dragId ? " overflow-visible" : " overflow-hidden")} ref={(el) => { /* eslint-disable-line react-hooks/immutability, react-hooks/refs -- 同一个元素挂两个 ref */ rowRef.current = el; dnd.gridRef.current = el; }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (!files.length) return;
              setBusy(true);
              try {
                await onUploadFiles(files);
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button
            className="flex h-[72px] w-[72px] flex-none items-center justify-center rounded-[10px] border border-dashed border-ink3 bg-card text-ink2 transition-[transform,border-color,color] data-[hovered=true]:border-ink2 data-[hovered=true]:text-ink"
            isDisabled={busy}
            onPress={() => inputRef.current?.click()}
            aria-label="上传图片素材"
          >
            <Add size={16} strokeWidth={3.3} />
          </Button>
          {view.map((im) => (
            <div
              key={im.id}
              ref={(el) => dnd.register(im.id, el)}
              className={
                "group relative flex h-[72px] w-[72px] flex-none flex-col items-end justify-end gap-[3px] overflow-hidden rounded-[10px] p-1.5 cursor-grab transition-[box-shadow]" +
                (dnd.pressing === im.id ? " scale-[.97]" : "") +
                (dnd.dragId === im.id ? " z-[5] cursor-grabbing shadow-[0_10px_24px_rgba(15,15,15,0.2)] [transition:none] [touch-action:none]" : "")
              }
              style={{ background: im.path ? "#4A4740" : im.color || "var(--onda-hover)" }}
              title={dnd.dragId === im.id ? undefined : "长按拖拽换顺序"}
              onPointerDown={(e) => dnd.onTilePointerDown(e, im.id)}
            >
              {im.path && (
                // eslint-disable-next-line @next/next/no-img-element -- 本地 API 字节流缩略图，next/image 无增益
                <img
                  src={`/api/assets/${im.id}/raw`}
                  alt=""
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                  draggable={false}
                />
              )}
              <Button
                isIconOnly
                className={
                  "absolute right-1 top-1 flex h-4 w-4 min-w-0 items-center justify-center rounded-full bg-[rgba(15,15,15,0.45)] p-0 text-white opacity-0 transition-[opacity,background] data-[hovered=true]:bg-[rgba(15,15,15,0.65)] group-hover:opacity-100" +
                  (dnd.dragId === im.id ? " hidden" : "")
                }
                aria-label="删除素材"
                onPress={() => onDelete(im.id)}
              >
                <X size={12} aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
        {overflow && (
          <Button
            isIconOnly
            variant="ghost"
            className="flex h-7 w-7 min-w-0 flex-none items-center justify-center rounded-full border border-line bg-card text-ink2 data-[hovered=true]:bg-hover data-[hovered=true]:text-ink"
            onPress={() => setExpanded((v) => !v)}
            aria-label={expanded ? "收起素材" : "展开全部素材"}
            aria-expanded={expanded}
          >
            expanded ? <ChevronUp size={14} strokeWidth={3.3} /> : <ChevronDown size={14} strokeWidth={3.3} />
          </Button>
        )}
      </div>
    </div>
  );
}

/** 视频/音频素材区：对齐原型 —— 空态是铺满写作列的上传槽（视频 16:9 大框、音频一行细条），
 *  有文件后视频铺成深色封面（真实可播），音频是整条播放条 + 行内删除；头部「清空」随时移除文件 */
function MediaAssetSection({
  kind, post, color, onUploadMedia, onRemoveMedia,
}: {
  kind: "video" | "audio";
  post: PostDTO;
  color: string;
  onUploadMedia: (kind: "video" | "audio", file: File) => Promise<void>;
  onRemoveMedia: (mediaId: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const media = post.assets.find((a) => a.kind === kind && a.path);
  return (
    <div className="mb-[26px]">
      <input
        ref={inputRef}
        type="file"
        accept={kind === "video" ? "video/*" : "audio/*"}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            await onUploadMedia(kind, f);
          } finally {
            setBusy(false);
          }
        }}
      />
      <div className="mb-2.5 flex items-center gap-[9px]">
        <span className="h-[13px] w-[13px] rounded" style={{ background: color }} />
        <span className="text-[13px] font-black">{kind === "video" ? "视频素材" : "音频素材"}</span>
        <span className="font-mono text-[11px] text-ink2">{media ? fmtTime(post.durationSec ?? 0) : "未上传"}</span>
        {busy && <span className="font-mono text-[11px] text-ink2">上传中…</span>}
        {media && (
          <span className="ml-auto" title={kind === "video" ? "移除这个视频" : "移除这条音频"}>
            <Button
              variant="ghost"
              className="h-auto min-w-0 rounded-full px-3 py-1 text-xs font-bold text-ink2 data-[hovered=true]:bg-hover data-[hovered=true]:text-ink"
              onPress={() => onRemoveMedia(media.id)}
              aria-label={`清空${kind === "video" ? "视频" : "音频"}素材`}
            >
              清空
            </Button>
          </span>
        )}
      </div>
      {kind === "video" ? (
        media ? (
          /* 深色封面铺满写作列：真实视频直接播，右上角悬浮一枚删除（原型 m-mediabox + w-tileacts） */
          <div className="group relative w-full max-w-[560px]">
            <video
              src={`/api/assets/${media.id}/raw`}
              controls
              controlsList="nodownload"
              playsInline
              preload="metadata"
              className="block aspect-video w-full rounded-xl bg-ink"
            />
            <div className="absolute right-[9px] top-[9px] z-[5] opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
              <Button
                isIconOnly
                variant="ghost"
                className="media-x h-[30px] w-[30px] min-w-0 rounded-[9px] border border-line bg-card text-ink2 shadow-[0_1px_4px_rgba(15,15,15,0.12)] data-[hovered=true]:text-ink"
                onPress={() => onRemoveMedia(media.id)}
                aria-label="删除视频素材"
              >
                <X size={11} strokeWidth={4} />
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="flex aspect-video w-full max-w-[560px] flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-ink3 bg-card text-[13.5px] font-bold text-ink2 transition-colors hover:border-ink hover:text-ink"
            onClick={() => inputRef.current?.click()}
            aria-label="上传视频"
          >
            <Add size={16} strokeWidth={3.3} /> 上传视频
          </button>
        )
      ) : media ? (
        /* 音频：整条播放条 + 行内删除（原型 m-audiowrap，删除钮常驻不悬浮） */
        <div className="flex w-full max-w-[560px] items-center gap-2.5">
          <AudioBar src={`/api/assets/${media.id}/raw`} durationSec={post.durationSec} color={color} className="min-w-0 flex-1" />
          <Button
            isIconOnly
            variant="ghost"
            className="media-x h-[30px] w-[30px] min-w-0 flex-none rounded-[9px] border border-line bg-card text-ink2 data-[hovered=true]:text-ink"
            onPress={() => onRemoveMedia(media.id)}
            aria-label="删除音频素材"
          >
            <X size={11} strokeWidth={4} />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full max-w-[560px] items-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-ink3 bg-card px-4 py-[14px] text-[13.5px] font-bold text-ink2 transition-colors hover:border-ink hover:text-ink"
          onClick={() => inputRef.current?.click()}
          aria-label="上传音频"
        >
          <Add size={16} strokeWidth={3.3} /> 上传音频
        </button>
      )}
    </div>
  );
}

function AssetSection({
  post, color, onMoveImage, onRemoveImage, onClearImages, onRemoveMedia, onUploadMedia,
}: {
  post: PostDTO;
  color: string;
  onMoveImage: (from: number, to: number) => void;
  onRemoveImage: (id: string) => void;
  onClearImages: () => void;
  onRemoveMedia: (mediaId: string) => void;
  onUploadMedia: (kind: "video" | "audio" | "image", file: File) => Promise<void>;
}) {
  if (post.type === "article") return null;
  if (post.type === "image") {
    return (
      <ImageAssets
        images={post.assets}
        color={color}
        onUploadFiles={async (files) => {
          for (const f of files) await onUploadMedia("image", f);
        }}
        onMove={onMoveImage}
        onDelete={onRemoveImage}
        onClear={onClearImages}
      />
    );
  }
  if (post.type === "video" || post.type === "audio") {
    return (
      <MediaAssetSection
        kind={post.type}
        post={post}
        color={color}
        onUploadMedia={onUploadMedia}
        onRemoveMedia={onRemoveMedia}
      />
    );
  }
  return null;
}

/* ---------- 工具栏：格式命令一排（吸附在写作列顶部）；图标 reicon 优先、缺的用 lucide ---------- */
const TB_BTN = "flex h-8 min-w-9 items-center justify-center rounded-[9px] px-1.5 text-ink transition-colors data-[hovered=true]:bg-hover";

type ToolbarState = {
  h1: boolean; h2: boolean; h3: boolean;
  bold: boolean; italic: boolean; underline: boolean; strike: boolean; highlight: boolean;
  quote: boolean; ul: boolean; ol: boolean;
  canUndo: boolean; canRedo: boolean;
};

function EditToolbar({ editor, onImage }: { editor: Editor | null; onImage: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: ed }): ToolbarState | null =>
      ed
        ? {
            h1: ed.isActive("heading", { level: 1 }),
            h2: ed.isActive("heading", { level: 2 }),
            h3: ed.isActive("heading", { level: 3 }),
            bold: ed.isActive("bold"),
            italic: ed.isActive("italic"),
            underline: ed.isActive("underline"),
            strike: ed.isActive("strike"),
            highlight: ed.isActive("highlight"),
            quote: ed.isActive("blockquote"),
            ul: ed.isActive("bulletList"),
            ol: ed.isActive("orderedList"),
            canUndo: ed.can().undo(),
            canRedo: ed.can().redo(),
          }
        : null,
  });
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState("");
  const linkInputRef = React.useRef<HTMLInputElement | null>(null);
  const on = s ?? { h1: false, h2: false, h3: false, bold: false, italic: false, underline: false, strike: false, highlight: false, quote: false, ul: false, ol: false, canUndo: false, canRedo: false };
  /* 当前光标所在块，驱动标题菜单选中态 */
  const blockTag = on.h1 ? "h1" : on.h2 ? "h2" : on.h3 ? "h3" : "p";
  /* 标题/正文在引用里要先解壳再换块（对齐旧行为：壳不留在原地） */
  const setHeading = (level: 1 | 2 | 3) => {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (editor.isActive("blockquote")) chain.toggleBlockquote();
    chain.toggleHeading({ level }).run();
  };
  const setParagraph = () => {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (editor.isActive("blockquote")) chain.toggleBlockquote();
    chain.setParagraph().run();
  };
  const cmd = (fn: (c: ReturnType<Editor["chain"]>) => unknown) => () => {
    if (!editor) return;
    fn(editor.chain().focus());
  };

  /* 链接：弹内联输入框（桌面壳里没有 window.prompt）；Esc / 点外面由 onOpenChange(false) 取消。
     ProseMirror 在失焦后仍持有选区，confirm 里 focus() 会原位恢复，不用像旧实现那样存 Range */
  const confirmLink = () => {
    const url = linkUrl.trim();
    setLinkOpen(false);
    if (!url || !editor) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  /* pressed 态压掉 HeroUI ghost 的深色底（--default=ink），否则菜单开着时标题按钮黑圈吞图标 */
  const iconBtn = (active: boolean) => `min-w-9 data-[hovered=true]:bg-hover data-[pressed=true]:bg-hover ${active ? "bg-selected" : ""}`;

  return (
    <div
      className="sticky top-0 z-10 mb-3.5 flex w-full items-center justify-between gap-0.5 rounded-[12px] border border-line bg-card px-2 py-[5px] shadow-[0_8px_12px_-10px_rgba(15,15,15,0.16)]"
      role="toolbar"
      aria-label="编辑工具栏"
      /* mousedown 一律 preventDefault：点击任何按钮都不抢正文选区（HeroUI 的 press 走 pointer，不受影响） */
      onMouseDownCapture={(e) => e.preventDefault()}
    >
      <Dropdown>
        <Button
          isIconOnly
          variant="ghost"
          className={iconBtn(!!(on.h1 || on.h2 || on.h3))}
          aria-label="标题级别"
        >
          <HeadingIcon size={17} strokeWidth={2.2} />
        </Button>
        <Dropdown.Popover placement="bottom left">
          <Dropdown.Menu
            aria-label="标题级别"
            selectionMode="single"
            selectedKeys={[blockTag]}
            onSelectionChange={(keys) => {
              const k = keys === "all" ? undefined : Array.from(keys as Set<React.Key>)[0];
              if (k == null) return;
              const kind = String(k);
              if (kind === "p") setParagraph();
              else if (kind === "h1") setHeading(1);
              else if (kind === "h2") setHeading(2);
              else if (kind === "h3") setHeading(3);
            }}
          >
            <Dropdown.Item key="h1" id="h1" textValue="标题 1">标题 1</Dropdown.Item>
            <Dropdown.Item key="h2" id="h2" textValue="标题 2">标题 2</Dropdown.Item>
            <Dropdown.Item key="h3" id="h3" textValue="标题 3">标题 3</Dropdown.Item>
            <Dropdown.Item key="p" id="p" textValue="正文">正文</Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      <Button isIconOnly variant="ghost" className={iconBtn(on.bold)} onPress={cmd((c) => c.toggleBold().run())} aria-label="加粗"><Bold size={17} strokeWidth={2.4} /></Button>
      <Button isIconOnly variant="ghost" className={iconBtn(on.italic)} onPress={cmd((c) => c.toggleItalic().run())} aria-label="斜体"><Italic size={17} strokeWidth={2.4} /></Button>
      <Button isIconOnly variant="ghost" className={iconBtn(on.underline)} onPress={cmd((c) => c.toggleUnderline().run())} aria-label="下划线"><Underline size={17} strokeWidth={2.4} /></Button>
      <Button isIconOnly variant="ghost" className={iconBtn(on.strike)} onPress={cmd((c) => c.toggleStrike().run())} aria-label="删除线"><Strikethrough size={17} strokeWidth={2.2} /></Button>
      <Button isIconOnly variant="ghost" className={iconBtn(on.highlight)} onPress={cmd((c) => c.toggleHighlight().run())} aria-label="高亮"><Highlighter size={17} strokeWidth={2.2} /></Button>
      <Button isIconOnly variant="ghost" className={iconBtn(on.quote)} onPress={cmd((c) => c.toggleBlockquote().run())} aria-label="引用"><Quote size={17} strokeWidth={2.2} /></Button>
      <span className="h-5 w-px flex-none bg-line" aria-hidden="true" />
      <Button isIconOnly variant="ghost" className={iconBtn(on.ul)} onPress={cmd((c) => c.toggleBulletList().run())} aria-label="无序列表"><List size={17} strokeWidth={2.4} /></Button>
      <Button isIconOnly variant="ghost" className={iconBtn(on.ol)} onPress={cmd((c) => c.toggleOrderedList().run())} aria-label="有序列表"><ListOrdered size={17} strokeWidth={2.2} /></Button>
      <Button isIconOnly variant="ghost" className={iconBtn(false)} onPress={cmd((c) => c.setHorizontalRule().run())} aria-label="插入分隔线"><Minus size={17} strokeWidth={2.4} /></Button>
      <span className="h-5 w-px flex-none bg-line" aria-hidden="true" />
      <Popover
        isOpen={linkOpen}
        onOpenChange={(o) => {
          setLinkOpen(o);
          if (!o) setLinkUrl("");
        }}
      >
        <Popover.Trigger>
          <Button isIconOnly variant="ghost" className={iconBtn(false)} aria-label="插入链接"><Link2 size={17} strokeWidth={2.2} /></Button>
        </Popover.Trigger>
        <Popover.Content placement="bottom right">
          <div className="flex items-center gap-1.5 rounded-xl border border-line bg-card p-1.5 shadow-[0_14px_40px_rgba(15,15,15,0.14)]">
            <input
              ref={linkInputRef}
              autoFocus
              className="w-[220px] rounded-lg bg-hover px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-ink3"
              value={linkUrl}
              placeholder="https://…"
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); confirmLink(); }
              }}
            />
            <Button
              className="min-w-0 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-bold text-white data-[hovered=true]:brightness-105"
              onPress={confirmLink}
            >
              确定
            </Button>
          </div>
        </Popover.Content>
      </Popover>
      <Button isIconOnly variant="ghost" className={iconBtn(false)} onPress={onImage} aria-label="在光标处插入图片（也可直接粘贴）"><ImageIcon size={17} strokeWidth={2.2} /></Button>
      <span className="h-5 w-px flex-none bg-line" aria-hidden="true" />
      <Button isIconOnly variant="ghost" className={iconBtn(false)} isDisabled={!on.canUndo} onPress={cmd((c) => c.undo().run())} aria-label="撤销"><Undo size={17} strokeWidth={2.4} /></Button>
      <Button isIconOnly variant="ghost" className={iconBtn(false)} isDisabled={!on.canRedo} onPress={cmd((c) => c.redo().run())} aria-label="重做"><Redo size={17} strokeWidth={2.4} /></Button>
    </div>
  );
}

/* ---------- EditorView ---------- */
export function EditorView({
  post, saveState, onChangeField, onUploadImage, onRemoveAsset, onMoveImage, onUploadMedia, onBack, onPublish, onSave,
}: {
  post: PostDTO;
  saveState: "saved" | "dirty" | "saving";
  onChangeField: (k: "title" | "body" | "bodyHtml", v: string) => void;
  /** 上传图片并返回新素材（正文插图/粘贴：真实文件） */
  onUploadImage: (file: File) => Promise<{ id: string; color: string; path?: string | null } | null>;
  onRemoveAsset: (id: string) => void;
  onMoveImage: (from: number, to: number) => void;
  onUploadMedia: (kind: "video" | "audio" | "image", file: File) => Promise<void>;
  onBack: () => void;
  onPublish: () => void;
  onSave: () => void;
}) {
  const t = TYPE_META[post.type];
  const wordCount = (post.title + post.body).length;

  /* Tiptap 实例由 RichBody 创建后交上来，工具栏/素材区都通过它操作正文 */
  const [editor, setEditor] = React.useState<Editor | null>(null);
  const imgInputRef = React.useRef<HTMLInputElement | null>(null);

  /** 从正文摘掉一张配图（素材区删除/清空用） */
  const removeFigure = (assetId: string) => {
    if (!editor) return;
    const tr = editor.state.tr;
    let done = false;
    editor.state.doc.descendants((node, pos) => {
      if (done || node.type.name !== "assetFigure" || node.attrs.assetId !== assetId) return;
      tr.delete(pos, pos + node.nodeSize);
      done = true;
    });
    if (done) editor.view.dispatch(tr);
  };

  /* 全编辑区拖拽上传：按稿子类型路由文件（video/audio 取第一个，image 逐张追加） */
  const [dropping, setDropping] = React.useState(false);
  const dragDepth = React.useRef(0);
  const [uploading, setUploading] = React.useState(false);
  const onDropFiles = async (files: File[]) => {
    const kindOf = (f: File): "video" | "audio" | "image" | null =>
      f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "audio" : f.type.startsWith("image/") ? "image" : null;
    const wanted = files.filter((f) => kindOf(f) === post.type) as File[];
    if (!wanted.length) return;
    setUploading(true);
    try {
      for (const f of wanted) await onUploadMedia(post.type as "video" | "audio" | "image", f);
    } finally {
      setUploading(false);
    }
  };

  /* ⌘S / Ctrl+S 手动保存（自动保存之外的用户主动兜底） */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave]);

  /* 两栏各自可滚：底部渐隐提示「下面还有」，滚到底自动收掉 */
  const writeRef = React.useRef<HTMLDivElement | null>(null);
  const phoneRef = React.useRef<HTMLDivElement | null>(null);
  const [more, setMore] = React.useState({ write: false, prev: false });
  const syncMore = React.useCallback(() => {
    const need = (el: HTMLElement | null) => !!el && el.scrollHeight - el.scrollTop - el.clientHeight > 4;
    setMore((m) => {
      const next = { write: need(writeRef.current), prev: need(phoneRef.current) };
      return next.write === m.write && next.prev === m.prev ? m : next;
    });
  }, []);
  React.useEffect(() => {
    syncMore();
    const raf = requestAnimationFrame(syncMore);
    const t2 = window.setTimeout(syncMore, 260);
    window.addEventListener("resize", syncMore);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t2); window.removeEventListener("resize", syncMore); };
  }, [post.id, post.title, post.body, post.bodyHtml, post.durationSec, post.assets.length, syncMore]);

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes("Files")) setDropping(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDropping(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDropping(false);
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length) void onDropFiles(files);
      }}
    >
      <div className="flex h-[60px] flex-none items-center gap-3.5 bg-card px-7">
        <Button variant="ghost" className="flex items-center gap-[7px] rounded-full border border-ink3 bg-card px-4 py-2 text-sm font-bold text-ink data-[hovered=true]:bg-hover" onPress={onBack}><ArrowLeft size={14} strokeWidth={3.3} /> 返回</Button>
        {/* 一枚按钮表达保存状态：未保存时点亮成主色，其余时候灰着 */}
        <Button
          variant="ghost"
          className={
            "rounded-full px-[18px] py-2 text-sm font-bold transition-[filter] " +
            (saveState === "dirty"
              ? "border border-accent bg-accent text-white data-[hovered=true]:brightness-105"
              : "border border-ink3 bg-card text-ink2")
          }
          isDisabled={saveState !== "dirty"}
          onPress={onSave}
          aria-label="保存（⌘S）"
        >
          {saveState === "saved" && "已保存"}
          {saveState === "dirty" && "保存"}
          {saveState === "saving" && "保存中…"}
        </Button>
        <span className="font-mono text-xs text-ink2">{wordCount} 字</span>
        <Button className="ml-auto flex items-center gap-2 rounded-full bg-green px-[26px] py-[11px] text-[15px] font-black tracking-[1px] text-white transition-[translate,background-color] duration-150 data-[hovered=true]:-translate-y-0.5 data-[hovered=true]:bg-[#069e62]" onPress={onPublish}><Send size={15} strokeWidth={2.9} /> 发布</Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_460px]">
        <div className="relative flex min-h-0 overflow-hidden">
          {/* 顶距放在首子元素上而不是容器 padding：工具栏 sticky 时才能贴到滚动区最顶 */}
          <div className="scroll-thin min-h-0 flex-1 overflow-auto border-r border-line px-10 pb-[34px] [&>*:first-child]:mt-[34px]" ref={writeRef} onScroll={syncMore}>
            <AssetSection
              post={post}
              color={t.color}
              onMoveImage={onMoveImage}
              /* 素材区单删：图片类至少保留一张（正文里的删除不受限） */
              onRemoveImage={(id) => {
                if (post.type === "image" && post.assets.length <= 1) return;
                removeFigure(id);
                onRemoveAsset(id);
              }}
              /* 清空图片素材：保留第一张，清掉的图在正文里的引用一并移除 */
              onClearImages={() => {
                post.assets.slice(1).forEach((a) => {
                  removeFigure(a.id);
                  onRemoveAsset(a.id);
                });
              }}
              onRemoveMedia={onRemoveAsset}
              onUploadMedia={onUploadMedia}
            />
            {/* 格式工具栏：吸附在写作列顶部；undo/redo 走 Tiptap 历史 */}
            <EditToolbar editor={editor} onImage={() => imgInputRef.current?.click()} />
            <input
              ref={imgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const im = await onUploadImage(f);
                if (im && editor) insertFigureAt(editor.view, im);
              }}
            />
            <input
              className="w-full border-b-2 border-transparent bg-transparent pb-3 pt-1 text-[28px] font-bold leading-[1.35] tracking-[-0.4px] text-ink outline-none transition-colors placeholder:text-ink3 focus:border-accent"
              value={post.title}
              placeholder="给这篇稿子起个标题"
              onChange={(e) => onChangeField("title", e.target.value)}
            />
            <RichBody
              postId={post.id}
              html={post.bodyHtml}
              plain={post.body}
              color={t.color}
              assets={post.assets}
              insertPastedImages={post.type === "article"}
              onChangeBody={(html, plain) => { onChangeField("bodyHtml", html); onChangeField("body", plain); }}
              onUploadImage={onUploadImage}
              onRemoveAsset={onRemoveAsset}
              onReady={setEditor}
              placeholder={post.type === "article"
                ? "开始写正文。粘贴图片或点工具栏「图片」，图会落在光标处；用 #标签 标记话题。"
                : "开始写正文。用 #标签 标记话题，右侧的预览会实时更新。"}
            />
          </div>
          <span
            className={"pointer-events-none absolute inset-x-0 bottom-0 z-[4] h-[72px] bg-gradient-to-b from-transparent to-paper transition-opacity duration-[280ms] " + (more.write ? "opacity-100" : "opacity-0")}
            aria-hidden="true"
          />
        </div>
        <PreviewColumn post={post} paneRef={phoneRef} onScroll={syncMore} more={more.prev} />
      </div>
      {(dropping || uploading) && (
        <div className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center bg-[rgba(35,131,226,0.08)]" aria-live="polite">
          <span className="rounded-full bg-accent px-5 py-2.5 text-sm font-black text-white shadow-[0_10px_30px_rgba(35,131,226,0.35)]">
            {uploading ? "上传中…" : "松开，上传到这篇稿子"}
          </span>
        </div>
      )}
    </div>
  );
}
