/* editor.jsx — 编辑器：写作区 + 实时预览 + 自动保存 */
function EditorView({ post, onChange, onBack, onPublish }) {
  const t = TYPES[post.type];
  const [saveState, setSaveState] = React.useState("saved"); // saved | dirty | saving
  const [savedAt, setSavedAt] = React.useState(post.updated || "—");
  const dirtyRef = React.useRef(false);

  const markDirty = () => { dirtyRef.current = true; setSaveState("dirty"); };

  /* setInterval 模拟自动保存：每 2.5s 检查一次脏标记 */
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      setSaveState("saving");
      setTimeout(() => {
        const d = new Date();
        setSavedAt(String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0"));
        setSaveState("saved");
      }, 700);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  const setField = (k, v) => { onChange(post.id, k, v); markDirty(); };
  const wordCount = (post.title + post.body).length;

  /* 正文里的图：素材只活在正文行间，没有独立的素材条 */
  const richRef = React.useRef(null);
  const addImageAsset = () => {
    const list = post.images || [];
    const im = { id: "u" + Date.now(), color: PALETTE[list.length % PALETTE.length] };
    setField("images", list.concat([im]));
    return im;
  };
  const insertImage = () => { if (richRef.current) richRef.current.insert(); };
  const runCommand = (kind) => {
    if (!richRef.current) return;
    if (kind === "undo") richRef.current.undo();
    else if (kind === "redo") richRef.current.redo();
    else richRef.current.run(kind);
  };
  /* 移除一张正文配图：删掉那一行记号；没人再引用就顺手把素材也收走 */
  const removeImage = (id) => {
    setField("images", (post.images || []).filter((im) => im.id !== id));
  };
  /* 新增图片素材：追加到末尾 —— 数组尾部插入是摊销 O(1)，第一格的「+」永远不动（其余格位也不变） */
  const addImage = () => {
    const list = post.images || [];
    setField("images", list.concat([{ id: "u" + Date.now(), color: PALETTE[list.length % PALETTE.length] }]));
  };
  /* 拖拽换位：相邻两格只需交换（O(1)），跨位移动要平移中间元素，splice 的 O(n) 是连续数组的下界 */
  const moveImage = (from, to) => {
    const list = post.images || [];
    const ok = (i) => Number.isInteger(i) && i >= 0 && i < list.length;
    if (from === to || !ok(from) || !ok(to)) return;
    const next = list.slice();
    if (Math.abs(from - to) === 1) {
      next[from] = list[to];
      next[to] = list[from];
    } else {
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
    }
    setField("images", next);
  };

  /* 两栏各自可滚：底部渐隐提示「下面还有」，滚到底自动收掉 */
  const writeRef = React.useRef(null);
  const phoneRef = React.useRef(null);
  const [more, setMore] = React.useState({ write: false, prev: false });
  const syncMore = React.useCallback(() => {
    const need = (el) => !!el && el.scrollHeight - el.scrollTop - el.clientHeight > 4;
    setMore((m) => {
      const next = { write: need(writeRef.current), prev: need(phoneRef.current) };
      return next.write === m.write && next.prev === m.prev ? m : next;
    });
  }, []);
  React.useEffect(() => {
    syncMore();
    const raf = requestAnimationFrame(syncMore);
    const t = setTimeout(syncMore, 260);
    window.addEventListener("resize", syncMore);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); window.removeEventListener("resize", syncMore); };
  }, [post.id, post.title, post.body, post.duration, syncMore]);

  return (
    <div className="m-editor">
      <div className="m-edbar">
        <button className="m-backbtn" onClick={onBack}><IcArrowLeft size={14} /> 返回</button>
        <span className="m-typechip" style={{ background: t.color }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "#fff", display: "inline-block" }}></span>
          {t.zh} · {t.en}
        </span>
        <span className={"m-savestate " + saveState}>
          <span className="dot"></span>
          {saveState === "saved" && "已保存 " + savedAt}
          {saveState === "dirty" && "有未保存改动"}
          {saveState === "saving" && "保存中…"}
        </span>
        <span className="m-wordcount">{wordCount} 字</span>
        <button className="m-pubbtn" onClick={onPublish}><IcSend size={15} /> 发布</button>
      </div>
      <div className="m-edbody">
        <div className="m-pane">
          <div className="m-writecol" ref={writeRef} onScroll={syncMore}>
            {/* 素材统一置顶且只占一条，把版面让给正文 */}
            <AssetSection
              post={post}
              color={t.color}
              onAddImage={addImage}
              onMoveImage={moveImage}
            />
            {/* 标题上方的编辑工具栏 */}
            <EditToolbar onCommand={runCommand} onImage={insertImage} />
            <input
              className="m-titlein"
              value={post.title}
              placeholder="给这篇稿子起个标题"
              onChange={(e) => setField("title", e.target.value)}
            />
            <RichBody
              html={post.bodyHtml}
              plain={post.body}
              color={t.color}
              assets={post.images || []}
              postId={post.id}
              onChangeBody={(html, plain) => { setField("bodyHtml", html); setField("body", plain); }}
              onAddImage={addImageAsset}
              onRemoveAsset={removeImage}
              bodyRef={richRef}
              placeholder={post.type === "article"
                ? "开始写正文。粘贴图片或点工具栏「图片」，图会落在光标处；用 #标签 标记话题。"
                : "开始写正文。用 #标签 标记话题，右侧的预览会实时更新。"}
            />
          </div>
          <span className={"m-more" + (more.write ? "" : " off")} aria-hidden="true"></span>
        </div>
        <PreviewColumn post={post} paneRef={phoneRef} onScroll={syncMore} more={more.prev} />
      </div>
    </div>
  );
}

