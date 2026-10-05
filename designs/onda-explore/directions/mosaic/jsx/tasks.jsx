/* tasks.jsx — 发布队列：一篇稿子一行，平台是一枚枚可点的方块
   一个平台不再占一整行状态条 —— 状态长得像平台本身：
   · 进行中：水位从方块底部涨上来（涨到哪，字就被漂白到哪）
   · 已发布：方块右上角一枚勾，整块就是个链接，点进去就是平台上的成品
   · 出问题：方块统一换成错误色，原因另起一行（只有出错才多花这一行）
   这么排，一屏能扫完的稿子数比以前多三倍。 */
/* 失败分两类，动作跟着变：
   · 可重试（网络/超时等瞬时问题）→ 给「重试」
   · 不可重试（稿子被删、超字数上限、无权限）→ 重试没有意义，给「移除记录」，
     并提示真正该做的事（改稿 / 检查稿子）——重试按钮点一万次也不会成功 */
function failKind(t) {
  const r = t.failReason || "";
  if (/不存在|已删除/.test(r)) return "dead";
  if (/上限|权限|字/.test(r)) return "fix";
  return "retry";
}
const FAIL_TAG = { dead: "无法重试", fix: "需改稿" };

/* 等待人工确认是第四种事实：不是进行中，也不能直接等同成功。
   兼容两种建模：显式 awaiting_confirm；旧任务 running + stage3 + 100%。 */
function isAwaiting(t) {
  return t.status === "awaiting_confirm"
    || (t.status === "running" && t.stage === 3 && t.progress >= 100);
}

function TasksView({ tasks, posts, onRetry, onOpen, onDismiss, onDismissGroup, onConfirmTask }) {
  const running = tasks.filter((t) => t.status === "running" && !isAwaiting(t));
  const awaiting = tasks.filter(isAwaiting);
  const failed = tasks.filter((t) => t.status === "failed");
  const ok = tasks.filter((t) => t.status === "success");
  const [confirmTask, setConfirmTask] = React.useState(null);

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
    g.running = g.tasks.filter((t) => t.status === "running" && !isAwaiting(t)).length;
    g.awaiting = g.tasks.filter(isAwaiting).length;
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
        <span><span className="m-dot" style={{ background: "var(--accent)", marginRight: 6 }}></span>待确认<b>{awaiting.length}</b></span>
        <span><span className="m-dot" style={{ background: "var(--green)", marginRight: 6 }}></span>成功<b>{ok.length}</b></span>
        <span><span className="m-dot" style={{ background: "var(--error)", marginRight: 6 }}></span>失败<b>{failed.length}</b></span>
      </div>
      <div className="m-tlist">
        {tasks.length === 0 && <div className="m-emptybox">队列为空</div>}
        {order.map((g) => (<PostGroup key={g.postId} group={g} onRetry={onRetry} onOpen={onOpen} onDismiss={onDismiss} onDismissGroup={onDismissGroup} onAskConfirm={setConfirmTask} />))}
      </div>

      {confirmTask && (
        <ConfirmPublishDialog
          task={confirmTask}
          onClose={() => setConfirmTask(null)}
          onConfirm={(taskId, url) => {
            onConfirmTask(taskId, url);
            setConfirmTask(null);
          }}
        />
      )}
    </div>
  );
}

/* 一篇稿子 = 一行。左边是稿子，右边是它这一轮发布到的平台方块 */
function PostGroup({ group, onRetry, onOpen, onDismiss, onDismissGroup, onAskConfirm }) {
  const t = group.post ? TYPES[group.post.type] : TYPES.article;
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
          {group.tasks.map((task) => (<PlatformTile key={task.id} task={task} onRetry={onRetry} onDismiss={onDismiss} onAskConfirm={onAskConfirm} />))}
        </div>
        <div className="q-meta">
          <span>{group.latest}</span>
          {/* 删除这条队列记录（该稿子的全部发布记录）：只删记录，不动稿子与平台；进行中不可删 */}
          <button
            className="q-del"
            onClick={() => onDismissGroup(group.postId)}
            disabled={group.running > 0}
            aria-label="删除这条队列记录"
            title={group.running > 0 ? "发布进行中，结束后才能删除" : "删除这条队列记录"}
          >
            <IcX size={11} />
          </button>
        </div>
      </div>
    </article>
  );
}

