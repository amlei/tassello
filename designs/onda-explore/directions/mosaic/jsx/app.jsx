/* app.jsx — 根组件：单页 state + 后台发布任务引擎
   视图只有三个：内容库（左栏 + 列表）、发布队列、编辑器。
   发布事实只存一处 —— tasks；稿子上不再挂状态字段。 */
function nowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0");
}

function App() {
  const [view, setView] = React.useState("library"); // library | queue | editor
  const [scope, setScope] = React.useState("article"); // article | image | video | audio
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
  /* 未保存离开确认：editorDirty 由编辑器上报；pendingLeave 存放被拦下的动作 */
  const [editorDirty, setEditorDirty] = React.useState(false);
  const [pendingLeave, setPendingLeave] = React.useState(null);
  /* 专注模式：⌘\ 或红绿灯右侧按钮收起/展开左栏；进编辑器自动收起，回列表自动展开 */
  const [railCollapsed, setRailCollapsed] = React.useState(false);
  const toggleRail = () => setRailCollapsed((v) => !v);
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setRailCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  /* 收起状态挂到 body：主区头部（标题/编辑器顶栏）据此让位红绿灯与悬浮按钮 */
  React.useEffect(() => {
    document.body.classList.toggle("fr-collapsed", railCollapsed);
    return () => document.body.classList.remove("fr-collapsed");
  }, [railCollapsed]);
  const leaveGuard = (action) => {
    if (view === "editor" && editorDirty) setPendingLeave(() => action);
    else action();
  };
  /* 真·离开页面（刷新 / 关闭）也要拦一道 */
  React.useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!editorDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editorDirty]);
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
      /* 多频道平台：任务上记着落进了哪个频道（小宇宙的「九漾电台」节目） */
      id: "seed-2b", postId: "p1", postTitle: "EP.12 和夜班出租车司机聊一座城市的背面", platformId: "xiaoyuzhou",
      channelName: "九漾电台",
      progress: 100, stage: 3, status: "success", willFail: false, failReason: null,
      url: platformLink("xiaoyuzhou", "R2K7M4XQ"), createdAt: "09-12 10:02", finishedAt: "09-12 10:03:44",
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
    /* 失败种子 ×3：让失败态开箱可见，三种处置各占一种
       · 瞬时失败（可重试）· 稿子被删（无法重试，postId 指向不存在的稿子）
       · 超字数上限（需改稿，重试无效） */
    {
      id: "seed-f1", postId: "a2", postTitle: "从0到1做内部工具的五个坑", platformId: "wechat",
      progress: 62, stage: 2, status: "failed", willFail: false,
      failReason: "连接超时",
      url: null, token: newToken(), createdAt: "09-12 15:02", finishedAt: "09-12 15:03:41",
    },
    {
      id: "seed-f2", postId: "ghost-1", postTitle: "未命名", platformId: "wechat",
      progress: 0, stage: 0, status: "failed", willFail: false,
      failReason: "稿子已删除",
      url: null, token: newToken(), createdAt: "09-12 12:40", finishedAt: "09-12 12:40:18",
    },
    {
      id: "seed-f3", postId: "a1", postTitle: "为什么我们团队在周五下午不发版", platformId: "weibo",
      progress: 100, stage: 3, status: "failed", willFail: true,
      failReason: "超出 500 字上限",
      url: null, token: newToken(), createdAt: "09-12 11:58", finishedAt: "09-12 11:59:07",
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
              failReason: "超出 500 字上限",
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

  const openScope = (k) => { setScope(k); setView("library"); setQuery(""); setRailCollapsed(false); };
  const openQueue = () => { setView("queue"); setRailCollapsed(false); };
  const openPost = (id) => { setEditingId(id); setView("editor"); setRailCollapsed(true); };

  const newPost = (type) => {
    const id = "p" + Date.now();
    const base = { id, type, updated: "09-12 " + nowTime().slice(0, 5), title: "", body: "", bodyHtml: "" };
    if (type === "image") base.images = [asset("#D52088"), asset("#FD8D11"), asset("#2C6FF0")];
    /* 视频 / 音频建稿时没有文件：素材区从「上传」开始，删掉后也回到这一态 */
    if (type === "video") { base.media = false; base.duration = "00:00"; }
    if (type === "audio") { base.media = false; base.duration = "00:00"; base.durationSec = 0; }
    setPosts((ps) => [base, ...ps]);
    setEditingId(id);
    setView("editor");
    setRailCollapsed(true); /* 新建即进入专注编辑 */
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
  /* 获取失败 → 补一枚模拟账号：导入登录态后所有平台一起变可用。
     失败平台在种子数据里没有账号对象，凭据卡要渲染账号名/有效期，
     导入时必须补一枚模拟账号，否则卡一开就崩 */
  const grantAccount = (p) => p.account ? p : {
    ...p,
    account: {
      name: "九漾 Onda", uid: p.name + " ID onda-" + p.id,
      until: "2027-09-30", checked: "刚刚",
      lands: p.lands || "直接发布",
    },
  };
  /* 导入登录态：四段式 —— 锁检测 → 确认 → 覆盖（关一次工作台浏览器 + 整目录拷贝）→ 全部平台自动重校验。
     这是登录态失效的唯一解法，入口全局唯一（设置里的导入按钮 / 任何失效平台的点击都会走到这）。
     锁检测：日常浏览器（Chrome/Edge）运行中时它的 profile 被 leveldb/SQLite 锁着，
     运行中导入会拿到不完整的登录态（即刻的 localStorage token 就是这么丢的）——
     所以这里不回退、不静默，直接阻断让用户退出浏览器后「重新检测」，导入结果才确定。 */
  const [impStage, setImpStage] = React.useState(null); // null | locked | confirm | copying | verifying
  const askImport = () => setImpStage("locked"); // 原型固定演示「检测到浏览器在跑」这一屏；真机由服务端 pgrep 判定
  const recheckImport = () => setImpStage("confirm"); // 模拟用户已退出浏览器、重新检测通过
  /* 退出浏览器的操作提示按操作系统区分：macOS ⌘Q；Windows 无全局退出快捷键，指菜单；Linux Ctrl+Q */
  const quitHint = () => {
    const ua = navigator.userAgent || "";
    if (/Mac/i.test(ua)) return "⌘Q";
    if (/Win/i.test(ua)) return "右上角菜单 → 退出";
    return "Ctrl+Q";
  };
  const runImport = () => {
    setImpStage("copying");
    setTimeout(() => {
      setImpStage("verifying");
      setTimeout(() => {
        setPlatforms((ps) => ps.map((p) => ({ ...grantAccount(p), state: "ok" })));
        setImpStage(null);
      }, 1600);
    }, 1400);
  };
  /* 单平台「重新校验」：只查这个平台，不复制文件、不动别的平台 */
  const verifyAccount = (id) => {
    setPlatforms((ps) => ps.map((p) => (p.id === id && p.account ? { ...p, account: { ...p.account, checked: "刚刚" } } : p)));
  };
  const toggleDefault = (type, id) => {
    setDefaults((d) => {
      const cur = d[type] || [];
      return { ...d, [type]: cur.indexOf(id) >= 0 ? cur.filter((x) => x !== id) : cur.concat([id]) };
    });
  };

  const confirmPublish = (chanSel) => {
    const post = posts.find((p) => p.id === editingId);
    const selected = platforms.filter((p) => p.selected);
    /* 多频道平台的落点：chanSel 里存了用户挑的 channelId，没挑就落第一个 */
    const channelOf = (p) => {
      const list = channelsOf(p);
      if (!list || list.length < 2) return null;
      const c = list.find((x) => x.id === (chanSel && chanSel[p.id])) || list[0];
      return c.name;
    };
    const newTasks = selected.map((p, i) => ({
      id: "t" + Date.now() + "-" + i,
      postId: post.id, postTitle: post.title || "未命名", platformId: p.id,
      channelName: channelOf(p),
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
  /* 移除失败记录：不可重试的失败（稿子已删等）不该一直挂在队列里 */
  const dismissTask = (id) => setTasks((ts) => ts.filter((t) => t.id !== id));
  /* 删除整条队列记录（一篇稿子的发布记录组）：只删记录，不动稿子与平台账号；进行中不可删 */
  const dismissGroup = (postId) => setTasks((ts) => ts.filter((t) => t.postId !== postId));

  const counts = React.useMemo(() => {
    const c = { article: 0, image: 0, video: 0, audio: 0 };
    posts.forEach((p) => { c[p.type] = (c[p.type] || 0) + 1; });
    return c;
  }, [posts]);
  const runningIds = React.useMemo(
    () => Array.from(new Set(tasks.filter((t) => t.status === "running").map((t) => t.postId))),
    [tasks]
  );
  /* 发出去过的稿子：标题行挂一枚「已发布」贴纸，防止重复发布 */
  const publishedIds = React.useMemo(
    () => Array.from(new Set(tasks.filter((t) => t.status === "success").map((t) => t.postId))),
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
          runningCount={runningCount}
          queueCount={tasks.length}
          platforms={platforms}
          collapsed={railCollapsed}
          onToggleRail={toggleRail}
          onScope={(k) => leaveGuard(() => openScope(k))}
          onQueue={() => leaveGuard(openQueue)}
          onNew={(type) => leaveGuard(() => newPost(type))}
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
              publishedIds={publishedIds}
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
                  </div>
                </header>
                <div className="w-scroll">
                  <TasksView tasks={tasks} posts={posts} onRetry={retryTask} onOpen={openPost} onDismiss={dismissTask} onDismissGroup={dismissGroup} />
                </div>
              </div>
            </div>
          )}

          {view === "editor" && editing && (
            <EditorView
              post={editing}
              onChange={changePost}
              onDirty={setEditorDirty}
              onBack={() => leaveGuard(() => { setView("library"); setRailCollapsed(false); })}
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
          onImport={askImport}
          onClose={() => setSheetOpen(false)}
          onConfirm={confirmPublish}
        />
      )}

      {settingsOpen && (
        <SettingsSheet
          platforms={platforms}
          defaults={defaults}
          onToggle={toggleDefault}
          onImport={askImport}
          onVerify={verifyAccount}
          importing={impStage === "copying" || impStage === "verifying" ? impStage : null}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* 锁检测阻断：日常浏览器在运行 → 直接拦下导入，不给「带锁拷贝」的回退路径。
          用户完全退出浏览器后点「重新检测」，检测通过才进确认层 —— 执行路径确定，不产生半成品导入 */}
      {impStage === "locked" && (
        <div className="m-overlay" onClick={() => setImpStage(null)}>
          <div className="m-mini" role="alertdialog" aria-label="浏览器运行中" data-screen-label="导入阻断" onClick={(e) => e.stopPropagation()}>
            <h3>{(BROWSERS.find((x) => x.id === getBrowserPref()) || BROWSERS[0]).name}正在运行</h3>
            <p>浏览器开着时无法完整读取登录状态。请先完全退出它（{quitHint()}），再点下方按钮继续。</p>
            <div className="m-mini-foot">
              <button className="m-btn-plain" onClick={() => setImpStage(null)}>取消</button>
              <button className="m-btn-acc" onClick={recheckImport}>已退出，重新检测</button>
            </div>
          </div>
        </div>
      )}

      {/* 导入确认：覆盖登录态会先关掉工作台浏览器（Cookie 被文件锁着，进程必须先停），
          这一步必须让用户知情；确认后自动覆盖 + 全部平台重校验，无需逐个平台手动操作 */}
      {impStage === "confirm" && (
        <div className="m-overlay" onClick={() => setImpStage(null)}>
          <div className="m-mini" role="alertdialog" aria-label="导入登录态确认" data-screen-label="导入确认" onClick={(e) => e.stopPropagation()}>
            <h3>从 {(BROWSERS.find((x) => x.id === getBrowserPref()) || BROWSERS[0]).name} 同步账号？</h3>
            <p>将用所选浏览器里已登录的账号覆盖工作台，并自动重新校验全部平台。</p>
            <div className="m-mini-foot">
              <button className="m-btn-plain" onClick={() => setImpStage(null)}>取消</button>
              <button className="m-btn-acc" onClick={runImport}>导入并校验全部</button>
            </div>
          </div>
        </div>
      )}

      {/* 未保存离开确认：内容都还在内存里，但交互按真实产品的三选一来演示 */}
      {pendingLeave && (
        <div className="m-overlay" onClick={() => setPendingLeave(null)}>
          <div className="m-mini" role="alertdialog" aria-label="未保存提示" data-screen-label="未保存确认" onClick={(e) => e.stopPropagation()}>
            <h3>有未保存的改动</h3>
            <p>「{editing ? (editing.title || "未命名稿子") : ""}」的改动还没有保存，离开后会丢失。要怎么处理？</p>
            <div className="m-mini-foot">
              <button className="m-btn-plain" onClick={() => setPendingLeave(null)}>取消</button>
              <button
                className="m-btn-danger"
                onClick={() => { const a = pendingLeave; setPendingLeave(null); setEditorDirty(false); a(); }}
              >
                不保存并离开
              </button>
              <button
                className="m-btn-primary"
                onClick={() => { const a = pendingLeave; setPendingLeave(null); setEditorDirty(false); a(); }}
              >
                保存并离开
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 专注模式：左栏收起后，左上角悬浮展开按钮 + 右下角轻提示 */}
      {railCollapsed && (
        <button className="fr-float" onClick={toggleRail} aria-label="展开侧栏" title="展开侧栏 (⌘\)">
          <IcPanel size={15} />
        </button>
      )}
      <div className={"fr-hint" + (railCollapsed ? " on" : "")}>专注模式 · ⌘\ 展开侧栏</div>

      <FloatingPill tasks={tasks} onClick={() => leaveGuard(openQueue)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
