/* library.jsx — 工作台主界面：左侧栏（四类型 + 发布队列）+ 统一卡片网格
   设计意图：四种内容共用一个卡片壳，封面各自长脸；
   类型是颜色与筛选维度，不再是布局结构。 */

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
function Sidebar({ view, scope, counts, runningCount, queueCount, platforms, onScope, onQueue, onNew, onSettings, collapsed, onToggleRail }) {
  const active = view === "queue" ? "queue" : scope;
  /* 凭据缺了才提醒：全拿到的时候设置这一行不带任何噪音 */
  const missing = platforms.filter((p) => p.state !== "ok").length;
  return (
    <aside className={"w-rail" + (collapsed ? " fr-collapsed" : "")} aria-label="工作台导航" aria-hidden={collapsed || undefined}>
      {/* 红绿灯在真机上是系统控件，原型不再模拟 */}
      {/* 折叠按钮：红绿灯右侧空位；收起后由左上角悬浮按钮接管 */}
      <button className="fr-toggle" onClick={onToggleRail} aria-label={collapsed ? "展开侧栏" : "收起侧栏"} title={collapsed ? "展开侧栏" : "收起侧栏"}>
        <IcPanel size={15} />
        <span className="fr-kbd">⌘\</span>
      </button>
      <div className="w-railclip" style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0, flex: 1 }}>
      <div className="m-brand">
        <MosaicLogo size={10} />
        <div>
          <div className="m-brand-name">九漾 Onda</div>
        </div>
      </div>

      {/* 新建内容：弹出四类型菜单，建好直达编辑器 */}
      <NewContentMenu onNew={onNew} />

      {/* 第一组：四种内容类型。它们是日常主路径，所以排在最上面 */}
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
              <span className="w-sq" style={{ background: t.color }}></span>
              <span>{t.zh}</span>
              <span className="w-navn">{String(counts[k]).padStart(2, "0")}</span>
            </button>
          );
        })}
      </nav>

      {/* 第二组：跨类型的入口，放在四类之下、字号收一档 */}
      <nav className="w-navsub" aria-label="其他入口">
        <button
          className={"w-navitem" + (active === "queue" ? " on" : "")}
          aria-current={active === "queue" ? "page" : undefined}
          onClick={onQueue}
        >
          <span className="w-sq" style={{ background: "var(--green)" }}></span>
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
      </div>
    </aside>
  );
}

