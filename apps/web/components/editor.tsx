/* editor —— 编辑器：写作区 + 实时预览 + 自动/手动保存（移植原型 editor.jsx） */
"use client";

import React from "react";
import { TYPE_META, type PostDTO } from "@tassello/shared";
import { useLongPressReorder } from "./dnd";
import { AudioBar, fmtTime } from "./bits";
import { Button } from "@heroui/react";
import { X } from "reicon-react";
import { PreviewColumn } from "./phone";
import {
  IcArrowLeft, IcCaret, IcChevron, IcFormatBold, IcFormatDivider, IcFormatHeading,
  IcFormatImage, IcFormatItalic, IcFormatLink, IcFormatListOl, IcFormatListUl, IcFormatQuote,
  IcFormatRedo, IcFormatStrike, IcFormatUnderline, IcFormatUndo, IcPlus, IcSend,
} from "./icons";

const PALETTE = ["#2C6FF0", "#D52088", "#FD8D11", "#0EC3D4", "#07B56F", "#37352F"];
export const ASSET_IMG_RE = /^!\[([^\]]*)\]\(asset:\/\/([^)]+)\)$/;

/* ---------- DOM 光标工具（与原型一致） ---------- */
function caretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node = walker.nextNode();
  while (node) {
    if (node === range.startContainer) return seen + range.startOffset;
    const inFig = node.parentNode && node.parentNode instanceof Element
      ? node.parentNode.closest(".m-fig")
      : null;
    if (!inFig) seen += node.nodeValue?.length ?? 0;
    node = walker.nextNode();
  }
  return null;
}

function setCaretOffset(root: HTMLElement, offset: number | null) {
  if (offset == null) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node = walker.nextNode();
  while (node) {
    const inFig = node.parentNode instanceof Element ? node.parentNode.closest(".m-fig") : null;
    if (!inFig) {
      const len = node.nodeValue?.length ?? 0;
      if (seen + len >= offset) {
        const range = document.createRange();
        range.setStart(node, Math.max(0, offset - seen));
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
      }
      seen += len;
    }
    node = walker.nextNode();
  }
}

function blockAt(root: HTMLElement | null): Node | null {
  if (!root) return null;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (range.startContainer === root) {
    const next = root.childNodes[range.startOffset];
    const prev = root.childNodes[range.startOffset - 1];
    const pick = next && next.nodeType === 1 ? next : prev;
    return pick && pick.nodeType === 1 ? pick : null;
  }
  let node: Node | null = range.startContainer;
  while (node && node.parentNode !== root) node = node.parentNode;
  return node && node.parentNode === root ? node : null;
}

function caretInto(el: Element, atEnd: boolean) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(!atEnd);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function caretAtBlockStart(root: HTMLElement): boolean {
  const sel = window.getSelection();
  const block = blockAt(root);
  if (!sel || !sel.rangeCount || !(block instanceof HTMLElement)) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const probe = document.createRange();
  probe.selectNodeContents(block);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length === 0;
}

function caretAtBlockEnd(root: HTMLElement): boolean {
  const sel = window.getSelection();
  const block = blockAt(root);
  if (!sel || !sel.rangeCount || !(block instanceof HTMLElement)) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const probe = document.createRange();
  probe.selectNodeContents(block);
  probe.setStart(range.startContainer, range.startOffset);
  return probe.toString().length === 0;
}

function makeParagraph() {
  const p = document.createElement("p");
  p.appendChild(document.createElement("br"));
  return p;
}

function caretOffsetInBlock(block: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!block.contains(range.startContainer)) return null;
  const probe = document.createRange();
  probe.selectNodeContents(block);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length;
}

function caretIntoBlockAt(block: HTMLElement, offset: number | null) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node = walker.nextNode();
  while (node) {
    const len = node.nodeValue?.length ?? 0;
    if (seen + len >= offset!) {
      const range = document.createRange();
      range.setStart(node, Math.max(0, offset! - seen));
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return;
    }
    seen += len;
    node = walker.nextNode();
  }
  caretInto(block, false);
}

function stripMarker(root: HTMLElement, len: number) {
  const block = blockAt(root);
  if (!(block instanceof HTMLElement)) return;
  const node = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode();
  if (!node || (node.nodeValue?.length ?? 0) < len) return;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, len);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  document.execCommand("delete");
}

