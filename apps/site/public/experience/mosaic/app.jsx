/* app.jsx — 原型根组件：跨页面状态与发布任务引擎。
   视图只有三个：内容库（左栏 + 列表）、发布队列、编辑器。
   发布事实只存一处 —— tasks；稿子上不再挂状态字段。 */
/* 全局搜索弹窗：只承担“找稿子并打开”；不塞 Agent/命令面板这类无关快捷操作 */
function SearchModal({ posts, onClose, onOpen }) {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  React.useEffect(() => {
    setActive(0);
  }, [query]);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? posts.filter((p) => (p.title + " " + p.body + " " + TYPES[p.type].zh).toLowerCase().includes(q))
      : [...posts];
    if (!q) matched.sort((a, b) => stamp(b.updated) - stamp(a.updated));
    return matched.slice(0, 8);
  }, [posts, query]);

  const select = (post) => onOpen(post);

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((n) => (results.length ? (n + 1) % results.length : 0));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((n) => (results.length ? (n + results.length - 1) % results.length : 0));
    }
    if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      select(results[active]);
    }
  };

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-modal" role="dialog" aria-modal="true" aria-label="搜索稿子" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input">
          <IcSearch size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索标题、正文或类型"
            aria-label="搜索标题、正文或类型"
          />
        </div>
        <div className="cmd-list">
          <div className="cmd-label">{query.trim() ? "搜索结果" : "最近稿子"}</div>
          {results.length === 0 && <div className="cmd-empty">没有匹配的稿子</div>}
          {results.map((post, i) => (
            <button
              key={post.id}
              className={"cmd-item" + (i === active ? " on" : "")}
              onClick={() => select(post)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="type-chip" style={{ background: TYPES[post.type].color }}>{TYPES[post.type].zh}</span>
              <span className="cmd-main">
                <span className="cmd-title">{post.title || "未命名稿子"}</span>
                <span className="cmd-desc">{(post.body || "").replace(/\s+/g, " ").trim() || "暂无正文"}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function nowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0");
}

function nowStamp() {
  const d = new Date();
  return String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")
    + " " + nowTime();
}

function App() {
  const initialQuery = new URLSearchParams(window.location.search);
  const demoPlatformId = initialQuery.get("platform");
  const demoPlatformState = initialQuery.get("state");
  const [view, setView] = React.useState(initialQuery.get("view") === "queue" ? "queue" : "library"); // library | queue | editor
  const [scope, setScope] = React.useState("article"); // article | image | video | audio
  const [sort, setSort] = React.useState("recent");
  /* 纯文本正文（body）装载时补齐富文本形态（bodyHtml）：编辑与预览都用同一份 */
  const [posts, setPosts] = React.useState(() => POSTS.map((p) => ({
    ...p,
    bodyHtml: p.bodyHtml || mdToHtml(p.body || "", TYPES[p.type].color, p.images || []),
  })));
  const [editingId, setEditingId] = React.useState(null);
  const [platforms, setPlatforms] = React.useState(() => PLATFORMS.map((p) => {
    if (p.id !== demoPlatformId) return { ...p, selected: false };
    if (demoPlatformState === "checking") {
      return { ...p, selected: false, state: "ok", syncPhase: "checking" };
    }
    if (demoPlatformState === "needs_login") {
      return {
        ...p,
        selected: false,
        state: "fail",
        syncPhase: "needs_login",
        account: null,
        accountError: "浏览器中未检测到登录态",
      };
    }
    if (demoPlatformState === "failed") {
      return {
        ...p,
        selected: false,
        state: "fail",
        syncPhase: "failed",
        account: null,
        accountError: "平台页面结构检查失败，请稍后重试",
      };
    }
    return { ...p, selected: false, state: "ok", syncPhase: "connected" };
  }));
  const [extension, setExtension] = React.useState(() => (
    initialQuery.get("extension") === "error"
      ? { ...EXTENSION, status: "disconnected", browser: null, clientId: null, lastSeen: "—" }
      : EXTENSION
  ));
  const [extensionInstall, setExtensionInstall] = React.useState(() => (
    initialQuery.get("extension") === "error" ? { browser: "chrome", phase: "error" } : null
  ));
  const extensionTimers = React.useRef([]);
  const [vault, setVault] = React.useState(VAULT);
  const [extensionOpen, setExtensionOpen] = React.useState(false);
  const [defaults, setDefaults] = React.useState(DEFAULT_TARGETS);
  const [podcastRss, setPodcastRss] = React.useState(PODCAST_RSS);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(initialQuery.get("settings") === "1");
  const [searchOpen, setSearchOpen] = React.useState(false);
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
  React.useEffect(() => () => {
    extensionTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
      url: platformLink("xhs", "K7F2Q9Z1"), urlSource: "auto", createdAt: "09-11 21:12", finishedAt: "09-11 21:14:31",
    },
    {
      id: "seed-2", postId: "a1", postTitle: "为什么我们团队在周五下午不发版", platformId: "wechat",
      progress: 100, stage: 3, status: "success", willFail: false, failReason: null,
      url: platformLink("wechat", "M3P8T2WD"), urlSource: "manual", createdAt: "09-12 14:20", finishedAt: "09-12 14:21:08",
    },
    {
      /* 多频道平台：任务上记着落进了哪个频道（小宇宙的「九漾电台」节目） */
      id: "seed-2b", postId: "p1", postTitle: "EP.12 和夜班出租车司机聊一座城市的背面", platformId: "xiaoyuzhou",
      channelName: "九漾电台",
      progress: 100, stage: 3, status: "success", willFail: false, failReason: null,
      url: platformLink("xiaoyuzhou", "R2K7M4XQ"), urlSource: "auto", createdAt: "09-12 10:02", finishedAt: "09-12 10:03:44",
    },
    {
      id: "seed-3", postId: "a1", postTitle: "为什么我们团队在周五下午不发版", platformId: "xhs",
      progress: 100, stage: 3, status: "success", willFail: false, failReason: null,
      url: platformLink("xhs", "Q9L4V7GB"), urlSource: "auto", createdAt: "09-12 14:20", finishedAt: "09-12 14:20:52",
    },
    {
      /* 人工确认是独立事实：系统停在平台页后，必须由用户检查并回填结果。 */
      id: "seed-w", postId: "v1", postTitle: "三分钟讲清「公摊面积」", platformId: "wechat",
      progress: 100, stage: 3, status: "awaiting_confirm", willFail: false, failReason: null,
      pageUrl: "https://mp.weixin.qq.com/",
      manualHint: "公众号需要人工选择视频文件。扩展会继续监听草稿与发布结果；未收到回执时再手动填写链接。",
      tabId: 1842, url: null, urlSource: null, token: newToken(), createdAt: "09-12 14:31", finishedAt: null,
    },
    {
      id: "seed-wait", postId: "i2", postTitle: "白露之后的云", platformId: "weibo",
      progress: 100, stage: 3, status: "waiting_extension", willFail: false, failReason: null,
      pageUrl: "https://weibo.com/", tabId: null, url: null, urlSource: null,
      token: newToken(), createdAt: "09-12 14:33", finishedAt: null,
    },
    {
      id: "seed-unknown", postId: "a2", postTitle: "从0到1做内部工具的五个坑", platformId: "jike",
      progress: 100, stage: 3, status: "unknown", willFail: false, failReason: null,
      pageUrl: "https://web.okjike.com/", tabId: 1881, url: null, urlSource: null,
      manualHint: "扩展看到了提交动作，但没有拿到稳定回执。请先在平台核对，再补链接或确认无公开链接。",
      token: newToken(), createdAt: "09-12 14:35", finishedAt: null,
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
              finishedAt: nowStamp() };
          }
          if (progress >= 100) {
            if (t.platformId === "wechat" || t.platformId === "xhs") {
              return { ...t, progress: 100, stage: 3, status: "awaiting_confirm",
                pageUrl: "https://" + t.platformId + ".com",
                tabId: 1900 + Number(t.id.slice(-1) || 1),
                manualHint: "扩展已把页面留在你的浏览器里。完成平台侧动作后，自动回执会把任务收口；未收到时可手动填写链接。",
                finishedAt: null };
            }
            return { ...t, progress: 100, stage: 3, status: "success",
              url: platformLink(t.platformId, t.token), urlSource: "auto", finishedAt: nowStamp() };
          }
          return { ...t, progress, stage };
        });
      });
    }, 800);
    return () => clearInterval(timer);
  }, []);

  const openScope = (k) => { setScope(k); setView("library"); setRailCollapsed(false); };
  const openQueue = () => { setView("queue"); setRailCollapsed(false); };
  const openPost = (id) => { setEditingId(id); setView("editor"); setRailCollapsed(true); };

  const newPost = (type) => {
    const id = "p" + Date.now();
    const base = { id, type, updated: nowStamp().slice(0, 5), title: "", body: "", bodyHtml: "" };
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
  /* 账号失效时由扩展打开登录页；登录后只重验当前平台。 */
  const verifyAccount = (id) => {
    setPlatforms((ps) => ps.map((p) => (p.id === id && p.account ? { ...p, account: { ...p.account, checked: "刚刚" } } : p)));
  };
  const installExtension = (browserId) => {
    extensionTimers.current.forEach((timer) => window.clearTimeout(timer));
    setExtensionInstall({ browser: browserId, phase: "opening" });
    const store = browserId === "edge"
      ? "https://microsoftedge.microsoft.com/addons/Microsoft-Edge-Extensions-Home"
      : "https://chromewebstore.google.com/";
    window.open(store, "_blank", "noopener,noreferrer");
    extensionTimers.current = [
      window.setTimeout(() => {
        setExtensionInstall({ browser: browserId, phase: "waiting" });
      }, 650),
      window.setTimeout(() => {
        setExtension({
          ...EXTENSION,
          status: "connected",
          browser: browserId === "edge" ? "Edge" : "Chrome",
          clientId: browserId + "-native",
          lastSeen: "刚刚",
        });
        setExtensionInstall({ browser: browserId, phase: "connected" });
      }, 2100),
      window.setTimeout(() => {
        setExtensionInstall(null);
      }, 3300),
    ];
  };
  const openPlatformLogin = (id) => {
    if (id === "extension") {
      setExtensionOpen(true);
      return;
    }
    const p = platforms.find((item) => item.id === id);
    const fallback = {
      weibo: "https://weibo.com/",
      wechat: "https://mp.weixin.qq.com/",
      xhs: "https://creator.xiaohongshu.com/",
      zhihu: "https://www.zhihu.com/",
      x: "https://x.com/",
      douban: "https://www.douban.com/",
      jike: "https://web.okjike.com/",
      toutiao: "https://mp.toutiao.com/",
      baijiahao: "https://baijiahao.baidu.com/",
      xiaoyuzhou: "https://www.xiaoyuzhoufm.com/",
      ximalaya: "https://www.ximalaya.com/",
      lizhi: "https://nj.lizhi.fm/",
    }[id];
    if (fallback) window.open(fallback, "_blank", "noopener,noreferrer");
  };
  const toggleDefault = (type, id) => {
    setDefaults((d) => {
      const cur = d[type] || [];
      return { ...d, [type]: cur.indexOf(id) >= 0 ? cur.filter((x) => x !== id) : cur.concat([id]) };
    });
  };

  const confirmPublish = (chanSel) => {
    const post = posts.find((p) => p.id === editingId);
    const rssClaimed = new Set(
      post && post.type === "audio" && podcastRss && podcastRss.feedUrl
        ? podcastRss.claims.filter((claim) => claim.state === "claimed" || claim.state === "indexed").map((claim) => claim.platformId)
        : []
    );
    const selected = platforms.filter((p) => p.selected && !p.rssOnly && !rssClaimed.has(p.id));
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
      failReason: null, url: null, urlSource: null, token: newToken(), tabId: null,
      createdAt: nowStamp(), finishedAt: null,
    }));
    setTasks((ts) => [...newTasks, ...ts]);
    setPlatforms((ps) => ps.map((p) => ({ ...p, selected: false })));
    setSheetOpen(false); /* 弹层立刻关闭，界面不阻塞 */
  };
  const retryTask = (id) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? {
      ...t, progress: 0, stage: 0, status: "running", willFail: false, failReason: null, url: null, urlSource: null, finishedAt: null,
    } : t)));
  };
  /* 移除失败记录：不可重试的失败（稿子已删等）不该一直挂在队列里 */
  /* 人工确认不能直接由 tile click 隐式触发；这里只接收弹层里的最终确认结果。 */
  const confirmTask = (id, url) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? {
      ...t,
      status: "success",
      progress: 100,
      stage: 3,
      url: url || null,
      urlSource: "manual",
      noPublicUrl: !url,
      finishedAt: nowStamp(),
    } : t)));
  };
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
  /* 侧栏计数以内容项为准：同一篇稿子发到 N 个平台仍算 1 项；平台状态在队列页里看 */
  const runningCount = new Set(
    tasks
      .filter((t) => t.status === "running" && !(t.stage === 3 && t.progress >= 100))
      .map((t) => t.postId)
  ).size;
  const queueCount = new Set(tasks.map((t) => t.postId)).size;
  const openSearchResult = (post) => {
    setSearchOpen(false);
    leaveGuard(() => {
      setScope(post.type);
      openPost(post.id);
    });
  };

  const editing = posts.find((p) => p.id === editingId);
  /* TitleBar 的上下文槽：只表达当前视图名；计数、类型和状态不重复展示。 */
  const screenContext = (() => {
    if (view === "library") return { title: TYPES[scope].zh };
    if (view === "queue") return { title: "发布队列" };
    if (editing) return { title: editing.title || "未命名稿子" };
    return null;
  })();

  return (
    <div className="m-app">
      {/* WorkspaceShell：全局 TitleBar 是唯一窗口控制 / 拖拽 / 侧栏开关的拥有者 */}
      <header className="w-titlebar" aria-label="窗口栏">
        {/* 原型占位：真实桌面里是 macOS 系统红绿灯；真实 Web 不渲染这段 */}
        <div className="tb-lights" aria-hidden="true"><i></i><i></i><i></i></div>
        <button
          className="tb-toggle"
          onClick={toggleRail}
          aria-expanded={!railCollapsed}
          aria-controls="workspace-rail"
          aria-label={railCollapsed ? "展开侧栏" : "收起侧栏"}
          title={railCollapsed ? "展开侧栏 (⌘\)" : "收起侧栏 (⌘\)"}
        >
          <IcPanel size={15} />
          <span className="fr-kbd">⌘\</span>
        </button>
        <button className="tb-search" onClick={() => setSearchOpen(true)} aria-label="搜索稿子" title="搜索稿子 (⌘K)">
          <IcSearch size={15} />
        </button>
        {/* 品牌属于侧栏；TitleBar 的上下文槽在展开/折叠时保持同一左缘 */}
        {screenContext && (
          <div className="tb-context">
            <h1 className="tb-title">{screenContext.title}</h1>
          </div>
        )}
        <div className="tb-drag" aria-hidden="true"></div>
        {view === "library" && (
          <button
            className="tb-new"
            style={{ background: TYPES[scope].color }}
            onClick={() => leaveGuard(() => newPost(scope))}
          >
            <IcPlus size={13} /> 新建{TYPES[scope].zh}
          </button>
        )}
      </header>

      <div className="w-shell">
        <Sidebar
          id="workspace-rail"
          view={view}
          scope={scope}
          counts={counts}
          runningCount={runningCount}
          queueCount={queueCount}
          platforms={platforms}
          collapsed={railCollapsed}
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
              sort={sort}
              runningIds={runningIds}
              publishedIds={publishedIds}
              onOpen={openPost}
              onDelete={deletePost}
              onNew={newPost}
              onSort={setSort}
              onReorder={reorderPosts}
            />
          )}

          {view === "queue" && (
            <div className="w-view" data-screen-label="发布队列">
              <div className="w-canvas">
                <div className="w-scroll w-queuescroll">
                  <TasksView tasks={tasks} posts={posts} onRetry={retryTask} onOpen={openPost} onDismiss={dismissTask} onDismissGroup={dismissGroup} onConfirmTask={confirmTask} />
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
          rss={podcastRss}
          extensionConnected={extension.status === "connected"}
          onToggle={togglePlatform}
          onImport={() => setSettingsOpen(true)}
          onClose={() => setSheetOpen(false)}
          onConfirm={confirmPublish}
        />
      )}

      {settingsOpen && (
        <SettingsSheet
          platforms={platforms}
          defaults={defaults}
          rss={podcastRss}
          onRssChange={setPodcastRss}
          onToggle={toggleDefault}
          extension={extension}
          extensionInstall={extensionInstall}
          vault={vault}
          onOpenLogin={openPlatformLogin}
          onVerify={verifyAccount}
          onInstallExtension={installExtension}
          onChooseVault={setVault}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {extensionOpen && (
        <div className="m-overlay" onClick={() => setExtensionOpen(false)}>
          <div className="m-mini w-extmodal" role="dialog" aria-modal="true" aria-label="手动安装浏览器扩展" onClick={(e) => e.stopPropagation()}>
            <h3>手动安装浏览器扩展</h3>
            <p>适用于无法访问扩展商店的情况。安装完成后会通过本机宿主自动连接，不需要地址或配对码。</p>
            <div className="w-extsteps">
              <div className="w-extstep"><b>01 下载</b>从 GitHub Releases 取得与当前版本匹配的扩展包。</div>
              <div className="w-extstep"><b>02 加载</b>在浏览器的扩展页开启开发者模式，加载已解压扩展。</div>
              <div className="w-extstep"><b>03 完成</b>回到设置页，连接状态会自动更新。</div>
            </div>
            <div className="m-mini-foot">
              <button className="m-btn-plain" onClick={() => setExtensionOpen(false)}>关闭</button>
              <a
                className="w-extdownload"
                href="https://github.com/amlei/tassello/releases"
                target="_blank"
                rel="noopener noreferrer"
              >
                打开下载页
                <IcLinkOut size={11} />
              </a>
            </div>
          </div>
        </div>
      )}

      {searchOpen && (
        <SearchModal
          posts={posts}
          onClose={() => setSearchOpen(false)}
          onOpen={openSearchResult}
        />
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

      {/* 专注提示仅保留快捷键提醒；展开入口永远在全局 TitleBar */}
      <div className={"fr-hint" + (railCollapsed ? " on" : "")}>专注模式 · ⌘\ 展开侧栏</div>

      <FloatingPill tasks={tasks} onClick={() => leaveGuard(openQueue)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
