/* library.jsx — 工作台主界面：左侧栏（类型为主，其余次要入口在其下）+ 内容列表
   设计意图：类型是「颜色 + 筛选维度」，不再是四条并行滚动的轨道。
   一条列表可以有多长，工作台就能装多少内容。 */

/* "09-12 14:02" → 09121402：同一年内比较够用；跨年要换成真时间戳 */
function stamp(s) {
  const m = /^(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s || "");
  return m ? Number(m[1] + m[2] + m[3] + m[4]) : 0;
}
const SORTS = [
  { id: "recent", label: "最近更新" },
  { id: "oldest", label: "最早更新" },
  { id: "title", label: "按标题" },
  { id: "manual", label: "自定义顺序" },
];

/* ---------- 左侧栏 ---------- */
function Sidebar({ view, scope, counts, total, runningCount, queueCount, platforms, onScope, onQueue, onSettings }) {
  const active = view === "queue" ? "queue" : scope;
  /* 凭据缺了才提醒：全拿到的时候设置这一行不带任何噪音 */
  const missing = platforms.filter((p) => p.state !== "ok").length;
  return (
    <aside className="w-rail" aria-label="工作台导航">
      <div className="m-brand">
        <MosaicLogo size={10} />
        <div>
          <div className="m-brand-name">九漾 Onda</div>
          <div className="m-brand-sub">content worksbench</div>
        </div>
      </div>

      {/* 第一组：四种内容类型。它们是日常主路径，所以排在最上面、字号最大 */}
      <nav className="w-nav" aria-label="内容类型">
        {TYPE_ORDER.map((k) => {
          const t = TYPES[k];
          const on = active === k;
          return (
            <button
              key={k}
              className={"w-navitem" + (on ? " on" : "")}
              aria-current={on ? "page" : undefined}
              onClick={() => onScope(k)}
            >
              <span className="w-sq" style={{ background: on ? "#fff" : t.color }}></span>
              <span>{t.zh}</span>
              <span className="w-navn">{String(counts[k]).padStart(2, "0")}</span>
            </button>
          );
        })}
      </nav>

      {/* 第二组：跨类型的入口，放在四类之下、字号收一档 */}
      <nav className="w-navsub" aria-label="其他入口">
        <button
          className={"w-navitem" + (active === "all" ? " on" : "")}
          aria-current={active === "all" ? "page" : undefined}
          onClick={() => onScope("all")}
        >
          <span className="w-sq"></span>
          <span>全部稿子</span>
          <span className="w-navn">{String(total).padStart(2, "0")}</span>
        </button>
        <button
          className={"w-navitem" + (active === "queue" ? " on" : "")}
          aria-current={active === "queue" ? "page" : undefined}
          onClick={onQueue}
        >
          <span className="w-sq"></span>
          <span>发布队列</span>
          {runningCount > 0
            ? <span className="w-badge">{runningCount}</span>
            : <span className="w-navn">{String(queueCount).padStart(2, "0")}</span>}
        </button>
      </nav>

      {/* 栏底：平台账号与默认名单都收进了设置，这里只剩一个入口 */}
      <div className="w-railtail">
        <button className="w-navitem" onClick={onSettings} aria-haspopup="dialog">
          <IcSettings size={15} />
          <span>设置</span>
          {missing > 0 && <span className="w-attn" title={missing + " 个平台凭据获取失败"}>{missing}</span>}
        </button>
      </div>
    </aside>
  );
}