/* 光标位置：以「可见文字的字符数」记，跳过图块里的字，重建 DOM 后能放回去 */
function caretOffset(root) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let seen = 0;
  let node = walker.nextNode();
  while (node) {
    if (node === range.startContainer) return seen + range.startOffset;
    const inFig = node.parentNode && node.parentNode.closest && node.parentNode.closest(".m-fig");
    if (!inFig) seen += node.nodeValue.length;
    node = walker.nextNode();
  }
  return null;
}

function setCaretOffset(root, offset) {
  if (offset == null) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let seen = 0;
  let node = walker.nextNode();
  while (node) {
    const inFig = node.parentNode && node.parentNode.closest && node.parentNode.closest(".m-fig");
    if (!inFig) {
      const len = node.nodeValue.length;
      if (seen + len >= offset) {
        const range = document.createRange();
        range.setStart(node, Math.max(0, offset - seen));
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      seen += len;
    }
    node = walker.nextNode();
  }
}

/* 光标所在的块：编辑器的直接子节点（正文被切成的「段落 / 标题 / 引用 / 图 / 分隔线」） */
function blockAt(root) {
  if (!root) return null;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  /* 空块里光标会挂在编辑器本身（root@k），这时用 offset 找回那个块 */
  if (range.startContainer === root) {
    const next = root.childNodes[range.startOffset];
    const prev = root.childNodes[range.startOffset - 1];
    const pick = next && next.nodeType === 1 ? next : prev;
    return pick && pick.nodeType === 1 ? pick : null;
  }
  let node = range.startContainer;
  while (node && node.parentNode !== root) node = node.parentNode;
  return node && node.parentNode === root ? node : null;
}

function caretInto(el, atEnd) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(!atEnd);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function caretAtBlockStart(root) {
  const sel = window.getSelection();
  const block = blockAt(root);
  if (!sel || !sel.rangeCount || !block || block.nodeType !== 1) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const probe = document.createRange();
  probe.selectNodeContents(block);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length === 0;
}

function caretAtBlockEnd(root) {
  const sel = window.getSelection();
  const block = blockAt(root);
  if (!sel || !sel.rangeCount || !block || block.nodeType !== 1) return false;
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

/* 光标在「块内」的文字偏移 —— 换块之后能原位放回去（空块也能落进块里） */
function caretOffsetInBlock(block) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!block.contains(range.startContainer)) return null;
  const probe = document.createRange();
  probe.selectNodeContents(block);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length;
}