function normalizeEdges(root: HTMLElement) {
  Array.from(root.children).forEach((child) => {
    if (child.tagName === "DIV" && child.children.length === 1 && child.firstElementChild?.tagName === "HR") {
      child.parentNode?.replaceChild(child.firstElementChild, child);
    }
  });
  const isVoidBlock = (n: Node | null) =>
    n && n.nodeType === 1 && ((n as HTMLElement).tagName === "HR" || (n as HTMLElement).classList?.contains("m-fig"));
  if (isVoidBlock(root.firstChild)) root.insertBefore(makeParagraph(), root.firstChild);
  if (isVoidBlock(root.lastChild)) root.appendChild(makeParagraph());
}

function setBlockTag(root: HTMLElement, tag: string): string | null {
  const block = blockAt(root);
  if (!(block instanceof HTMLElement)) return null;
  if (block.tagName === "HR" || block.classList.contains("m-fig") || block.tagName === "UL" || block.tagName === "OL") {
    return null;
  }
  const cur = block.tagName.toLowerCase();
  const target = cur === tag ? "p" : tag;
  document.execCommand("formatBlock", false, target);
  normalizeEdges(root);
  return target;
}

function setBlockList(root: HTMLElement, tag: "UL" | "OL") {
  const block = blockAt(root);
  if (!(block instanceof HTMLElement)) return;
  const caret = caretOffsetInBlock(block);
  const isList = block.tagName === "UL" || block.tagName === "OL";
  if (isList) {
    const frag = document.createDocumentFragment();
    Array.from(block.children).forEach((li) => {
      const p = document.createElement("p");
      if (!li.textContent?.trim()) p.appendChild(document.createElement("br"));
      else while (li.firstChild) p.appendChild(li.firstChild);
      frag.appendChild(p);
    });
    block.parentNode?.replaceChild(frag, block);
  } else if (block.tagName === "HR") {
    return;
  } else {
    const list = document.createElement(tag);
    const li = document.createElement("li");
    if (!block.textContent?.trim()) li.appendChild(document.createElement("br"));
    while (block.firstChild) li.appendChild(block.firstChild);
    block.parentNode?.replaceChild(list, block);
    list.appendChild(li);
  }
  const now = blockAt(root);
  if (now instanceof HTMLElement) caretIntoBlockAt(now, caret == null ? now.textContent.length : caret);
}

function atListHead(root: HTMLElement): boolean {
  const block = blockAt(root);
  if (!(block instanceof HTMLElement)) return false;
  if (block.tagName !== "UL" && block.tagName !== "OL") return false;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  const startEl = range.startContainer.nodeType === 1
    ? (range.startContainer as Element)
    : range.startContainer.parentNode;
  const li = startEl instanceof Element ? startEl.closest("li") : null;
  if (!li || li !== block.firstElementChild) return false;
  const probe = document.createRange();
  probe.selectNodeContents(li);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length === 0;
}

