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

  /* 正文插图：把 markdown 引用插到光标处（文章走图文混排，不另开图库页） */
  const insertRef = React.useRef(null);
  const insertImage = () => {
    const list = post.images || [];
    const im = { id: "u" + Date.now(), color: PALETTE[list.length % PALETTE.length] };
    setField("images", list.concat([im]));
    const snippet = "![配图](asset://" + im.id + ")";
    if (insertRef.current) insertRef.current(snippet);
  };
  const insertExisting = (im) => {
    if (insertRef.current) insertRef.current("![配图](asset://" + im.id + ")");
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
              onInsertImage={insertImage}
              onInsertExisting={insertExisting}
            />
            <input
              className="m-titlein"
              value={post.title}
              placeholder="给这篇稿子起个标题"
              onChange={(e) => setField("title", e.target.value)}
            />
            <HighlightEditor
              value={post.body}
              color={t.color}
              onChange={(v) => setField("body", v)}
              insertRef={insertRef}
              placeholder={"开始写正文。用 #标签 标记话题，右侧的预览会实时更新。"}
            />
          </div>
          <span className={"m-more" + (more.write ? "" : " off")} aria-hidden="true"></span>
        </div>
        <PreviewColumn post={post} paneRef={phoneRef} onScroll={syncMore} more={more.prev} />
      </div>
    </div>
  );
}

/* 正文编辑：textarea 透明文字 + 背后 pre 高亮 #标签 与插图记号 */
function HighlightEditor({ value, onChange, color, placeholder, insertRef }) {
  const preRef = React.useRef(null);
  const taRef = React.useRef(null);
  /* 对外暴露「在光标处插入」——插图按钮用 */
  React.useEffect(() => {
    if (!insertRef) return undefined;
    insertRef.current = (snippet) => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart == null ? value.length : ta.selectionStart;
      const end = ta.selectionEnd == null ? start : ta.selectionEnd;
      /* 插图单独成段：前后缺空行就补上，免得和上下文粘在同一行 */
      const before = value.slice(0, start);
      const after = value.slice(end);
      const pre = start === 0 || /\n\s*$/.test(before) ? "" : "\n\n";
      const post = end === value.length || /^\s*\n/.test(after) ? "" : "\n\n";
      const text = pre + snippet + post;
      const next = value.slice(0, start) + text + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        ta.focus();
        const pos = start + text.length;
        ta.setSelectionRange(pos, pos);
      });
    };
    return () => { insertRef.current = null; };
  }, [value, onChange, insertRef]);
  const syncScroll = (e) => {
    if (!preRef.current) return;
    preRef.current.scrollTop = e.target.scrollTop;
    preRef.current.scrollLeft = e.target.scrollLeft;
  };
  return (
    <div className="m-edwrap">
      <pre ref={preRef} className="m-edpre" aria-hidden="true">
        {tagNodes(value + (value.endsWith("\n") ? " " : ""), color, "ed")}
      </pre>
      <textarea
        ref={taRef}
        className="m-edta"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
      ></textarea>
    </div>
  );
}

const IMG_W = 72; /* 缩略图边长 */
const IMG_GAP = 8;

/* 图片素材：+ 固定在第一个格位，缩略图可拖拽换位；超出一行时给一个收起/展开 icon，默认收起 */
function ImageAssets({ images, color, onAdd, onMove, onPick }) {
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
        <span className="n">{list.length} 张 · 拖拽换顺序{onPick ? " · 点一下插入正文" : ""}</span>
      </div>
      <div className="m-imgwrap">
        <div className={"m-imgrow" + (expanded ? " open" : "")} ref={rowRef}>
          {/* 「+」恒定占据第一格：新增往末尾追加，格位与已有缩略图的位置都不受影响 */}
          <button className="m-imgcell add" onClick={onAdd} aria-label="添加图片素材"><IcPlus size={16} /></button>
          {list.map((im, i) => (
            <div
              key={im.id}
              className={"m-imgcell" + (dragFrom === i ? " dragging" : "") + (overIdx === i && dragFrom !== null && dragFrom !== i ? " over" : "") + (onPick ? " pickable" : "")}
              style={{ background: im.color }}
              draggable
              onClick={onPick ? () => onPick(im) : undefined}
              title={onPick ? "点一下把这张图插到光标处" : "拖拽换顺序"}
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

/* 类型素材区：统一放在标题之上，尺寸收到一条，不与正文抢版面 */
function AssetSection({ post, color, onAddImage, onMoveImage, onInsertImage, onInsertExisting }) {
  /* 文章走图文混排：素材在这里只是插图库，插到正文里才出现 */
  if (post.type === "article") {
    const list = post.images || [];
    return (
      <div className="m-assetsec">
        <div className="m-assethead">
          <span className="sq" style={{ background: color }}></span>
          <span className="t">正文配图</span>
          <span className="n">{list.length} 张 · 图文混排，插图落在光标处</span>
        </div>
        <div className="m-imgwrap">
          <div className="m-imgrow">
            <button className="m-imgcell add" onClick={onInsertImage} aria-label="插图">
              <IcPlus size={16} /><span className="cap">插图</span>
            </button>
            {list.map((im, i) => (
              <div key={im.id} className="m-imgcell pickable" style={{ background: im.color }} onClick={() => onInsertExisting(im)} title="点一下把这张图插到光标处">
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
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