function caretIntoBlockAt(block, offset) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
  let seen = 0;
  let node = walker.nextNode();
  while (node) {
    const len = node.nodeValue.length;
    if (seen + len >= offset) {
      const range = document.createRange();
      range.setStart(node, Math.max(0, offset - seen));
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    seen += len;
    node = walker.nextNode();
  }
  /* 块里没有文字（空标题 / 空引用）：光标放进块本身 */
  caretInto(block, false);
}

/* 删掉块开头的 Markdown 记号：选中记号后交给浏览器删，
   这样 Blink 的编辑态跟着一起更新，光标留在块里。 */
function stripMarker(root, len) {
  const block = blockAt(root);
  if (!block) return;
  const node = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null).nextNode();
  if (!node || node.nodeValue.length < len) return;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, len);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand("delete");
}

/* 换块格式：已经是目标格式就退回正文段落 —— 加得上，就一定要去得掉 */
function setBlockTag(root, tag) {
  const block = blockAt(root);
  if (!block) return null;
  /* 图与分隔线不是文字块，别把格式套到它们身上（套上去等于把图吃掉） */
  if (block.nodeType === 1 && (block.tagName === "HR" || block.classList.contains("m-fig") || block.tagName === "UL" || block.tagName === "OL")) {
    return null;
  }
  const cur = block.nodeType === 1 ? block.tagName.toLowerCase() : "";
  const target = cur === tag ? "p" : tag;
  /* 走浏览器自己的 formatBlock：自己 replaceChild 会让 Blink 的编辑态失效，
     接着打的字会跑到块外面去 */
  document.execCommand("formatBlock", false, target);
  normalizeEdges(root);
  return target;
}

/* 首尾不能是分隔线或图：否则光标没地方落脚，字也打不进去 */
function normalizeEdges(root) {
  /* 浏览器插入分隔线时会外面套一层 div，拆掉它，让 hr 直接站在正文里 */
  Array.from(root.children).forEach((child) => {
    if (child.tagName === "DIV" && child.children.length === 1 && child.firstElementChild.tagName === "HR") {
      child.parentNode.replaceChild(child.firstElementChild, child);
    }
  });
  const isVoidBlock = (n) => n && n.nodeType === 1 && (n.tagName === "HR" || (n.classList && n.classList.contains("m-fig")));
  if (isVoidBlock(root.firstChild)) root.insertBefore(makeParagraph(), root.firstChild);
  if (isVoidBlock(root.lastChild)) root.appendChild(makeParagraph());
}

/* 列表：自己包，不用 execCommand —— Chrome 会把 <ul> 塞进 <p> 里，等于没生效 */
function setBlockList(root, tag) {
  const block = blockAt(root);
  if (!block) return;
  const caret = caretOffsetInBlock(block);
  const isList = block.nodeType === 1 && (block.tagName === "UL" || block.tagName === "OL");
  if (isList) {
    /* 列表 → 正文：每一项落成一段 */
    const frag = document.createDocumentFragment();
    Array.from(block.children).forEach((li) => {
      const p = document.createElement("p");
      if (!li.textContent.trim()) p.appendChild(document.createElement("br"));
      else while (li.firstChild) p.appendChild(li.firstChild);
      frag.appendChild(p);
    });
    block.parentNode.replaceChild(frag, block);
  } else if (block.nodeType === 1 && block.tagName === "HR") {
    return;
  } else {
    const list = document.createElement(tag);
    const li = document.createElement("li");
    if (block.nodeType === 1) {
      if (!block.textContent.trim()) li.appendChild(document.createElement("br"));
      while (block.firstChild) li.appendChild(block.firstChild);
      block.parentNode.replaceChild(list, block);
    } else {
      block.parentNode.replaceChild(list, block);
      li.appendChild(block);
    }
    list.appendChild(li);
  }
  const now = blockAt(root);
  if (now && now.nodeType === 1) caretIntoBlockAt(now, caret == null ? now.textContent.length : caret);
}