/* ---------- 正文富文本 ---------- */
function escHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function wrapTags(escaped: string, color: string): string {
  return escaped.replace(/(#[^\s#，。！？；：,.!?;:]+)/g, (m) =>
    `<span class="m-tag" style="color:${color};background:${color}1A">${m}</span>`);
}
function figHtml(id: string, alt: string, color: string): string {
  // 序列化富文本里不能挂 React 组件：内联 reicon「X」outline 的同款 path，与 reicon-react 视觉一致
  return (
    `<figure class="m-fig" contenteditable="false" data-asset="${id}" data-alt="${escHtml(alt || "配图")}" style="background:${color}">` +
    `<span class="m-fig-lb">${escHtml(alt || "配图")}</span>` +
    `<button type="button" class="m-fig-del" aria-label="移除这张图"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18.4697 19.5303C18.7626 19.8232 19.2374 19.8232 19.5303 19.5303C19.8232 19.2374 19.8232 18.7626 19.5303 18.4697L13.0607 12L19.5303 5.53033C19.8232 5.23744 19.8232 4.76256 19.5303 4.46967C19.2374 4.17678 18.7626 4.17678 18.4697 4.46967L12 10.9393L5.53033 4.46967C5.23744 4.17678 4.76256 4.17678 4.46967 4.46967C4.17678 4.76256 4.17678 5.23744 4.46967 5.53033L10.9393 12L4.46967 18.4697C4.17678 18.7626 4.17678 19.2374 4.46967 19.5303C4.76256 19.8232 5.23744 19.8232 5.53033 19.5303L12 13.0607L18.4697 19.5303Z" fill="currentColor"/></svg></button></figure>`
  );
}
function mdToHtmlLocal(body: string, color: string, assets: { id: string; color?: string | null }[]): string {
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
      const im = assets.find((x) => x.id === m[2]);
      out.push(figHtml(m[2]!, m[1] || "配图", im?.color || "#EDECE9"));
    } else if (!line.trim()) {
      flush();
    } else {
      buf.push(line);
    }
  }
  flush();
  return out.join("");
}
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
function highlightTags(root: HTMLElement, color: string) {
  const test = /#[^\s#，。！？；：,.!?;:]+/;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    const host = n.parentNode;
    if (host && host instanceof Element && host.closest(".m-tag, a, code, .m-fig")) continue;
    if (test.test(n.nodeValue ?? "")) nodes.push(n);
  }
  nodes.forEach((n) => {
    const frag = document.createDocumentFragment();
    (n.nodeValue ?? "").split(/(#[^\s#，。！？；：,.!?;:]+)/g).forEach((part) => {
      if (!part) return;
      if (part.charAt(0) === "#") {
        const span = document.createElement("span");
        span.className = "m-tag";
        span.style.color = color;
        span.style.background = color + "1A";
        span.textContent = part;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    });
    n.parentNode?.replaceChild(frag, n);
  });
}
function markdownifyInline(root: HTMLElement) {
  const rules = [
    { re: /\*\*([^*\n]+)\*\*/g, tag: "b" },
    { re: /~~([^~\n]+)~~/g, tag: "s" },
    { re: /\*([^*\n]+)\*/g, tag: "i" },
  ];
  rules.forEach((rule) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hits: Text[] = [];
    while (walker.nextNode()) {
      const n = walker.currentNode as Text;
      const host = n.parentNode;
      if (host && host instanceof Element && host.closest("b, i, s, a, code, .m-tag, .m-fig")) continue;
      rule.re.lastIndex = 0;
      if (rule.re.test(n.nodeValue ?? "")) hits.push(n);
      rule.re.lastIndex = 0;
    }
    hits.forEach((n) => {
      const frag = document.createDocumentFragment();
      let last = 0;
      (n.nodeValue ?? "").replace(rule.re, (m: string, inner: string, offset: number) => {
        if (offset > last) frag.appendChild(document.createTextNode((n.nodeValue ?? "").slice(last, offset)));
        const el = document.createElement(rule.tag);
        el.textContent = inner;
        frag.appendChild(el);
        last = offset + m.length;
        return m;
      });
      if (last < (n.nodeValue ?? "").length) frag.appendChild(document.createTextNode((n.nodeValue ?? "").slice(last)));
      n.parentNode?.replaceChild(frag, n);
    });
  });
}
/* 失效标签清理：回车拆半、打出空格、删掉 # 的残留 .m-tag 一律解开再重新着色 */
function unwrapStaleTags(root: HTMLElement) {
  const valid = /^#[^\s#，。！？；：,.!?;:]+$/;
  root.querySelectorAll(".m-tag").forEach((span) => {
    const text = span.textContent ?? "";
    if (!valid.test(text)) {
      while (span.firstChild) span.parentNode?.insertBefore(span.firstChild, span);
      span.remove();
    }
  });
}
function serializeBody(root: HTMLElement, color: string) {
  const clone = root.cloneNode(true) as HTMLElement;
  unwrapStaleTags(clone);
  highlightTags(clone, color);
  markdownifyInline(clone);
  return { html: clone.innerHTML, plain: htmlToPlain(root) };
}

/* ---------- RichBody ---------- */
type RichBodyHandle = {
  insert: () => void;
  run: (kind: string) => void;
  undo: () => void;
  redo: () => void;
  /** 素材条删除联动：把正文里引用该素材的图块一并移除 */
  removeFig: (id: string) => void;
};

