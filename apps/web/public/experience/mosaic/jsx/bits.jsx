/* bits.jsx — 共享小组件：Logo、#标签 高亮、音频假播放条 */
function MosaicLogo({ size = 11 }) {
  const cells = ["#2C6FF0", "#D52088", "#FD8D11", "#0EC3D4", "c", "#07B56F", "#FD8D11", "#2C6FF0", "#D52088"];
  return (
    <div className="m-logo" style={{ gridTemplateColumns: "repeat(3," + size + "px)", gridTemplateRows: "repeat(3," + size + "px)" }}>
      {cells.map((c, i) => (
        <i key={i} className={c === "c" ? "c" : ""} style={c === "c" ? {} : { background: c }}></i>
      ))}
    </div>
  );
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

/* 假播放条：本地 state，interval 推进 */
function AudioBar({ durationSec, color = "#0EC3D4", compact = false }) {
  const total = durationSec || 725;
  const [playing, setPlaying] = React.useState(false);
  const [cur, setCur] = React.useState(0);
  React.useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setCur((c) => {
        if (c + 1 >= total) { setPlaying(false); return 0; }
        return c + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [playing, total]);
  return (
    <div className="m-audiobar">
      <button className="m-audioplay" style={{ background: color }} onClick={() => setPlaying((p) => !p)} aria-label={playing ? "暂停" : "播放"}>
        {playing ? <IcPause size={16} /> : <IcPlay size={16} />}
      </button>
      <div className="m-audiotrack">
        <div className="m-audiotime"><span>{fmtTime(cur)}</span><span>{fmtTime(total)}</span></div>
        <div className="m-audioline"><i style={{ width: (cur / total * 100) + "%", background: color }}></i></div>
      </div>
    </div>
  );
}

/* 发布任务浮动指示条：只是短暂提醒，发布队列才是完整事实源；6 秒后自动消失。 */
function FloatingPill({ tasks, onClick }) {
  const [hidden, setHidden] = React.useState(false);
  const running = tasks.filter((t) => t.status === "running");
  const avg = Math.round(running.reduce((s, t) => s + t.progress, 0) / running.length);

  React.useEffect(() => {
    if (!running.length) return;
    setHidden(false);
    const timer = setTimeout(() => setHidden(true), 6000);
    return () => clearTimeout(timer);
  }, [running.length]);

  if (!running.length || hidden) return null;
  return (
    <button className="m-pill" onClick={onClick}>
      <span className="sqs">
        <i style={{ background: "#2C6FF0" }}></i>
        <i style={{ background: "#D52088" }}></i>
        <i style={{ background: "#FD8D11" }}></i>
      </span>
      正在发布 {running.length} 个任务
      <span className="mono">{avg}% · 查看队列</span>
    </button>
  );
}

/* 正文里的插图记号：独占一行时在预览里落成一张图，在列表里要跳过 */
const ASSET_IMG_RE = /^!\[([^\]]*)\]\(asset:\/\/([^)]+)\)$/;

/* 列表摘要：跳过插图记号和空行，取第一段真正的文字 */
function plainSummary(body) {
  const lines = (body || "").split("\n").map((s) => s.trim()).filter(Boolean);
  return lines.find((l) => !ASSET_IMG_RE.test(l)) || "";
}

/* ---------- 正文：文字稿的两种形态 ----------
   存储上正文是纯文本（body，列表摘要/搜索/字数都用它），
   编辑与预览用的是它的富文本形态（bodyHtml）—— 一份内容，两个视图。 */

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* #标签 包成 span（颜色随内容类型），字号字重都不动。
   contenteditable="false"：标签是完整 token —— 光标落在它后面时，
   新输入的文字会出现在标签外，不会被继续吞进标签里。 */
function wrapTags(escaped, color) {
  return escaped.replace(/(#[^\s#，。！？；：,.!?;:]+)/g, (m) =>
    '<span class="m-tag" contenteditable="false" style="color:' + color + ";background:" + color + '1A">' + m + "</span>");
}

/* ==高亮== 包成 mark（荧光笔效果），随主题换底色 */
function wrapHighlights(escaped) {
  return escaped.replace(/==([^=\n]+)==/g, '<mark class="m-mark">$1</mark>');
}

/* 正文里的图块：在编辑器里是 figure（不可编辑），在预览里是同一份 HTML */
function figHtml(id, alt, color) {
  return '<figure class="m-fig" contenteditable="false" data-asset="' + id + '" data-alt="' + escHtml(alt || "配图") +
    '" style="background:' + color + '"><button type="button" class="m-fig-del" aria-label="移除这张图">×</button></figure>';
}

/* 纯文本正文 → HTML：段落 + #标签 + 独占一行的插图 */
function mdToHtml(body, color, assets) {
  const list = assets || [];
  const out = [];
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    out.push("<p>" + buf.map((l) => wrapHighlights(wrapTags(escHtml(l), color))).join("<br>") + "</p>");
    buf = [];
  };
  (body || "").split("\n").forEach((line) => {
    const m = line.trim().match(ASSET_IMG_RE);
    if (m) {
      flush();
      const im = list.find((x) => x.id === m[2]);
      out.push(figHtml(m[2], m[1] || "配图", im ? im.color : "#B8B6B0"));
    } else if (!line.trim()) {
      flush();
    } else {
      buf.push(line);
    }
  });
  flush();
  return out.join("");
}