/* 光标是否在列表的第一项开头：在那里退格 = 退出列表 */
function atListHead(root) {
  const block = blockAt(root);
  if (!block || block.nodeType !== 1) return false;
  if (block.tagName !== "UL" && block.tagName !== "OL") return false;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  const li = range.startContainer.nodeType === 1
    ? range.startContainer.closest("li")
    : range.startContainer.parentNode.closest("li");
  if (!li || li !== block.firstElementChild) return false;
  const probe = document.createRange();
  probe.selectNodeContents(li);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length === 0;
}

/* 正文：一块连续的可编辑文档（像知乎的写文章页）。图文在同一层里，
   全选、跨段落选择、删图都跟在 Word 里一样，不再被切成一段段。 */
function RichBody({ html, plain, color, assets, postId, placeholder, onChangeBody, onAddImage, onRemoveAsset, bodyRef }) {
  const ref = React.useRef(null);
  const composing = React.useRef(false);
  const timer = React.useRef(null);
  const snapTimer = React.useRef(null);
  /* 自带一份撤销栈：给 #标签 上色那一步会重写 DOM，浏览器原生的 undo 记录会被抹掉 */
  const hist = React.useRef({ stack: [], idx: -1, lock: false });

  /* 只在换稿子时灌一次内容：React 不接管这块 DOM，否则每敲一个字都会重建、光标乱跳 */
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = (html && html.trim()) ? html : mdToHtml(plain || "", color, assets);
    normalizeEdges(el);
    hist.current = { stack: [el.innerHTML], idx: 0, lock: false };
  }, [postId]);

  const push = () => {
    const el = ref.current;
    if (!el) return;
    const s = serializeBody(el, color);
    onChangeBody(s.html, s.plain);
  };

  /* 撤销栈：敲字时按停顿记一步，工具栏动作立刻记一步 */
  const record = (immediate) => {
    const el = ref.current;
    if (!el || hist.current.lock) return;
    const html = el.innerHTML;
    const st = hist.current;
    if (st.stack[st.idx] === html) return;
    const commit = () => {
      if (st.stack[st.idx] === html) return;
      st.stack = st.stack.slice(0, st.idx + 1);
      st.stack.push(html);
      st.idx = st.stack.length - 1;
      if (st.stack.length > 80) { st.stack.shift(); st.idx -= 1; }
    };
    window.clearTimeout(snapTimer.current);
    if (immediate) commit();
    else snapTimer.current = window.setTimeout(commit, 350);
  };

  const applyHtml = (nextHtml) => {
    const el = ref.current;
    if (!el) return;
    const caret = caretOffset(el);
    hist.current.lock = true;
    el.innerHTML = nextHtml;
    normalizeEdges(el);
    setCaretOffset(el, Math.min(caret == null ? nextHtml.length : caret, nextHtml.length));
    /* 以真正落地的 DOM 更新这一步，不新记一步 —— 否则 redo 的尾巴会被截掉 */
    const st = hist.current;
    if (st.idx >= 0) st.stack[st.idx] = el.innerHTML;
    hist.current.lock = false;
    push();
  };

  const undo = () => {
    const st = hist.current;
    if (st.idx <= 0) return;
    st.idx -= 1;
    applyHtml(st.stack[st.idx]);
  };
  const redo = () => {
    const st = hist.current;
    if (st.idx >= st.stack.length - 1) return;
    st.idx += 1;
    applyHtml(st.stack[st.idx]);
  };

  /* 停手之后再把新敲的 #标签 上色：改 DOM 会动光标，所以放回原处 */
  const cancelHighlight = () => window.clearTimeout(timer.current);
  const scheduleHighlight = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el || composing.current) return;
      /* 先在光标处钉一枚临时标记：重写 DOM 之后照它把光标放回去 */
      const sel = window.getSelection();
      let marker = null;
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
      const strip = (h) => h.split('<span data-caret="1"></span>').join("");
      if (strip(s.html) === strip(el.innerHTML)) {
        if (marker) marker.remove();
        return;
      }
      el.innerHTML = s.html;
      /* 上色只是外观变化，不该占掉一步撤销 */
      const st = hist.current;
      if (st.idx >= 0) st.stack[st.idx] = s.html;
      const at = el.querySelector("[data-caret]");
      if (at) {
        const range = document.createRange();
        range.setStartBefore(at);
        range.collapse(true);
        const now = window.getSelection();
        now.removeAllRanges();
        now.addRange(range);
        at.remove();
      }
      push();
    }, 500);
  };

  const insertFigure = (im) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    /* execCommand 有点过时，但它是这里唯一能「插到当前选区」的原生办法 */
    document.execCommand("insertHTML", false, figHtml(im.id, "配图", im.color) + "<p><br></p>");
    normalizeEdges(el);
    push();
    record(true);
    scheduleHighlight();
  };

  const handlePaste = (e) => {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].type && items[i].type.indexOf("image") === 0) {
        e.preventDefault();
        const im = onAddImage();
        if (im) insertFigure(im);
        return;
      }
    }
  };

  /* 改写 DOM 的命令都在这里落地：工具栏只管报「按了哪个」，怎么改由正文自己负责 */
  const runCommand = (kind) => {
    const el = ref.current;
    if (!el) return;
    /* 结构要变了：先把排队中的高亮取消，免得它在中途重写 DOM 把光标弄丢 */
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

  /* 让光标能跳出格式块：空块回车 → 退回正文；格式块行首退格 → 去掉格式 */
  const handleKeyDown = (e) => {
    const el = ref.current;
    if (!el) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    /* Markdown 快捷输入：# / ## / ### / > / - / 1. / --- 后面敲空格即成形 */
    if ((e.key === " " || e.key === "Enter") && !mod) {
      cancelHighlight();
      const block = blockAt(el);
      if (block && block.nodeType === 1) {
        const text = block.textContent;
        const caretAtEnd = caretAtBlockEnd(el);
        const marker = caretAtEnd ? text.trim() : null;
        const table = { "#": "h1", "##": "h2", "###": "h3", ">": "blockquote" };
        if (marker && table[marker]) {
          e.preventDefault();
          setBlockTag(el, table[marker]);
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
    if (!block || block.nodeType !== 1) return;
    const tag = block.tagName.toLowerCase();
    const formatted = /^h[1-3]$/.test(tag) || tag === "blockquote";
    if (e.key === "Enter" && !e.shiftKey && formatted) {
      cancelHighlight();
      if (!block.textContent.trim()) {
        /* 空行回车：退出格式，回到正文段落 */
        e.preventDefault();
        setBlockTag(el, "p");
        push();
        record(true);
      } else if (caretAtBlockEnd(el)) {
        /* 末尾回车：标题/引用留在原地，下面另起一段正文 */
        e.preventDefault();
        const p = makeParagraph();
        block.parentNode.insertBefore(p, block.nextSibling);
        caretInto(p, false);
        push();
        record(true);
      }
      return;
    }
    if (e.key === "Backspace" && formatted && caretAtBlockStart(el)) {
      cancelHighlight();
      /* 行首退格先把格式去掉（文档第一行的引用/标题否则退不出来） */
      e.preventDefault();
      setBlockTag(el, "p");
      push();
      record(true);
      return;
    }
    if (e.key === "Backspace" && atListHead(el)) {
      cancelHighlight();
      /* 列表首项行首退格：退出列表，回到正文段落 */
      e.preventDefault();
      setBlockList(el, "UL");
      push();
      record(true);
    }
  };

  /* 工具栏要能「插一张图」「撤销重做」「跑格式命令」，都从这里出 */
  React.useEffect(() => {
    if (!bodyRef) return undefined;
    bodyRef.current = {
      insert: () => {
        const im = onAddImage();
        if (im) insertFigure(im);
      },
      sync: () => { push(); record(true); },
      run: runCommand,
      undo,
      redo,
    };
    return () => { bodyRef.current = null; };
  });

  /* 图上的 × 走事件委托：图块本身不可编辑，按钮得自己处理点击 */
  const handleClick = (e) => {
    const del = e.target && e.target.closest ? e.target.closest(".m-fig-del") : null;
    if (!del) return;
    e.preventDefault();
    const fig = del.closest(".m-fig");
    const id = fig && fig.getAttribute("data-asset");
    if (fig) fig.remove();
    const s = ref.current ? serializeBody(ref.current, color) : null;
    if (s) onChangeBody(s.html, s.plain);
    /* 正文里没有别处用到这张图了，素材也一起收走 */
    if (id && s && s.html.indexOf("asset://" + id) < 0) onRemoveAsset(id);
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
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; push(); record(true); scheduleHighlight(); }}
      onPaste={handlePaste}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onBlur={() => { push(); record(true); }}
    />
  );
}

/* 标题上方的编辑工具栏：只有 icon，按下的格式会亮起来 */
function EditToolbar({ onCommand, onImage }) {
  const [on, setOn] = React.useState({});
  const [menu, setMenu] = React.useState(false);
  const barRef = React.useRef(null);
  React.useEffect(() => {
    const sync = () => {
      const sel = window.getSelection();
      const root = document.querySelector(".m-richbody");
      if (!sel || !sel.rangeCount || !root || !root.contains(sel.getRangeAt(0).startContainer)) return;
      const block = blockAt(root);
      const tag = block && block.nodeType === 1 ? block.tagName.toLowerCase() : "";
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
  /* 点工具栏以外的任何地方，收起标题菜单 */
  React.useEffect(() => {
    if (!menu) return undefined;
    const away = (e) => { if (barRef.current && !barRef.current.contains(e.target)) setMenu(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [menu]);
  const cmd = (kind) => () => onCommand(kind);
  const items = [
    { k: "heading", ic: <IcFormatHeading />, caret: true, on: on.h1 || on.h2 || on.h3, title: "标题 1 / 2 / 3", run: () => setMenu((v) => !v) },
    { k: "bold", ic: <IcFormatBold />, title: "加粗", run: cmd("bold") },
    { k: "italic", ic: <IcFormatItalic />, title: "斜体", run: cmd("italic") },
    { k: "underline", ic: <IcFormatUnderline />, title: "下划线", run: cmd("underline") },
    { k: "strike", ic: <IcFormatStrike />, title: "删除线", run: cmd("strikeThrough") },
    { k: "quote", ic: <IcFormatQuote />, title: "引用（再点一次回正文）", run: cmd("blockquote") },
    { sep: true },
    { k: "ul", ic: <IcFormatListUl />, title: "无序列表", run: cmd("ul") },
    { k: "ol", ic: <IcFormatListOl />, title: "有序列表", run: cmd("ol") },
    { k: "hr", ic: <IcFormatDivider />, title: "插入分隔线", run: cmd("hr") },
    { sep: true },
    { k: "link", ic: <IcFormatLink />, title: "插入链接", run: cmd("link") },
    { k: "img", ic: <IcFormatImage />, title: "在光标处插入配图（也可直接粘贴图片）", run: onImage },
    { sep: true },
    { k: "undo", ic: <IcFormatUndo />, title: "撤销", run: cmd("undo") },
    { k: "redo", ic: <IcFormatRedo />, title: "重做", run: cmd("redo") },
  ];
  return (
    <div className="m-toolbar" role="toolbar" aria-label="编辑工具栏" ref={barRef}>
      {items.map((it, i) => (it.sep ? (
        <span key={"sep" + i} className="m-tsep" aria-hidden="true"></span>
      ) : (
        <button
          key={it.k}
          type="button"
          className={"m-tbtn" + (it.caret ? " hascaret" : "") + ((it.on != null ? it.on : on[it.k]) ? " on" : "")}
          title={it.title}
          aria-label={it.title}
          aria-expanded={it.caret ? menu : undefined}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.preventDefault(); it.run(); }}
        >
          {it.ic}
          {it.caret && <IcCaret size={9} />}
        </button>
      )))}
      {menu && (
        <div className="m-tmenu" role="menu">
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
              className={"m-tmenu-item" + (on[m.k] ? " on" : "")}
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

const IMG_W = 72; /* 缩略图边长 */
const IMG_GAP = 8;

/* 图片素材：+ 固定在第一个格位，缩略图可拖拽换位；超出一行时给一个收起/展开 icon，默认收起 */
function ImageAssets({ images, color, onAdd, onMove }) {
  const list = images || [];
  const [dragFrom, setDragFrom] = React.useState(null);
  const [overIdx, setOverIdx] = React.useState(null);
  const [expanded, setExpanded] = React.useState(false);
  const [overflow, setOverflow] = React.useState(false);
  const rowRef = React.useRef(null);
  /* 一行放不下就给开关：按格位尺寸直接算，展开时容器宽度不变，判断依然成立 */
  React.useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;
    const check = () => {
      const cells = list.length + 1;
      const need = cells * IMG_W + (cells - 1) * IMG_GAP;
      setOverflow(need > el.clientWidth + 1);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [list.length]);
  const endDrag = () => { setDragFrom(null); setOverIdx(null); };
  return (
    <div className="m-assetsec">
      <div className="m-assethead">
        <span className="sq" style={{ background: color }}></span>
        <span className="t">图片素材</span>
        <span className="n">{list.length} 张 · 拖拽换顺序</span>
      </div>
      <div className="m-imgwrap">
        <div className={"m-imgrow" + (expanded ? " open" : "")} ref={rowRef}>
          {/* 「+」恒定占据第一格：新增往末尾追加，格位与已有缩略图的位置都不受影响 */}
          <button className="m-imgcell add" onClick={onAdd} aria-label="添加图片素材"><IcPlus size={16} /></button>
          {list.map((im, i) => (
            <div
              key={im.id}
              className={"m-imgcell" + (dragFrom === i ? " dragging" : "") + (overIdx === i && dragFrom !== null && dragFrom !== i ? " over" : "")}
              style={{ background: im.color }}
              draggable
              title="拖拽换顺序"
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overIdx !== i) setOverIdx(i);
              }}
              onDragLeave={() => setOverIdx((o) => (o === i ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData("text/plain");
                onMove(dragFrom !== null ? dragFrom : Number(raw), i);
                endDrag();
              }}
              onDragEnd={endDrag}
            >
              <span className="n">{String(i + 1).padStart(2, "0")}</span>
            </div>
          ))}
        </div>
        {overflow && (
          <button
            className="m-imgtoggle"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "收起素材" : "展开全部素材"}
            aria-label={expanded ? "收起素材" : "展开全部素材"}
            aria-expanded={expanded}
          >
            <IcChevron size={14} dir={expanded ? "up" : "down"} />
          </button>
        )}
      </div>
    </div>
  );
}

/* 类型素材区：统一放在标题之上，尺寸收到一条，不与正文抢版面。
   文章不在这里挂素材 —— 它的图直接落在正文行间（见 insertImage / paste） */
function AssetSection({ post, color, onAddImage, onMoveImage }) {
  if (post.type === "article") return null;
  if (post.type === "image") {
    return <ImageAssets images={post.images} color={color} onAdd={onAddImage} onMove={onMoveImage} />;
  }
  if (post.type === "video") {
    return (
      <div className="m-assetsec">
        <div className="m-assethead">
          <span className="sq" style={{ background: color }}></span>
          <span className="t">视频素材</span>
          <span className="n">封面占位 · {post.duration || "00:00"}</span>
        </div>
        <div className="m-cover">
          <span className="badge">封面占位 16:9</span>
          <button className="m-playbig" aria-label="预览视频"><IcPlay size={14} /></button>
          <span className="dur">{post.duration || "00:00"}</span>
        </div>
      </div>
    );
  }
  if (post.type === "audio") {
    return (
      <div className="m-assetsec">
        <div className="m-assethead">
          <span className="sq" style={{ background: color }}></span>
          <span className="t">音频素材</span>
          <span className="n">{post.duration || "00:00"} · 假播放</span>
        </div>
        <AudioBar durationSec={post.durationSec} color={color} />
      </div>
    );
  }
  return null;
}

Object.assign(window, { EditorView });