/* 平台方块：一枚方块承担原来一整行的信息量。
   水位用两层同色椭圆做出水面，字随水位漂白（白色那层被裁在 fill 里）。 */
function PlatformTile({ task, onRetry, onDismiss, onAskConfirm }) {
  const p = PLATFORMS.find((x) => x.id === task.platformId) || { name: task.platformId, char: "?", color: "#2C6FF0" };
  const running = task.status === "running" && !isAwaiting(task);
  const awaiting = isAwaiting(task);
  const ok = task.status === "success";
  const pct = Math.max(0, Math.min(100, Math.floor(task.progress)));
  const fg = p.fg || "#fff";
  const style = { "--pc": p.color, "--fg": fg };

  const label = p.name + (task.channelName ? " · " + task.channelName : "");
  const body = (
    <span className="q-body" aria-hidden="true">
      <span className="ch">{p.char}</span>
      {running && (
        <span className="fill" style={{ height: pct + "%" }}>
          {/* 白字只露出水线以下的部分：clip-path 随水位裁剪，波浪（fill 的伪元素）不受影响 */}
          <span className="ch chfill" style={{ clipPath: `inset(${100 - pct}% 0 0 0)` }}>{p.char}</span>
        </span>
      )}
    </span>
  );

  if (awaiting) {
    return (
      <button
        type="button"
        className="q-tile waiting"
        style={style}
        onClick={() => onAskConfirm(task)}
        title={label + " · 已到人工确认，点击回填结果"}
        aria-label={label + " 已到人工确认，点击回填结果"}
      >
        {body}
        <span className="badge wait">等</span>
      </button>
    );
  }
  if (ok) {
    return (
      <a
        className="q-tile ok"
        style={style}
        href={"https://" + task.url}
        target="_blank"
        rel="noopener noreferrer"
        title={label + " · 已发布，点开去平台看"}
        aria-label={label + " 已发布，点击访问"}
      >
        {body}
        <span className="badge ok"><IcCheck size={10} /></span>
      </a>
    );
  }
  if (running) {
    return (
      <span className="q-tile running" style={style} title={label + " · " + STAGES[task.stage] + " " + pct + "%"}>
        {body}
        <span className="badge pct">{pct}</span>
      </span>
    );
  }
  /* 出问题：整块换成错误色；原因和时间收进悬浮 tooltip（portal 到 body，永不裁切） */
  if (task.status === "failed") {
    return <FailedTile task={task} onRetry={onRetry} onDismiss={onDismiss} />;
  }
  return null;
}

/* 失败方块：tooltip 渲染到 body（position:fixed），按方块位置摆放并夹在视口内，
   彻底摆脱滚动容器/卡片的裁剪；悬停方块本身永不被盖住 */