/* ---------- 主区头部：标题 + 搜索 + 排序 + 新建 ---------- */
function ViewHead({ title, meta, query, onQuery, sort, onSort, scope, onNew, onNewMenu }) {
  const [sortOpen, setSortOpen] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const searchRef = React.useRef(null);
  const cur = SORTS.find((s) => s.id === sort) || SORTS[0];
  const t = scope === "all" ? null : TYPES[scope];

  /* ⌘K / Ctrl+K 直接落到搜索框：内容一多，键盘是唯一还快的入口 */
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (searchRef.current) searchRef.current.focus();
      }
      if (e.key === "Escape") { setSortOpen(false); setNewOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="w-head">
      <div className="w-headline">
        <h1 className="w-h1">{title}</h1>
        <span className="w-hmeta">{meta}</span>
      </div>
      <div className="w-tools">
        <label className="w-search">
          <IcSearch size={14} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="搜索标题与正文"
            aria-label="搜索稿子"
          />
          {query && (
            <button className="w-srchclear" onClick={(e) => { e.preventDefault(); onQuery(""); searchRef.current && searchRef.current.focus(); }} aria-label="清空搜索">
              <IcX size={11} />
            </button>
          )}
        </label>

        <div className="w-sort">
          <button className="w-ghostbtn" onClick={() => setSortOpen((v) => !v)} aria-expanded={sortOpen}>
            <IcSort size={13} /> {cur.label}
          </button>
          {sortOpen && (
            <React.Fragment>
              <button className="w-backdrop" onClick={() => setSortOpen(false)} aria-label="关闭排序菜单"></button>
              <div className="w-menu" role="menu">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    className={"w-menuitem" + (s.id === sort ? " on" : "")}
                    role="menuitemradio"
                    aria-checked={s.id === sort}
                    onClick={() => { onSort(s.id); setSortOpen(false); }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </React.Fragment>
          )}
        </div>

        <div className="w-sort">
          <button
            className="w-new"
            style={{ background: t ? t.color : "var(--ink)" }}
            onClick={() => (t ? onNew(scope) : setNewOpen((v) => !v))}
            aria-expanded={t ? undefined : newOpen}
          >
            <IcPlus size={14} /> 新建{t ? t.zh : ""}
            {!t && <IcChevron size={12} />}
          </button>
          {!t && newOpen && (
            <React.Fragment>
              <button className="w-backdrop" onClick={() => setNewOpen(false)} aria-label="关闭新建菜单"></button>
              <div className="w-menu" role="menu">
                {TYPE_ORDER.map((k) => (
                  <button key={k} className="w-menuitem" role="menuitem" onClick={() => { setNewOpen(false); onNew(k); }}>
                    <span className="w-sq" style={{ background: TYPES[k].color }}></span>
                    {TYPES[k].zh}
                  </button>
                ))}
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    </header>
  );
}

/* ---------- 行内动作：删除要点一次确认 ---------- */
function RowActions({ post, onDelete, solid }) {
  const [confirming, setConfirming] = React.useState(false);
  return (
    <div className={solid ? "w-tileacts" : "w-rowacts"}>
      <button
        className={"w-icon" + (confirming ? " confirm" : "")}
        title={confirming ? "再点一次删除" : "删除这篇稿子"}
        aria-label={confirming ? "确认删除" : "删除 " + (post.title || "未命名")}
        onMouseLeave={() => setConfirming(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (confirming) onDelete(post.id);
          else setConfirming(true);
        }}
      >
        {confirming ? "删除？" : <IcX size={11} />}
      </button>
    </div>
  );
}

/* ---------- 行：文章、音频，以及「全部稿子」里的任意类型 ---------- */
function PostRow({ post, showKind, live, onOpen, onDelete }) {
  const t = TYPES[post.type];
  const excerpt = plainSummary(post.body);
  return (
    <article
      className="w-row"
      tabIndex={0}
      role="button"
      onClick={() => onOpen(post.id)}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(post.id); }}
    >
      {showKind && (
        <span className="w-kind">
          <span className="w-sq" style={{ background: t.color }}></span>
          <span className="w-kindtxt">{t.en}</span>
        </span>
      )}
      <div className="w-rowmain">
        <h3 className="w-rowtitle">{post.title || "未命名稿子"}</h3>
        <p className="w-rowexcerpt">{excerpt || "还没写内容，点开继续。"}</p>
      </div>
      {live && <span className="w-live"><i></i>发布中</span>}
      <div className="w-rowmeta">
        <span>{post.updated}</span>
        {post.duration
          ? <span className="w-dur" style={{ color: t.color }}><IcPlay size={8} /> {post.duration}</span>
          : <span>{post.images ? post.images.length + " 图 · " : ""}{post.body.length} 字</span>}
      </div>
      <RowActions post={post} onDelete={onDelete} />
    </article>
  );
}

/* ---------- 格子：贴图用拼贴封面，视频用 16:9 封面 ---------- */
function ImageTile({ post, onOpen, onDelete, dnd }) {
  const imgs = post.images || [];
  const cells = [0, 1, 2, 3].map((i) => imgs[i % Math.max(imgs.length, 1)]);
  const cls = "w-tile"
    + (dnd && dnd.dragId === post.id ? " dragging" : "")
    + (dnd && dnd.pressing === post.id ? " pressing" : "");
  return (
    <article
      className={cls}
      ref={dnd ? (el) => dnd.register(post.id, el) : undefined}
      tabIndex={0}
      role="button"
      aria-label={(post.title || "未命名稿子") + (dnd ? "，长按可拖动排序" : "")}
      onPointerDown={dnd ? (e) => dnd.onTilePointerDown(e, post.id) : undefined}
      onClick={() => { if (dnd && dnd.shouldSuppressClick()) return; onOpen(post.id); }}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(post.id); }}
    >
      <div className="w-coverwrap">
        <div className="w-mosaic" aria-hidden="true">
          {cells.map((im, i) => (<i key={i} style={{ background: im ? im.color : "#E4E0D4" }}></i>))}
          <span className="w-count">{imgs.length} 张</span>
        </div>
        <RowActions post={post} onDelete={onDelete} solid />
      </div>
      <div className="w-tilemain">
        <h3 className="w-tiletitle">{post.title || "未命名稿子"}</h3>
        <div className="w-tilemeta">
          <span>{post.updated}</span>
          <span>{post.body.length} 字</span>
        </div>
      </div>
    </article>
  );
}