/* 新建内容菜单：主按钮交互蓝，菜单里四类型各带色块 */
function NewContentMenu({ onNew }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="w-sort">
      <button className="w-newall" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        <IcPlus size={14} /> 新建内容
      </button>
      {open && (
        <React.Fragment>
          <button className="w-backdrop" onClick={() => setOpen(false)} aria-label="关闭新建菜单"></button>
          <div className="w-menu left" role="menu" style={{ top: "calc(100% + 8px)", left: 0, right: "auto" }}>
            {TYPE_ORDER.map((k) => (
              <button key={k} className="w-menuitem" role="menuitem" onClick={() => { setOpen(false); onNew(k); }}>
                <span className="w-sq" style={{ background: TYPES[k].color }}></span>
                {TYPES[k].zh}
                <span className="w-navn" style={{ marginLeft: "auto" }}>{TYPES[k].en}</span>
              </button>
            ))}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

/* ---------- 主区头部：标题 + 搜索 + 排序 + 新建（scope 恒为某一类型，新建直达） ---------- */
function ViewHead({ title, meta, query, onQuery, sort, onSort, scope, onNew }) {
  const [sortOpen, setSortOpen] = React.useState(false);
  const searchRef = React.useRef(null);
  const cur = SORTS.find((s) => s.id === sort) || SORTS[0];
  const t = TYPES[scope];

  /* ⌘K / Ctrl+K 直接落到搜索框：内容一多，键盘是唯一还快的入口 */
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (searchRef.current) searchRef.current.focus();
      }
      if (e.key === "Escape") setSortOpen(false);
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

        <button className="w-new" style={{ background: t.color }} onClick={() => onNew(scope)}>
          <IcPlus size={14} /> 新建{t.zh}
        </button>
      </div>
    </header>
  );
}

/* ---------- 行内动作：删除只负责发起，确认走弹窗 ---------- */
function RowActions({ post, onAskDelete, solid }) {
  return (
    <div className="w-tileacts" onClick={(e) => e.stopPropagation()}>
      <button
        className="w-icon"
        title="删除这篇稿子"
        aria-label={"删除 " + (post.title || "未命名")}
        onClick={(e) => {
          e.stopPropagation();
          onAskDelete(post);
        }}
      >
        <IcX size={11} />
      </button>
    </div>
  );
}

/* ---------- 封面角标：「发布中」钉在封面左下角 ---------- */
function CoverLive({ live }) {
  if (!live) return null;
  return (
    <span className="w-livepill"><i></i>发布中</span>
  );
}

/* 「已发布」贴纸：标题行的小徽标，提示这篇发出去过，防止重复发布 */
function PublishedBadge({ published }) {
  if (!published) return null;
  return (
    <span className="w-pubbadge"><IcCheck size={9} />已发布</span>
  );
}

/* 卡片标题行：标题两行截断 + 日期 / 可选附加信息 / 已发布 */
function TileTitleMeta({ post, extra, published }) {
  return (
    <div className="w-tilemain">
      <h3 className="w-tiletitle">{post.title || "未命名稿子"}</h3>
      <div className="w-tilemeta">
        <span>{post.updated}</span>
        {extra ? <span>{extra}</span> : null}
        <PublishedBadge published={!!published} />
      </div>
    </div>
  );
}

/* ---------- 文章卡：三行摘要直接当封面 ---------- */
function ArticleTile({ post, live, published, onOpen, onAskDelete }) {
  const excerpt = plainSummary(post.body);
  return (
    <article className="w-tile" tabIndex={0} role="button" onClick={() => onOpen(post.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(post.id); }}>
      <div className="w-coverwrap">
        <div className="w-cover" aria-hidden="true">
          <span className={"w-covertext" + (excerpt ? "" : " empty")}>{excerpt || "还没写内容"}</span>
          <CoverLive live={live} />
        </div>
        <RowActions post={post} onAskDelete={onAskDelete} solid />
      </div>
      <TileTitleMeta post={post} published={published} />
    </article>
  );
}

/* ---------- 音频卡：摘要封面 + 青色三角 + 时长 ---------- */
function AudioTile({ post, live, published, onOpen, onAskDelete }) {
  const excerpt = plainSummary(post.body);
  return (
    <article className="w-tile" tabIndex={0} role="button" onClick={() => onOpen(post.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(post.id); }}>
      <div className="w-coverwrap">
        <div className="w-cover" aria-hidden="true">
          <span className={"w-covertext audio" + (excerpt ? "" : " empty")}>{excerpt || "还没写内容"}</span>
          <span className="w-audiotri"></span>
          <span className="w-coverdur">{post.duration || "00:00"}</span>
          <CoverLive live={live} />
        </div>
        <RowActions post={post} onAskDelete={onAskDelete} solid />
      </div>
      <TileTitleMeta post={post} extra={post.duration || "00:00"} published={published} />
    </article>
  );
}

/* ---------- 贴图卡：2×2 拼贴封面，张数写在角上 ---------- */
function ImageTile({ post, live, published, onOpen, onAskDelete, dnd }) {
  const imgs = post.images || [];
  const n = imgs.length;
  const shown = n === 0 ? [undefined, undefined, undefined, undefined] : imgs.slice(0, 4);
  /* 1 张独占，2 张左右各半，3 张第一张横跨，4 张各占一格 */
  const cellStyle = (im, i) => {
    const st = { background: im ? im.color : "var(--line)" };
    if (n === 1) { st.gridColumn = "span 2"; st.gridRow = "span 2"; }
    else if (n === 2) { st.gridRow = "span 2"; }
    else if (n === 3 && i === 0) { st.gridColumn = "span 2"; }
    return st;
  };
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
          {shown.map((im, i) => (<i key={im ? im.id : i} style={cellStyle(im, i)}></i>))}
          <CoverLive live={live} />
        </div>
        <RowActions post={post} onAskDelete={onAskDelete} solid />
      </div>
      <TileTitleMeta post={post} published={published} />
    </article>
  );
}

