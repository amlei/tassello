/* tasks.jsx — 发布队列：一篇稿子一行，平台是一枚枚可点的方块
   一个平台不再占一整行状态条 —— 状态长得像平台本身：
   · 进行中：水位从方块底部涨上来（涨到哪，字就被漂白到哪）
   · 已发布：方块右上角一枚勾，整块就是个链接，点进去就是平台上的成品
   · 出问题：方块统一换成错误色，原因另起一行（只有出错才多花这一行）
   这么排，一屏能扫完的稿子数比以前多三倍。 */
function TasksView({ tasks, posts, onRetry, onOpen }) {
  const running = tasks.filter((t) => t.status === "running");
  const failed = tasks.filter((t) => t.status === "failed");
  const ok = tasks.filter((t) => t.status === "success");

  /* 按稿子归拢（O(n)）：一篇稿子一行，平台挂在它下面。
     tasks 本身按新→旧排列，所以首次出现的顺序就是最近活动的顺序 */
  const order = [];
  const byPost = new Map();
  tasks.forEach((t) => {
    let g = byPost.get(t.postId);
    if (!g) { g = { postId: t.postId, tasks: [] }; byPost.set(t.postId, g); order.push(g); }
    g.tasks.push(t);
  });
  order.forEach((g) => {
    g.post = posts.find((p) => p.id === g.postId) || null;
    g.running = g.tasks.filter((t) => t.status === "running").length;
    g.bad = g.tasks.filter((t) => t.status === "failed").length;
    /* 最近一次活动：同一年的 "MM-DD HH:MM(:SS)" 直接按字符串比就够 */
    g.latest = g.tasks.reduce((acc, t) => {
      const s = t.finishedAt || t.createdAt || "";
      return s > acc ? s : acc;
    }, "");
  });
  /* 还在跑的排前面，其余保持最近活动在前（sort 稳定） */
  order.sort((a, b) => (b.running > 0 ? 1 : 0) - (a.running > 0 ? 1 : 0));

  return (
    <div className="m-tasks">
      <div className="m-tsummary">
        <span><span className="m-dot" style={{ background: "var(--blue)", marginRight: 6 }}></span>进行中<b>{running.length}</b></span>
        <span><span className="m-dot" style={{ background: "var(--green)", marginRight: 6 }}></span>成功<b>{ok.length}</b></span>
        <span><span className="m-dot" style={{ background: "var(--error)", marginRight: 6 }}></span>失败<b>{failed.length}</b></span>
      </div>
      <div className="m-tlist">
        {tasks.length === 0 && <div className="m-emptybox">队列为空</div>}
        {order.map((g) => (<PostGroup key={g.postId} group={g} onRetry={onRetry} onOpen={onOpen} />))}
      </div>
    </div>
  );
}

/* 一篇稿子 = 一行。左边是稿子，右边是它这一轮发布到的平台方块 */
function PostGroup({ group, onRetry, onOpen }) {
  const t = group.post ? TYPES[group.post.type] : TYPES.article;
  const problems = group.tasks.filter((x) => x.status === "failed");
  return (
    <article className="q-item">
      <div className="q-head">
        <span className="q-sq" style={{ background: t.color }}></span>
        <button
          className="q-title"
          onClick={() => group.post && onOpen(group.post.id)}
          disabled={!group.post}
          title={group.post ? "打开这篇稿子" : "稿子已被删除"}
        >
          {group.tasks[0].postTitle || "未命名"}
        </button>
        <div className="q-icons">
          {group.tasks.map((task) => (<PlatformTile key={task.id} task={task} onRetry={onRetry} />))}
        </div>
        <div className="q-meta">
          <span>{group.latest}</span>
        </div>
      </div>
      {/* 只有出错才多占一行：原因和重试放在一起，用同一种错误色 */}
      {problems.map((p) => {
        const pf = PLATFORMS.find((x) => x.id === p.platformId);
        return (
          <div className="q-err" key={p.id}>
            <IcAlert size={13} />
            <span className="q-errtxt"><b>{pf ? pf.name : p.platformId}</b> · {p.failReason}</span>
            <button className="q-retry" onClick={() => onRetry(p.id)}><IcRetry size={11} /> 重试</button>
          </div>
        );
      })}
    </article>
  );
}

/* 平台方块：一枚方块承担原来一整行的信息量。
   水位用两层同色椭圆做出水面，字随水位漂白（白色那层被裁在 fill 里）。 */
function PlatformTile({ task, onRetry }) {
  const p = PLATFORMS.find((x) => x.id === task.platformId) || { name: task.platformId, char: "?", color: "#2C6FF0" };
  const running = task.status === "running";
  const ok = task.status === "success";
  const pct = Math.max(0, Math.min(100, Math.floor(task.progress)));
  const fg = p.fg || "#fff";
  const style = { "--pc": p.color, "--fg": fg };

  const body = (
    <span className="q-body" aria-hidden="true">
      <span className="ch">{p.char}</span>
      {running && (
        <span className="fill" style={{ height: pct + "%" }}>
          <span className="ch chfill">{p.char}</span>
        </span>
      )}
    </span>
  );

  if (ok) {
    return (
      <a
        className="q-tile ok"
        style={style}
        href={"https://" + task.url}
        target="_blank"
        rel="noopener noreferrer"
        title={p.name + " · 已发布，点开去平台看"}
        aria-label={p.name + " 已发布，点击访问"}
      >
        {body}
        <span className="badge ok"><IcCheck size={10} /></span>
      </a>
    );
  }
  if (running) {
    return (
      <span className="q-tile running" style={style} title={p.name + " · " + STAGES[task.stage] + " " + pct + "%"}>
        {body}
        <span className="badge pct">{pct}</span>
      </span>
    );
  }
  /* 出问题：整块换成错误色，点一下重试 */
  return (
    <button
      className="q-tile bad"
      onClick={() => onRetry(task.id)}
      title={p.name + " · 发布失败，点一下重试"}
      aria-label={p.name + " 发布失败，点击重试"}
    >
      {body}
      <span className="badge bad"><IcAlert size={10} /></span>
    </button>
  );
}

Object.assign(window, { TasksView });