function VideoTile({ post, onOpen, onDelete }) {
  return (
    <article className="w-tile" tabIndex={0} role="button" onClick={() => onOpen(post.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(post.id); }}>
      <div className="w-coverwrap">
        <div className="w-vcover" aria-hidden="true">
          <span className="badge">封面占位</span>
          <span className="tri"></span>
          <span className="dur">{post.duration || "00:00"}</span>
        </div>
        <RowActions post={post} onDelete={onDelete} solid />
      </div>
      <div className="w-tilemain">
        <h3 className="w-tiletitle">{post.title || "未命名稿子"}</h3>
        <div className="w-tilemeta">
          <span>{post.updated}</span>
          <span>{post.duration}</span>
        </div>
      </div>
    </article>
  );
}

/* ---------- 主视图 ---------- */
function LibraryView({ scope, posts, query, sort, runningIds, onOpen, onDelete, onNew, onQuery, onSort, onReorder }) {
  const t = scope === "all" ? null : TYPES[scope];
  const counts = React.useMemo(() => {
    const c = { article: 0, image: 0, video: 0, audio: 0 };
    posts.forEach((p) => { c[p.type] = (c[p.type] || 0) + 1; });
    return c;
  }, [posts]);

  /* 过滤 + 排序：O(n) + O(n log n)。列表再长也是这个量级，
     真正的天花板在 DOM 节点数上，所以过千条要换成窗口化渲染。 */
  const list = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = scope === "all" ? posts.slice() : posts.filter((p) => p.type === scope);
    if (q) out = out.filter((p) => (p.title + " " + p.body).toLowerCase().indexOf(q) >= 0);
    out.sort((a, b) => {
      /* 自定义顺序 = 数组本身的顺序（拖动排序后停在档）；sort 稳定，返回 0 即保持原序 */
      if (sort === "manual") return 0;
      if (sort === "title") return (a.title || "").localeCompare(b.title || "", "zh");
      const d = stamp(a.updated) - stamp(b.updated);
      return sort === "oldest" ? d : -d;
    });
    return out;
  }, [posts, scope, query, sort]);

  const title = t ? t.zh : "全部稿子";

  /* 长按拖动排序只开在贴图上：其它类型的顺序由时间决定，手动排没有意义。
     搜索中、或按标题排的时候也先关掉 —— 那时顺序不是用户排的。 */
  const orderable = scope === "image" && sort !== "title" && !query.trim();
  const meta = [
    list.length + " 篇",
    t ? t.en : "ALL TYPES",
    query.trim() ? "筛选「" + query.trim() + "」" : null,
    orderable ? "长按方块可拖动排序" : null,
  ].filter(Boolean).join(" · ");

  const grid = scope === "image" || scope === "video";
  const showKind = scope === "all";

  const dnd = useLongPressReorder({
    ids: orderable ? list.map((p) => p.id) : [],
    onCommit: (ids) => onReorder(ids),
  });
  /* 预览顺序按 id 回填：先建索引再取，别在 map 里 find（那是 O(n²)） */
  const shown = (() => {
    if (!orderable || !dnd.order) return list;
    const byId = new Map(list.map((p) => [p.id, p]));
    return dnd.order.map((id) => byId.get(id)).filter(Boolean);
  })();

  return (
    <div className="w-view" data-screen-label={t ? "内容库 · " + t.zh : "内容库 · 全部稿子"}>
      <div className="w-canvas">
        <ViewHead
          title={title}
          meta={meta}
          query={query}
          onQuery={onQuery}
          sort={sort}
          onSort={onSort}
          scope={scope}
          onNew={onNew}
        />
        <div className="w-scroll">
          {list.length === 0 && (
            <div className="w-empty">
              {query.trim() ? "没有匹配「" + query.trim() + "」的稿子 — 换个词，或清空搜索" : "这里还没有内容 — 点右上角新建一篇"}
            </div>
          )}
          {!grid && (
            <div className="w-list">
              {list.map((p) => (
                <PostRow
                  key={p.id}
                  post={p}
                  showKind={showKind}
                  live={runningIds.indexOf(p.id) >= 0}
                  onOpen={onOpen}
                                    onDelete={onDelete}
                />
              ))}
            </div>
          )}
          {grid && (
            <div className={"w-grid" + (dnd.dragId ? " reordering" : "")} ref={dnd.gridRef}>
              {shown.map((p) => (p.type === "video"
                ? <VideoTile key={p.id} post={p} onOpen={onOpen} onDelete={onDelete} />
                : <ImageTile key={p.id} post={p} onOpen={onOpen} onDelete={onDelete} dnd={orderable ? dnd : null} />))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Sidebar, LibraryView, stamp, SORTS });
