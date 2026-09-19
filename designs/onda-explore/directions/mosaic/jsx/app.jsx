/* app.jsx — 根组件：单页 state + 后台发布任务引擎
   视图只有三个：内容库（左栏 + 列表）、发布队列、编辑器。
   发布事实只存一处 —— tasks；稿子上不再挂状态字段。 */
function nowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0");
}

function App() {
  const [view, setView] = React.useState("library"); // library | queue | editor
  const [scope, setScope] = React.useState("all");   // all | article | image | video | audio
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState("recent");
  /* 纯文本正文（body）装载时补齐富文本形态（bodyHtml）：编辑与预览都用同一份 */
  const [posts, setPosts] = React.useState(() => POSTS.map((p) => ({
    ...p,
    bodyHtml: p.bodyHtml || mdToHtml(p.body || "", TYPES[p.type].color, p.images || []),
  })));
  const [editingId, setEditingId] = React.useState(null);
  const [platforms, setPlatforms] = React.useState(() => PLATFORMS.map((p) => ({ ...p, selected: false })));
  const [defaults, setDefaults] = React.useState(DEFAULT_TARGETS);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [tasks, setTasks] = React.useState(() => [
    {
      id: "seed-1", postId: "i2", postTitle: "白露之后的云", platformId: "xhs",
      progress: 100, stage: 3, status: "success", willFail: false, failReason: null,
      url: platformLink("xhs", "K7F2Q9Z1"), createdAt: "09-11 21:12", finishedAt: "09-11 21:14:31",
    },
    {
      id: "seed-2", postId: "a1", postTitle: "为什么我们团队在周五下午不发版", platformId: "wechat",
      progress: 100, stage: 3, status: "success", willFail: false, failReason: null,
      url: platformLink("wechat", "M3P8T2WD"), createdAt: "09-12 14:20", finishedAt: "09-12 14:21:08",
    },
    {
      id: "seed-3", postId: "a1", postTitle: "为什么我们团队在周五下午不发版", platformId: "xhs",
      progress: 100, stage: 3, status: "success", willFail: false, failReason: null,
      url: platformLink("xhs", "Q9L4V7GB"), createdAt: "09-12 14:20", finishedAt: "09-12 14:20:52",
    },
    {
      id: "seed-4", postId: "v1", postTitle: "三分钟讲清「公摊面积」", platformId: "douyin",
      progress: 34, stage: 1, status: "running", willFail: false, failReason: null,
      url: null, token: newToken(), createdAt: "09-12 14:31", finishedAt: null,
    },
  ]);

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

  const openScope = (k) => { setScope(k); setView("library"); setQuery(""); };
  const openQueue = () => setView("queue");
  const openPost = (id) => { setEditingId(id); setView("editor"); };

  const newPost = (type) => {
    const id = "p" + Date.now();
    const base = { id, type, updated: "09-12 " + nowTime().slice(0, 5), title: "", body: "", bodyHtml: "" };
    if (type === "image") base.images = [asset("#D52088"), asset("#FD8D11"), asset("#2C6FF0")];
    if (type === "video") base.duration = "00:00";
    if (type === "audio") { base.duration = "00:00"; base.durationSec = 60; }
    setPosts((ps) => [base, ...ps]);
    setEditingId(id);
    setView("editor");
  };
  const changePost = (id, k, v) => setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, [k]: v } : p)));
  /* 拖动排序：可见的那几篇按新顺序填回它们原来占的槽位，
     其它类型的稿子位置不动；同时把排序档切到「自定义顺序」，否则下一次排序会把顺序抹掉。 */
  const reorderPosts = (ids) => {
    setSort("manual");
    setPosts((ps) => {
      const picked = new Set(ids);
      const byId = new Map(ps.map((p) => [p.id, p]));
      const queue = ids.slice();
      return ps.map((p) => (picked.has(p.id) ? byId.get(queue.shift()) : p));
    });
  };
  const deletePost = (id) => {
    setPosts((ps) => ps.filter((p) => p.id !== id));
    if (editingId === id) { setEditingId(null); setView("library"); }
  };

  const togglePlatform = (id) => {
    setPlatforms((ps) => ps.map((p) => (p.id === id && p.state === "ok" ? { ...p, selected: !p.selected } : p)));
  };
  /* 获取失败 → 重新获取：模拟重新授权，拿到凭据后即可加入本次发布 */
  const reacquirePlatform = (id) => {
    setPlatforms((ps) => ps.map((p) => (p.id === id ? { ...p, state: "ok", selected: true } : p)));
  };
  /* 设置里的「重新获取」：只补凭据，不改变任何类型的默认名单 */
  const reacquireAccount = (id) => {
    setPlatforms((ps) => ps.map((p) => (p.id === id ? { ...p, state: "ok" } : p)));
  };
  const toggleDefault = (type, id) => {
    setDefaults((d) => {
      const cur = d[type] || [];
      return { ...d, [type]: cur.indexOf(id) >= 0 ? cur.filter((x) => x !== id) : cur.concat([id]) };
    });
  };
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

  const counts = React.useMemo(() => {
    const c = { article: 0, image: 0, video: 0, audio: 0 };
    posts.forEach((p) => { c[p.type] = (c[p.type] || 0) + 1; });
    return c;
  }, [posts]);
  const runningIds = React.useMemo(
    () => Array.from(new Set(tasks.filter((t) => t.status === "running").map((t) => t.postId))),
    [tasks]
  );
  const runningCount = tasks.filter((t) => t.status === "running").length;
  const editing = posts.find((p) => p.id === editingId);

  return (
    <div className="m-app">
      <div className="w-shell">
        <Sidebar
          view={view}
          scope={scope}
          counts={counts}
          total={posts.length}
          runningCount={runningCount}
          queueCount={tasks.length}
          platforms={platforms}
          onScope={openScope}
          onQueue={openQueue}
          onSettings={() => setSettingsOpen(true)}
        />
        <div className="w-stage">
          {view === "library" && (
            <LibraryView
              scope={scope}
              posts={posts}
              query={query}
              sort={sort}
              runningIds={runningIds}
              onOpen={openPost}
              onDelete={deletePost}
              onNew={newPost}
              onQuery={setQuery}
              onSort={setSort}
              onReorder={reorderPosts}
            />
          )}

          {view === "queue" && (
            <div className="w-view" data-screen-label="发布队列">
              <div className="w-canvas">
                <header className="w-head">
                  <div className="w-headline">
                    <h1 className="w-h1">发布队列</h1>
                    <span className="w-hmeta">{tasks.length} 个发布动作 · 发布事实只此一处</span>
                  </div>
                </header>
                <div className="w-scroll">
                  <TasksView tasks={tasks} posts={posts} onRetry={retryTask} onOpen={openPost} />
                </div>
              </div>
            </div>
          )}

          {view === "editor" && editing && (
            <EditorView
              post={editing}
              onChange={changePost}
              onBack={() => setView("library")}
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
        </div>
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

      {settingsOpen && (
        <SettingsSheet
          platforms={platforms}
          defaults={defaults}
          onToggle={toggleDefault}
          onAcquire={acquireDefault}
          onReacquire={reacquireAccount}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <FloatingPill tasks={tasks} onClick={openQueue} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