function FailedTile({ task, onRetry, onDismiss }) {
  const kind = failKind(task);
  const when = ((task.finishedAt || "").split(" ")[1] || task.finishedAt || "").slice(0, 5);
  const label = (PLATFORMS.find((x) => x.id === task.platformId) || { name: task.platformId }).name
    + (task.channelName ? " · " + task.channelName : "");
  const p = PLATFORMS.find((x) => x.id === task.platformId) || { char: "?", color: "#2C6FF0", fg: "#fff" };
  const wrapRef = React.useRef(null);
  const tipRef = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  const [xy, setXY] = React.useState({ x: -9999, y: -9999 });
  React.useLayoutEffect(() => {
    if (!open) return;
    const el = wrapRef.current, tt = tipRef.current;
    if (!el || !tt) return;
    const r = el.getBoundingClientRect();
    const tw = tt.offsetWidth, th = tt.offsetHeight;
    /* 水平：右缘对齐方块、夹在视口内；垂直：优先上方，放不下落到下方 */
    const x = Math.min(Math.max(8, r.right - tw), window.innerWidth - tw - 8);
    let y = r.top - th - 8;
    if (y < 8) y = Math.min(r.bottom + 8, window.innerHeight - th - 8);
    setXY({ x, y });
  }, [open]);
  const pct = Math.max(0, Math.min(100, Math.floor(task.progress)));
  return (
    <span
      className="q-tilewrap"
      ref={wrapRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span className="q-tile bad" tabIndex={0}>
        <span className="q-body" aria-hidden="true"><span className="ch">{p.char}</span></span>
        <span className="badge bad"><IcAlert size={10} /></span>
        {kind === "retry" && (
          <button className="q-tile-retry" onClick={() => onRetry(task.id)} aria-label={"重试发布到 " + label} title="重试">
            <IcRetry size={13} />
          </button>
        )}
      </span>
      {open && ReactDOM.createPortal(
        <span className="q-tip" ref={tipRef} style={{ left: xy.x, top: xy.y }} role="tooltip">
          <span className="q-tiptxt">{task.failReason}</span>
          <span className="q-tipmeta">
            <span>{when}{kind !== "retry" ? " · " + FAIL_TAG[kind] : ""}</span>
            <button className="q-tipx" onClick={() => onDismiss(task.id)} aria-label="移除这条记录" title="移除记录">移除</button>
          </span>
        </span>,
        document.body
      )}
    </span>
  );
}

/* 人工确认必须经过显式弹层：这里不提供背景误点/回车直通的“默认成功”。
   有链接就必须是合法 URL；没有公开链接时，也要用户主动勾选免责项。 */
function ConfirmPublishDialog({ task, onClose, onConfirm }) {
  const p = PLATFORMS.find((x) => x.id === task.platformId)
    || { id: task.platformId, name: task.platformId, char: "?", color: "#2C6FF0", fg: "#fff" };
  const [url, setUrl] = React.useState(task.url || "");
  const [noPublicUrl, setNoPublicUrl] = React.useState(false);
  const normalizedUrl = url.trim();
  const urlInvalid = !!normalizedUrl && !/^https?:\/\/\S+$/i.test(normalizedUrl);
  const canConfirm = !urlInvalid && ( !!normalizedUrl || noPublicUrl);

  const submit = (e) => {
    e.preventDefault();
    if (!canConfirm) return;
    onConfirm(task.id, noPublicUrl ? null : normalizedUrl);
  };

  return (
    <div className="m-overlay" onClick={onClose}>
      <form
        className="m-mini q-confirm"
        role="dialog"
        aria-modal="true"
        aria-label={"确认" + p.name + "发布结果"}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h3>确认 {p.name} 发布结果</h3>

        <div className="q-confirm-meta">
          <span className="q-confirm-label">任务</span>
          <b>{task.postTitle || "未命名"}</b>
        </div>
        {task.channelName && (
          <div className="q-confirm-meta">
            <span className="q-confirm-label">目标</span>
            <b>{task.channelName}</b>
          </div>
        )}
        {task.manualHint && <p className="q-confirm-hint">{task.manualHint}</p>}

        {task.pageUrl && (
          <a className="q-confirm-open" href={task.pageUrl} target="_blank" rel="noreferrer">
            打开 {p.name} 页面检查
          </a>
        )}

        <label className="q-field">
          <span className="q-field-label">回填发布链接</span>
          <input
            className={"q-input" + (urlInvalid ? " bad" : "")}
            type="url"
            inputMode="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          {urlInvalid && <span className="q-field-error">请输入 http(s) 开头的完整链接。</span>}
        </label>

        <label className="q-check">
          <input
            type="checkbox"
            checked={noPublicUrl}
            onChange={(e) => setNoPublicUrl(e.target.checked)}
          />
          <span>该结果没有公开链接，我已在平台确认完成</span>
        </label>

        <div className="m-mini-foot">
          <button type="button" className="m-btn-plain" onClick={onClose}>取消</button>
          <button type="submit" className="m-btn-acc" disabled={!canConfirm}>确认发布完成</button>
        </div>
      </form>
    </div>
  );
}

Object.assign(window, { TasksView });