/* contenteditable 里的 DOM → 纯文本正文（段落之间空一行，图还原成 asset 引用） */
function htmlToPlain(root) {
  const blocks = [];
  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === 1 && node.classList && node.classList.contains("m-fig")) {
      blocks.push("![" + (node.getAttribute("data-alt") || "配图") + "](asset://" + node.getAttribute("data-asset") + ")");
      return;
    }
    const text = (node.innerText != null ? node.innerText : node.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
    if (text) blocks.push(text);
  });
  return blocks.join("\n\n");
}

/* 把 root 里还没高亮的 #标签 包起来（跑在克隆体上，不动正在编辑的 DOM） */
function highlightTags(root, color) {
  const test = /#[^\s#，。！？；：,.!?;:]+/;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const host = n.parentNode;
    if (!host || (host.closest && host.closest(".m-tag, a, code, .m-fig"))) continue;
    if (test.test(n.nodeValue)) nodes.push(n);
  }
  nodes.forEach((n) => {
    const frag = document.createDocumentFragment();
    n.nodeValue.split(/(#[^\s#，。！？；：,.!?;:]+)/g).forEach((part) => {
      if (!part) return;
      if (part.charAt(0) === "#") {
        const span = document.createElement("span");
        span.className = "m-tag";
        span.setAttribute("contenteditable", "false");
        span.style.color = color;
        span.style.background = color + "1A";
        span.textContent = part;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    });
    n.parentNode.replaceChild(frag, n);
  });
}

/* 行内 Markdown：**加粗** / ~~删除线~~ / *斜体* / ==高亮==，在克隆体上做，同样不动正在编辑的 DOM */
function markdownifyInline(root) {
  const rules = [
    { re: /\*\*([^*\n]+)\*\*/g, tag: "b" },
    { re: /~~([^~\n]+)~~/g, tag: "s" },
    { re: /==([^=\n]+)==/g, tag: "mark", cls: "m-mark" },
    { re: /\*([^*\n]+)\*/g, tag: "i" },
  ];
  rules.forEach((rule) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const hits = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      const host = n.parentNode;
      if (!host || (host.closest && host.closest("b, i, s, a, code, mark, .m-tag, .m-fig"))) continue;
      if (rule.re.test(n.nodeValue)) { rule.re.lastIndex = 0; hits.push(n); }
      rule.re.lastIndex = 0;
    }
    hits.forEach((n) => {
      const frag = document.createDocumentFragment();
      let last = 0;
      n.nodeValue.replace(rule.re, (m, inner, offset) => {
        if (offset > last) frag.appendChild(document.createTextNode(n.nodeValue.slice(last, offset)));
        const el = document.createElement(rule.tag);
        if (rule.cls) el.className = rule.cls;
        el.textContent = inner;
        frag.appendChild(el);
        last = offset + m.length;
        return m;
      });
      if (last < n.nodeValue.length) frag.appendChild(document.createTextNode(n.nodeValue.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
  });
}

/* 序列化：html 给预览与下次打开用，plain 给列表摘要、搜索与字数用。
   clone 先 normalize：光标恢复等操作会把文本节点拆成相邻两截，
   ==对/星星对 跨节点就匹配不到了 —— 合并后再跑行内规则 */
function serializeBody(root, color) {
  const clone = root.cloneNode(true);
  clone.normalize();
  highlightTags(clone, color);
  markdownifyInline(clone);
  return { html: clone.innerHTML, plain: htmlToPlain(root) };
}

Object.assign(window, {
  MosaicLogo, fmtTime, AudioBar, FloatingPill, ASSET_IMG_RE, plainSummary,
  mdToHtml, figHtml, htmlToPlain, highlightTags, serializeBody,
  markdownifyInline,
});