function RichBody({
  html, plain, color, assets, postId, placeholder, onChangeBody, onAddImage, onRemoveAsset, bodyRef,
}: {
  html: string;
  plain: string;
  color: string;
  assets: { id: string; color?: string | null }[];
  postId: string;
  placeholder: string;
  onChangeBody: (html: string, plain: string) => void;
  onAddImage: () => Promise<{ id: string; color: string } | null>;
  onRemoveAsset: (id: string) => void;
  bodyRef: React.RefObject<RichBodyHandle | null>;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const composing = React.useRef(false);
  const timer = React.useRef<number | null>(null);
  const snapTimer = React.useRef<number | null>(null);
  const hist = React.useRef({ stack: [] as string[], idx: -1, lock: false });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = html && html.trim() ? html : mdToHtmlLocal(plain || "", color, assets);
    normalizeEdges(el);
    hist.current = { stack: [el.innerHTML], idx: 0, lock: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const push = () => {
    const el = ref.current;
    if (!el) return;
    const s = serializeBody(el, color);
    onChangeBody(s.html, s.plain);
  };

  const record = (immediate: boolean) => {
    const el = ref.current;
    if (!el || hist.current.lock) return;
    const htmlNow = el.innerHTML;
    const st = hist.current;
    if (st.stack[st.idx] === htmlNow) return;
    const commit = () => {
      if (st.stack[st.idx] === htmlNow) return;
      st.stack = st.stack.slice(0, st.idx + 1);
      st.stack.push(htmlNow);
      st.idx = st.stack.length - 1;
      if (st.stack.length > 80) {
        st.stack.shift();
        st.idx -= 1;
      }
    };
    if (snapTimer.current) window.clearTimeout(snapTimer.current);
    if (immediate) commit();
    else snapTimer.current = window.setTimeout(commit, 350);
  };

  const applyHtml = (nextHtml: string) => {
    const el = ref.current;
    if (!el) return;
    const caret = caretOffset(el);
    hist.current.lock = true;
    el.innerHTML = nextHtml;
    normalizeEdges(el);
    setCaretOffset(el, Math.min(caret == null ? nextHtml.length : caret, nextHtml.length));
    const st = hist.current;
    if (st.idx >= 0) st.stack[st.idx] = el.innerHTML;
    hist.current.lock = false;
    push();
  };

  const undo = () => {
    const st = hist.current;
    if (st.idx <= 0) return;
    st.idx -= 1;
    applyHtml(st.stack[st.idx]!);
  };
  const redo = () => {
    const st = hist.current;
    if (st.idx >= st.stack.length - 1) return;
    st.idx += 1;
    applyHtml(st.stack[st.idx]!);
  };

  const removeFig = (id: string) => {
    const el = ref.current;
    if (!el) return;
    const fig = el.querySelector(`.m-fig[data-asset="${id}"]`);
    if (!fig) return;
    fig.remove();
    normalizeEdges(el);
    push();
    record(true);
  };

  const cancelHighlight = () => {
    if (timer.current) window.clearTimeout(timer.current);
  };
  const scheduleHighlight = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el || composing.current) return;
      const sel = window.getSelection();
      let marker: HTMLSpanElement | null = null;
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        if (el.contains(range.startContainer)) {
          marker = document.createElement("span");
          marker.setAttribute("data-caret", "1");
          const end = range.cloneRange();
          end.collapse(false);
          end.insertNode(marker);
        }
      }
      const s = serializeBody(el, color);
      const strip = (h: string) => h.split('<span data-caret="1"></span>').join("");
      if (strip(s.html) === strip(el.innerHTML)) {
        marker?.remove();
        return;
      }
      el.innerHTML = s.html;
      const st = hist.current;
      if (st.idx >= 0) st.stack[st.idx] = s.html;
      const at = el.querySelector("[data-caret]");
      if (at) {
        const range = document.createRange();
        range.setStartBefore(at);
        range.collapse(true);
        const now = window.getSelection();
        now?.removeAllRanges();
        now?.addRange(range);
        at.remove();
      }
      push();
    }, 500);
  };

  const insertFigure = (im: { id: string; color: string }) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    document.execCommand("insertHTML", false, figHtml(im.id, "配图", im.color) + "<p><br></p>");
    normalizeEdges(el);
    push();
    record(true);
    scheduleHighlight();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].type && items[i].type.startsWith("image")) {
        e.preventDefault();
        void onAddImage().then((im) => {
          if (im) insertFigure(im);
        });
        return;
      }
    }
  };

  const runCommand = (kind: string) => {
    const el = ref.current;
    if (!el) return;
    cancelHighlight();
    el.focus();
    if (kind === "h1" || kind === "h2" || kind === "h3" || kind === "blockquote") {
      setBlockTag(el, kind);
    } else if (kind === "p") {
      setBlockTag(el, "p");
    } else if (kind === "ul" || kind === "ol") {
      setBlockList(el, kind === "ul" ? "UL" : "OL");
    } else if (kind === "hr") {
      document.execCommand("insertHorizontalRule");
      normalizeEdges(el);
    } else if (kind === "link") {
      const url = window.prompt("链接地址", "https://");
      if (url) document.execCommand("createLink", false, url);
    } else {
      document.execCommand(kind);
    }
    push();
    record(true);
    scheduleHighlight();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const el = ref.current;
    if (!el) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.key === " " || e.key === "Enter") && !mod) {
      cancelHighlight();
      const block = blockAt(el);
      if (block instanceof HTMLElement) {
        const text = block.textContent ?? "";
        const caretAtEnd = caretAtBlockEnd(el);
        const marker = caretAtEnd ? text.trim() : null;
        const table: Record<string, string> = { "#": "h1", "##": "h2", "###": "h3", ">": "blockquote" };
        if (marker && table[marker]) {
          e.preventDefault();
          setBlockTag(el, table[marker]!);
          stripMarker(el, marker.length);
          push();
          record(true);
          return;
        }
        if (marker && (marker === "-" || marker === "*" || marker === "+" || marker === "1.")) {
          e.preventDefault();
          setBlockList(el, marker === "1." ? "OL" : "UL");
          stripMarker(el, marker.length);
          push();
          record(true);
          return;
        }
        if (marker && (marker === "---" || marker === "***" || marker === "___")) {
          e.preventDefault();
          stripMarker(el, marker.length);
          document.execCommand("insertHorizontalRule");
          normalizeEdges(el);
          push();
          record(true);
          return;
        }
      }
    }
    const block = blockAt(el);
    if (!(block instanceof HTMLElement)) return;
    const tag = block.tagName.toLowerCase();
    const formatted = /^h[1-3]$/.test(tag) || tag === "blockquote";
    if (e.key === "Enter" && !e.shiftKey && formatted) {
      cancelHighlight();
      if (!block.textContent?.trim()) {
        e.preventDefault();
        setBlockTag(el, "p");
        push();
        record(true);
      } else if (caretAtBlockEnd(el)) {
        e.preventDefault();
        const p = makeParagraph();
        block.parentNode?.insertBefore(p, block.nextSibling);
        caretInto(p, false);
        push();
        record(true);
      }
      return;
    }
    if (e.key === "Backspace" && formatted && caretAtBlockStart(el)) {
      cancelHighlight();
      e.preventDefault();
      setBlockTag(el, "p");
      push();
      record(true);
      return;
    }
    if (e.key === "Backspace" && atListHead(el)) {
      cancelHighlight();
      e.preventDefault();
      setBlockList(el, "UL");
      push();
      record(true);
    }
  };

  React.useEffect(() => {
    if (!bodyRef) return;
    bodyRef.current = {
      insert: () => {
        void onAddImage().then((im) => {
          if (im) insertFigure(im);
        });
      },
      run: runCommand,
      undo,
      redo,
      removeFig,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    const del = target?.closest(".m-fig-del");
    if (!del) return;
    e.preventDefault();
    const fig = del.closest(".m-fig");
    const id = fig?.getAttribute("data-asset");
    fig?.remove();
    const s = ref.current ? serializeBody(ref.current, color) : null;
    if (s) onChangeBody(s.html, s.plain);
    if (id && s && !s.html.includes("asset://" + id)) onRemoveAsset(id);
  };

  return (
    <div
      ref={ref}
      className={"m-richbody" + ((plain || "").trim() ? "" : " is-empty")}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      spellCheck={false}
      data-placeholder={placeholder}
      onInput={() => { if (!composing.current) { push(); record(false); scheduleHighlight(); } }}
      onCompositionStart={(e) => { composing.current = true; e.currentTarget.classList.add("is-composing"); }}
      onCompositionEnd={(e) => { composing.current = false; e.currentTarget.classList.remove("is-composing"); push(); record(true); scheduleHighlight(); }}
      onPaste={handlePaste}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onBlur={() => { push(); record(true); }}
    />
  );
}

/* ---------- 工具栏 ---------- */
function EditToolbar({ onCommand, onImage }: { onCommand: (kind: string) => void; onImage: () => void }) {
  const [on, setOn] = React.useState<Record<string, boolean>>({});
  const [menu, setMenu] = React.useState(false);
  const barRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const sync = () => {
      const sel = window.getSelection();
      const root = document.querySelector(".m-richbody");
      if (!sel || !sel.rangeCount || !root || !root.contains(sel.getRangeAt(0).startContainer)) return;
      const block = blockAt(root as HTMLElement);
      const tag = block instanceof HTMLElement ? block.tagName.toLowerCase() : "";
      setOn({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strike: document.queryCommandState("strikeThrough"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
        h1: tag === "h1",
        h2: tag === "h2",
        h3: tag === "h3",
        quote: tag === "blockquote",
      });
    };
    document.addEventListener("selectionchange", sync);
    return () => document.removeEventListener("selectionchange", sync);
  }, []);
  React.useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [menu]);
  const items: ({ k: string; ic: React.ReactNode; caret?: boolean; on?: boolean; title: string; run: () => void } | { sep: true })[] = [
    { k: "heading", ic: <IcFormatHeading />, caret: true, on: on.h1 || on.h2 || on.h3, title: "标题 1 / 2 / 3", run: () => setMenu((v) => !v) },
    { k: "bold", ic: <IcFormatBold />, title: "加粗", run: () => onCommand("bold") },
    { k: "italic", ic: <IcFormatItalic />, title: "斜体", run: () => onCommand("italic") },
    { k: "underline", ic: <IcFormatUnderline />, title: "下划线", run: () => onCommand("underline") },
    { k: "strike", ic: <IcFormatStrike />, title: "删除线", run: () => onCommand("strikeThrough") },
    { k: "quote", ic: <IcFormatQuote />, title: "引用（再点一次回正文）", run: () => onCommand("blockquote") },
    { sep: true },
    { k: "ul", ic: <IcFormatListUl />, title: "无序列表", run: () => onCommand("ul") },
    { k: "ol", ic: <IcFormatListOl />, title: "有序列表", run: () => onCommand("ol") },
    { k: "hr", ic: <IcFormatDivider />, title: "插入分隔线", run: () => onCommand("hr") },
    { sep: true },
    { k: "link", ic: <IcFormatLink />, title: "插入链接", run: () => onCommand("link") },
    { k: "img", ic: <IcFormatImage />, title: "在光标处插入配图（也可直接粘贴图片）", run: onImage },
    { sep: true },
    { k: "undo", ic: <IcFormatUndo />, title: "撤销", run: () => onCommand("undo") },
    { k: "redo", ic: <IcFormatRedo />, title: "重做", run: () => onCommand("redo") },
  ];
  return (
    <div className="relative mb-3.5 flex w-full items-center justify-between gap-0.5 rounded-[12px] border border-line bg-card px-2 py-[5px]" role="toolbar" aria-label="编辑工具栏" ref={barRef}>
      {items.map((it, i) => ("sep" in it && it.sep ? (
        <span key={`sep${i}`} className="h-5 w-[1.5px] flex-none rounded-sm bg-line" aria-hidden="true" />
      ) : (
        (() => {
          const item = it as { k: string; ic: React.ReactNode; caret?: boolean; on?: boolean; title: string; run: () => void };
          return (
            <button
              key={item.k}
              type="button"
              className={
                "inline-flex h-8 items-center justify-center gap-px rounded-[10px] text-ink transition-colors hover:bg-hover " +
                (item.caret ? "w-[46px] " : "w-9 ") +
                ((item.on != null ? item.on : on[item.k]) ? "bg-selected text-ink" : "")
              }
              title={item.title}
              aria-label={item.title}
              aria-expanded={item.caret ? menu : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.preventDefault(); item.run(); }}
            >
              {item.ic}
              {item.caret && <IcCaret size={9} />}
            </button>
          );
        })()
      )))}
      {menu && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-20 flex min-w-[132px] flex-col gap-0.5 rounded-xl border border-line bg-card p-1.5 shadow-[0_10px_30px_rgba(15,15,15,0.12)] animate-pop" role="menu">
          {[
            { k: "h1", label: "标题 1" },
            { k: "h2", label: "标题 2" },
            { k: "h3", label: "标题 3" },
            { k: "p", label: "正文" },
          ].map((m) => (
            <button
              key={m.k}
              type="button"
              role="menuitem"
              className={"rounded-lg px-2.5 py-2 text-left text-[13.5px] font-bold text-ink transition-colors hover:bg-hover" + (on[m.k] ? " bg-selected text-ink" : "")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.preventDefault(); setMenu(false); onCommand(m.k); }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- 图片素材（占位色块；真实文件路径由发布时选择/后续上传补齐） ---------- */
const IMG_W = 72;
const IMG_GAP = 8;

function ImageAssets({
  images, color, onAdd, onMove, onDelete,
}: {
  images: { id: string; color?: string | null }[];
  color: string;
  onAdd: () => void;
  onMove: (from: number, to: number) => void;
  onDelete: (id: string) => void;
}) {
  const list = images || [];
  const [expanded, setExpanded] = React.useState(false);
  const [overflow, setOverflow] = React.useState(false);
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  /* 长按拖拽排序：按住拎起 → 其余格子实时让位（FLIP）→ 松手滑进槽位。
     关键：渲染顺序必须由 dnd.order 驱动 —— order 变格子才真的让位，
     只让被拖格跟着指针走而其余不动，就是「看起来不可用」的根源 */
  const orderRef = React.useRef<string[]>([]);
  orderRef.current = list.map((im) => im.id);
  const dnd = useLongPressReorder({
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
      </div>
      <div className="flex items-center gap-2.5">
        {/* 拖拽进行中放开裁剪：被拖的格子要能甩出素材条外，否则拖到边缘就被「吃掉」。
            relative 是必须的：格子的 offsetLeft 要以这行为基准，与指针坐标同系，拖拽判定才准 */}
        <div className={"relative flex min-w-0 flex-1 gap-2" + (expanded ? " flex-wrap" : "") + (expanded || dnd.dragId ? " overflow-visible" : " overflow-hidden")} ref={(el) => { rowRef.current = el; dnd.gridRef.current = el; }}>
          <Button
            className="flex h-[72px] w-[72px] flex-none items-center justify-center rounded-[10px] border border-dashed border-ink3 bg-card text-ink2 transition-[transform,border-color,color] data-[hovered=true]:border-ink2 data-[hovered=true]:text-ink"
            onPress={onAdd}
            aria-label="添加图片素材"
          >
            <IcPlus size={16} />
          </Button>
          {view.map((im, i) => (
            <div
              key={im.id}
              ref={(el) => dnd.register(im.id, el)}
              className={
                "group relative flex h-[72px] w-[72px] flex-none flex-col items-end justify-end gap-[3px] rounded-[10px] p-1.5 cursor-grab transition-[transform,box-shadow] hover:-translate-y-0.5" +
                (dnd.pressing === im.id ? " scale-[.97]" : "") +
                (dnd.dragId === im.id ? " z-[5] cursor-grabbing shadow-[0_10px_24px_rgba(15,15,15,0.2)] [transition:none] [touch-action:none]" : "")
              }
              style={{ background: im.color || "#EDECE9" }}
              title={dnd.dragId === im.id ? undefined : "长按拖拽换顺序"}
              onPointerDown={(e) => dnd.onTilePointerDown(e, im.id)}
            >
              <Button
                isIconOnly
                className={
                  "absolute right-1 top-1 flex h-4 w-4 min-w-0 items-center justify-center rounded-full bg-[rgba(15,15,15,0.45)] p-0 text-white opacity-0 transition-[opacity,background] data-[hovered=true]:bg-[rgba(15,15,15,0.65)] group-hover:opacity-100" +
                  (dnd.dragId === im.id ? " hidden" : "")
                }
                aria-label={`删除素材 ${String(i + 1).padStart(2, "0")}`}
                onPress={() => onDelete(im.id)}
              >
                <X size={12} aria-hidden="true" />
              </Button>
              <span className="font-mono text-[10px] font-bold text-white/90">{String(i + 1).padStart(2, "0")}</span>
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
            <IcChevron size={14} dir={expanded ? "up" : "down"} />
          </Button>
        )}
      </div>
    </div>
  );
}

function AssetSection({
  post, color, onAddImage, onMoveImage, onRemoveImage,
}: {
  post: PostDTO;
  color: string;
  onAddImage: () => void;
  onMoveImage: (from: number, to: number) => void;
  onRemoveImage: (id: string) => void;
}) {
  if (post.type === "article") return null;
  if (post.type === "image") {
    return <ImageAssets images={post.assets} color={color} onAdd={onAddImage} onMove={onMoveImage} onDelete={onRemoveImage} />;
  }
  if (post.type === "video") {
    return (
      <div className="mb-[26px]">
        <div className="mb-2.5 flex items-center gap-[9px]">
          <span className="h-[13px] w-[13px] rounded" style={{ background: color }} />
          <span className="text-[13px] font-black">视频素材</span>
          <span className="font-mono text-[11px] text-ink2">{fmtTime(post.durationSec ?? 0)}</span>
        </div>
        <div className="relative flex aspect-video w-[196px] items-center justify-center overflow-hidden rounded-xl bg-[#4A4740]">
          <span className="absolute bottom-2 right-[9px] font-mono text-[10px] text-white">{fmtTime(post.durationSec ?? 0)}</span>
        </div>
      </div>
    );
  }
  if (post.type === "audio") {
    return (
      <div className="mb-[26px]">
        <div className="mb-2.5 flex items-center gap-[9px]">
          <span className="h-[13px] w-[13px] rounded" style={{ background: color }} />
          <span className="text-[13px] font-black">音频素材</span>
          <span className="font-mono text-[11px] text-ink2">{fmtTime(post.durationSec ?? 0)}</span>
        </div>
        <AudioBar durationSec={post.durationSec} />
      </div>
    );
  }
  return null;
}

/* ---------- EditorView ---------- */
export function EditorView({
  post, saveState, savedAt, onChangeField, onAddImageAsync, onAddImage, onRemoveAsset, onMoveImage, onBack, onPublish, onSave,
}: {
  post: PostDTO;
  saveState: "saved" | "dirty" | "saving";
  savedAt: string;
  onChangeField: (k: "title" | "body" | "bodyHtml", v: string) => void;
  /** 创建一张素材并返回（粘贴图/工具栏插图：新图要落在光标处） */
  onAddImageAsync: () => Promise<{ id: string; color: string } | null>;
  /** 只加一张素材（素材条「+」：追加到末尾） */
  onAddImage: () => void;
  onRemoveAsset: (id: string) => void;
  onMoveImage: (from: number, to: number) => void;
  onBack: () => void;
  onPublish: () => void;
  onSave: () => void;
}) {
  const t = TYPE_META[post.type];
  const wordCount = (post.title + post.body).length;

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

  const richRef = React.useRef<RichBodyHandle | null>(null);
  const insertImage = () => richRef.current?.insert();
  const runCommand = (kind: string) => {
    if (kind === "undo") richRef.current?.undo();
    else if (kind === "redo") richRef.current?.redo();
    else richRef.current?.run(kind);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[60px] flex-none items-center gap-3.5 bg-card px-7">
        <Button variant="ghost" className="flex items-center gap-[7px] rounded-full border border-ink3 bg-card px-4 py-2 text-sm font-bold text-ink data-[hovered=true]:bg-hover" onPress={onBack}><IcArrowLeft size={14} /> 返回</Button>
        <span className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-extrabold text-white" style={{ background: t.color }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "#fff", display: "inline-block" }} />
          {t.zh} · {t.en}
        </span>
        <span className={"flex items-center gap-2 font-mono text-xs text-ink2 " + saveState}>
          <span className={"h-[9px] w-[9px] rounded-[3px] " + (saveState === "saved" ? "bg-green" : saveState === "dirty" ? "bg-orange" : "bg-blue animate-pulse-soft")} />
          {saveState === "saved" && `已保存 ${savedAt}`}
          {saveState === "dirty" && "有未保存改动"}
          {saveState === "saving" && "保存中…"}
        </span>
        <Button
          variant="ghost"
          className="rounded-full border border-ink3 bg-card px-4 py-1.5 text-[13px] font-bold text-ink data-[hovered=true]:bg-hover"
          isDisabled={saveState !== "dirty"}
          onPress={onSave}
          aria-label="保存（⌘S）"
        >
          保存
        </Button>
        <span className="font-mono text-xs text-ink2">{wordCount} 字</span>
        <Button className="ml-auto flex items-center gap-2 rounded-full bg-green px-[26px] py-[11px] text-[15px] font-black tracking-[1px] text-white data-[hovered=true]:-translate-y-0.5 data-[hovered=true]:bg-[#069e62]" onPress={onPublish}><IcSend size={15} /> 发布</Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_460px]">
        <div className="relative flex min-h-0 overflow-hidden">
          <div className="scroll-thin min-h-0 flex-1 overflow-auto border-r border-line px-10 py-[34px]">
            <AssetSection
              post={post}
              color={t.color}
              onAddImage={onAddImage}
              onMoveImage={onMoveImage}
              onRemoveImage={(id) => { richRef.current?.removeFig(id); onRemoveAsset(id); }}
            />
            <EditToolbar onCommand={runCommand} onImage={insertImage} />
            <input
              className="w-full border-b-2 border-transparent bg-transparent pb-3 pt-1 text-[28px] font-bold leading-[1.35] tracking-[-0.4px] text-ink outline-none transition-colors placeholder:text-ink3 focus:border-accent"
              value={post.title}
              placeholder="给这篇稿子起个标题"
              onChange={(e) => onChangeField("title", e.target.value)}
            />
            <RichBody
              html={post.bodyHtml}
              plain={post.body}
              color={t.color}
              assets={post.assets}
              postId={post.id}
              onChangeBody={(html, plain) => { onChangeField("bodyHtml", html); onChangeField("body", plain); }}
              onAddImage={onAddImageAsync}
              onRemoveAsset={onRemoveAsset}
              bodyRef={richRef}
              placeholder={post.type === "article"
                ? "开始写正文。粘贴图片或点工具栏「图片」，图会落在光标处；用 #标签 标记话题。"
                : "开始写正文。用 #标签 标记话题，右侧的预览会实时更新。"}
            />
          </div>
          <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] h-[72px] bg-gradient-to-b from-transparent to-paper opacity-0" aria-hidden="true" />
        </div>
        <PreviewColumn post={post} />
      </div>
    </div>
  );
}
