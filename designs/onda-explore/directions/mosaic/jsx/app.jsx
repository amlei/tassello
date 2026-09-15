/* app.jsx — 根组件：单页 state 切换 + 后台发布任务引擎 */
function nowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0");
}

function App() {
  const [view, setView] = React.useState("home"); // home | editor | tasks
  const [posts, setPosts] = React.useState(POSTS);
  const [editingId, setEditingId] = React.useState(null);
  const [platforms, setPlatforms] = React.useState(() => PLATFORMS.map((p) => ({ ...p, selected: false })));
  const [defaults, setDefaults] = React.useState(DEFAULT_TARGETS);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [defaultsOpen, setDefaultsOpen] = React.useState(false);
  const [tasks, setTasks] = React.useState(() => [{
    id: "seed-1", postId: "i2", postTitle: "白露之后的云", platformId: "xhs",
    progress: 100, stage: 3, status: "success", willFail: false, failReason: null,
    url: platformLink("xhs", "K7F2Q9Z1"),
    createdAt: "09-11 21:12", finishedAt: "09-11 21:14:31",
  }]);

  /* 发布任务引擎：按进度推进每个进行中任务，成功时落一条平台回执链接 */
  React.useEffect(() => {
    const timer = setInterval(() => {
      setTasks((ts) => {
        if (!ts.some((t) => t.status === "running")) return ts;
        return ts.map((t) => {
          if (t.status !== "running") return t;
          const progress = Math.min(100, t.progress + 5 + Math.random() * 9);
          const stage = Math.min(3, Math.floor(progress / 25));
          /* 可归因失败：微博 500 字上限 */
          if (t.willFail && stage === 3 && progress >= 90) {
            return { ...t, progress, stage, status: "failed",
              failReason: "正文 " + t.bodyLen + " 字，超出微博 500 字上限（未开通长文权限）",
              finishedAt: "09-12 " + nowTime() };
          }
          if (progress >= 100) {
            return { ...t, progress: 100, stage: 3, status: "success",
              url: platformLink(t.platformId, t.token), finishedAt: "09-12 " + nowTime() };
          }
          return { ...t, progress, stage };
        });
      });
    }, 800);
    return () => clearInterval(timer);
  }, []);

  const openPost = (id) => { setEditingId(id); setView("editor"); };
  const newPost = (type) => {
    const id = "p" + Date.now();
    const base = { id, type, status: "draft", updated: "09-12 " + nowTime().slice(0, 5), title: "", body: "" };
    if (type === "image") base.images = [asset("#D52088"), asset("#FD8D11"), asset("#2C6FF0")];
    if (type === "video") base.duration = "00:00";
    if (type === "audio") { base.duration = "00:00"; base.durationSec = 60; }
    setPosts((ps) => [{ ...base, title: "", body: "" }, ...ps]);
    setEditingId(id);
    setView("editor");
  };
  const changePost = (id, k, v) => {
    setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, [k]: v } : p)));
  };
  const deletePost = (id) => {
    setPosts((ps) => ps.filter((p) => p.id !== id));
    if (editingId === id) { setEditingId(null); setView("home"); }
  };

  const togglePlatform = (id) => {
    setPlatforms((ps) => ps.map((p) => (p.id === id && p.state === "ok" ? { ...p, selected: !p.selected } : p)));
  };
  /* 获取失败 → 重新获取：模拟重新授权，拿到凭据后即可加入本次发布 */
  const reacquirePlatform = (id) => {
    setPlatforms((ps) => ps.map((p) => (p.id === id ? { ...p, state: "ok", selected: true } : p)));
  };
  /* 默认名单：按稿子类型记一份平台 id 列表 */
  const toggleDefault = (type, id) => {
    setDefaults((d) => {
      const cur = d[type] || [];
      return { ...d, [type]: cur.indexOf(id) >= 0 ? cur.filter((x) => x !== id) : cur.concat([id]) };
    });
  };
  /* 在默认平台面板里点一个灰掉的平台：先重新获取凭据，顺手设为该类型的默认 */
  const acquireDefault = (type, id) => {
    setPlatforms((ps) => ps.map((p) => (p.id === id ? { ...p, state: "ok" } : p)));
    setDefaults((d) => ((d[type] || []).indexOf(id) >= 0 ? d : { ...d, [type]: (d[type] || []).concat([id]) }));
  };

  const confirmPublish = () => {
    const post = posts.find((p) => p.id === editingId);
    const selected = platforms.filter((p) => p.selected);
    const newTasks = selected.map((p, i) => ({
      id: "t" + Date.now() + "-" + i,
      postId: post.id, postTitle: post.title || "未命名", platformId: p.id,
      progress: 0, stage: 0, status: "running",
      bodyLen: post.body.length,
      willFail: p.id === "weibo" && post.body.length > 500,
      failReason: null, url: null, token: newToken(),
      createdAt: "09-12 " + nowTime(), finishedAt: null,
    }));
    setTasks((ts) => [...newTasks, ...ts]);
    setPlatforms((ps) => ps.map((p) => ({ ...p, selected: false })));
    setSheetOpen(false); /* 弹层立刻关闭，界面不阻塞 */
  };

  const retryTask = (id) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? {
      ...t, progress: 0, stage: 0, status: "running", willFail: false, failReason: null, url: null, finishedAt: null,
    } : t)));
  };

  const runningCount = tasks.filter((t) => t.status === "running").length;
  const editing = posts.find((p) => p.id === editingId);

  return (
    <div className="m-app">
      <div className="m-topbar">
        <div className="m-brand">
          <MosaicLogo size={11} />
          <div>
            <div className="m-brand-name">九漾 Onda</div>
            <div className="m-brand-sub">content worksbench</div>
          </div>
        </div>
        <div className="m-nav">
          <button className={"m-tab" + (view === "home" ? " on" : "")} onClick={() => setView("home")}>我的稿子</button>
          <button className={"m-tab" + (view === "tasks" ? " on" : "")} onClick={() => setView("tasks")}>
            发布队列
            {runningCount > 0 && <span className="m-tab-badge">{runningCount}</span>}
          </button>
        </div>
        <div className="m-topright">
          {/* 平台栏常驻顶栏：整个应用里都看得见有哪些出口、各自拿没拿到凭据 */}
          <div className="m-platrail">
            {/* 每个 icon 都可点：进去就是这份名单，没获取到的在那里一键重新获取 */}
            {platforms.map((p) => (
              <button
                key={p.id}
                className={"m-picon" + (p.state === "ok" ? "" : " fail")}
                style={p.state === "ok" ? { background: p.color, color: p.fg || "#fff" } : { color: "#A9A294" }}
                onClick={() => setDefaultsOpen(true)}
                title={p.name + (p.state === "ok" ? " · 已获取 · 点开设置默认发布平台" : " · 获取失败 · 点开重新获取")}
                aria-label={p.name + (p.state === "ok" ? " 已获取" : " 获取失败")}
              >
                {p.char}
              </button>
            ))}
            <button className="m-pset" onClick={() => setDefaultsOpen(true)} title="设置各类型稿子的默认发布平台">
              默认
            </button>
          </div>
          <span className="m-psep"></span>
          <span>{platforms.filter((p) => p.state === "ok").length}/{platforms.length} 已获取</span>
          <span>{posts.length} 篇稿子</span>
        </div>
      </div>

      <div className="m-main">
        {view === "home" && <HomeView posts={posts} onOpen={openPost} onNew={newPost} onDelete={deletePost} />}
        {view === "editor" && editing && (
          <EditorView
            post={editing}
            onChange={changePost}
            onBack={() => setView("home")}
            onPublish={() => {
              /* 打开发布弹层：按「该类型的默认平台」预选（拿不到凭据的不算） */
              const want = defaults[editing.type] || [];
              setPlatforms((ps) => ps.map((p) => ({
                ...p,
                selected: p.state === "ok" && supportsType(p, editing.type) && want.indexOf(p.id) >= 0,
              })));
              setSheetOpen(true);
            }}
          />
        )}
        {view === "tasks" && <TasksView tasks={tasks} posts={posts} onRetry={retryTask} />}
      </div>

      {sheetOpen && editing && (
        <PublishSheet
          post={editing}
          platforms={platforms}
          onToggle={togglePlatform}
          onReacquire={reacquirePlatform}
          onClose={() => setSheetOpen(false)}
          onConfirm={confirmPublish}
        />
      )}

      {defaultsOpen && (
        <DefaultsSheet
          platforms={platforms}
          defaults={defaults}
          onToggle={toggleDefault}
          onAcquire={acquireDefault}
          onClose={() => setDefaultsOpen(false)}
        />
      )}

      <FloatingPill tasks={tasks} onClick={() => setView("tasks")} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
