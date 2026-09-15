/* tasks.jsx — 任务页：以稿子为行，平台是这篇稿子里的发布动作。
   进行中 / 已完成 / 失败 共用同一条平台行的骨架，只有状态位不同。 */
function TasksView({ tasks, posts, onRetry }) {
  const running = tasks.filter((t) => t.status === "running");
  const done = tasks.filter((t) => t.status !== "running");
  const failed = done.filter((t) => t.status === "failed").length;

  /* 按稿子归拢（O(n)）：一篇文章一行，平台挂在它下面。
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
    g.ok = g.tasks.filter((t) => t.status === "success").length;
    g.bad = g.tasks.filter((t) => t.status === "failed").length;
  });
  /* 还有在跑的稿子排前面，其余保持最近活动在前（sort 稳定） */
  order.sort((a, b) => (b.running > 0 ? 1 : 0) - (a.running > 0 ? 1 : 0));

  return (
    <div className="m-tasks">
      <div className="m-tsummary">
        <span><span className="m-dot" style={{ background: "#2C6FF0", marginRight: 6 }}></span>进行中<b>{running.length}</b></span>
        <span><span className="m-dot" style={{ background: "#07B56F", marginRight: 6 }}></span>成功<b>{done.length - failed}</b></span>
        <span><span className="m-dot" style={{ background: "#D52088", marginRight: 6 }}></span>失败<b>{failed}</b></span>
        <span className="m-thint">发布在后台跑，不阻塞界面</span>
      </div>
      <div className="m-tlist">
        {tasks.length === 0 && <div className="m-emptybox">队列空闲 — 去编辑器点「发布」试试</div>}
        {order.map((g) => (<PostGroup key={g.postId} group={g} onRetry={onRetry} />))}
      </div>
    </div>
  );
}

/* 一篇稿子 = 一张卡：卡头是稿子，卡内的每一行是一个平台的发布动作 */
function PostGroup({ group, onRetry }) {
  const t = group.post ? TYPES[group.post.type] : null;
  return (
    <div className="m-pgroup">
      <div className="m-pghead">
        <span className="sq" style={{ background: t ? t.color : "#16130E" }}></span>
        <span className="m-pgtitle">{group.tasks[0].postTitle || "未命名"}</span>
        <span className="m-pgmeta">
          {group.running > 0 && <span className="run">进行中 {group.running}</span>}
          {group.ok > 0 && <span className="ok">已发布 {group.ok}</span>}
          {group.bad > 0 && <span className="bad">失败 {group.bad}</span>}
          <span>{group.tasks.length} 个平台</span>
        </span>
      </div>
      {group.tasks.map((task) => (<PlatformRow key={task.id} task={task} onRetry={onRetry} />))}
    </div>
  );
}

/* 单一骨架：平台 icon · 中段状态 · 右侧栏（时间 · 动作 · 状态 icon）。
   平台名不再重复，色块本身即标识，名称放在 title 里。 */
function PlatformRow({ task, onRetry }) {
  const p = PLATFORMS.find((x) => x.id === task.platformId) || { name: task.platformId, char: "?", color: "#2C6FF0" };
  const running = task.status === "running";
  const ok = task.status === "success";
  return (
    <div className={"m-prow" + (running ? " running" : ok ? " ok" : " bad")}>
      <span className="m-psq" style={{ background: p.color }} title={p.name} aria-label={p.name}>{p.char}</span>
      <div className="m-pmain">
        {running && (
          <div className="m-prun">
            <span className="m-pbar"><i style={{ width: task.progress + "%", background: p.color }}></i></span>
            <span className="m-ppct" style={{ color: p.color }}>{Math.floor(task.progress)}%</span>
            <span className="m-pstage">{STAGES[task.stage]}</span>
          </div>
        )}
        {task.status === "failed" && <span className="m-pwhy">{task.failReason}</span>}
      </div>
      <div className="m-pmeta">
        <span className="m-ptime">{running ? task.createdAt : (task.finishedAt || task.createdAt)}</span>
        {ok && (
          <a className="m-plink" href={"https://" + task.url} target="_blank" rel="noopener noreferrer">
            访问 <IcLinkOut size={11} />
          </a>
        )}
        {task.status === "failed" && (
          <button className="m-retrybtn" onClick={() => onRetry(task.id)}>
            <IcRetry size={12} /> 重试
          </button>
        )}
        <span className={"m-pico " + (running ? "run" : ok ? "ok" : "bad")} style={running ? { color: p.color } : null}>
          {running ? <i></i> : ok ? <IcCheck size={13} /> : <IcX size={11} />}
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { TasksView });