/* ---------- 视频卡：16:9 封面 + 播放三角 + 时长（时长只出现在封面上，不重复） ---------- */
function VideoTile({ post, live, published, onOpen, onAskDelete }) {
  return (
    <article className="w-tile" tabIndex={0} role="button" onClick={() => onOpen(post.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(post.id); }}>
      <div className="w-coverwrap">
        <div className="w-cover v" aria-hidden="true">
          <span className="w-vtri"></span>
          <span className="w-coverdur">{post.duration || "00:00"}</span>
          <CoverLive live={live} />
        </div>
        <RowActions post={post} onAskDelete={onAskDelete} solid />
      </div>
      <TileTitleMeta post={post} published={published} />
    </article>
  );
}

/* ---------- 主视图：四种类型全部以卡片呈现 ---------- */
function LibraryView({ scope, posts, query, sort, runningIds, publishedIds, onOpen, onDelete, onNew, onQuery, onSort, onReorder }) {
  const t = TYPES[scope];
  /* 删除确认：卡片上的 × 只负责发起，这里集中弹窗确认 */
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  React.useEffect(() => {
    if (!deleteTarget) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setDeleteTarget(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget]);

  /* 过滤 + 排序：O(n) + O(n log n)。列表再长也是这个量级，
     真正的天花板在 DOM 节点数上，所以过千条要换成窗口化渲染。 */
  const list = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = posts.filter((p) => p.type === scope);
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

  /* 长按拖动排序只开在贴图上：其它类型的顺序由时间决定，手动排没有意义。
     搜索中、或按标题排的时候也先关掉 —— 那时顺序不是用户排的。 */
  const orderable = scope === "image" && sort !== "title" && !query.trim();
  const meta = [
    list.length + " 篇",
    t.en,
    query.trim() ? "筛选「" + query.trim() + "」" : null,
  ].filter(Boolean).join(" · ");

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

  const renderTile = (p) => {
    const live = runningIds.indexOf(p.id) >= 0;
    const published = publishedIds.indexOf(p.id) >= 0;
    const askDelete = setDeleteTarget;
    if (p.type === "video") return <VideoTile key={p.id} post={p} live={live} published={published} onOpen={onOpen} onAskDelete={askDelete} />;
    if (p.type === "image") return <ImageTile key={p.id} post={p} live={live} published={published} onOpen={onOpen} onAskDelete={askDelete} dnd={orderable ? dnd : null} />;
    if (p.type === "audio") return <AudioTile key={p.id} post={p} live={live} published={published} onOpen={onOpen} onAskDelete={askDelete} />;
    return <ArticleTile key={p.id} post={p} live={live} published={published} onOpen={onOpen} onAskDelete={askDelete} />;
  };

  return (
    <div className="w-view" data-screen-label={"内容库 · " + t.zh}>
      <div className="w-canvas">
        <ViewHead
          title={t.zh}
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
              {query.trim() ? "没有匹配「" + query.trim() + "」的稿子" : "还没有内容"}
            </div>
          )}
          <div className={"w-grid" + (dnd.dragId ? " reordering" : "")} ref={dnd.gridRef}>
            {shown.map(renderTile)}
          </div>
        </div>
      </div>

      {/* 删除确认：与实现的 AlertDialog 同构 —— 取消 / 删除，Esc 或点背景取消 */}
      {deleteTarget && (
        <div className="m-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="m-mini" role="alertdialog" aria-label="删除确认" data-screen-label="删除确认" onClick={(e) => e.stopPropagation()}>
            <h3>删除这篇稿子？</h3>
            <p>「{deleteTarget.title || "未命名"}」将被删除，此操作不可撤销。</p>
            <div className="m-mini-foot">
              <button className="m-btn-plain" onClick={() => setDeleteTarget(null)}>取消</button>
              <button
                className="m-btn-error"
                onClick={() => { const t = deleteTarget; setDeleteTarget(null); onDelete(t.id); }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Sidebar, LibraryView, stamp, SORTS });
