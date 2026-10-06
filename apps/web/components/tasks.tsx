/* tasks —— 发布队列：一篇稿子一行，平台是一枚枚可点的方块（移植原型 tasks.jsx） */
"use client";

import React from "react";
import ReactDOM from "react-dom";
import { STAGE_LABELS, TYPE_META, type PlatformDTO, type TaskDTO } from "@tassello/shared";
import { Button, Checkbox, Input, Link as OndaLink, Modal } from "@heroui/react";
import { PlatformMark } from "@tassello/ui/platform-icons";
import { Alert, Check, Refresh, X } from "reicon-react";

/* 失败分类：动作跟着类型走
   · retry：网络/超时等瞬时问题 → 悬浮时给重试 icon
   · dead：稿子被删等 → 重试必然失败，只给说明
   · fix：超字数上限/无权限 → 先改稿，重试无效 */
function failKind(reason: string | null): "dead" | "fix" | "retry" {
  const r = reason || "";
  if (/不存在|已删除/.test(r)) return "dead";
  if (/上限|权限|字/.test(r)) return "fix";
  return "retry";
}
const FAIL_TAG: Record<"dead" | "fix", string> = { dead: "无法重试", fix: "需改稿" };

function isAwaiting(task: TaskDTO): boolean {
  return task.status === "running" && task.stage === 3 && task.progress >= 100;
}

/* 队列展示相对时间；悬停处保留绝对时间兜底 */
function relativeTaskTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return "刚刚";
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

function PlatformTile({
  task, platform, onRetry, onAskConfirm, onDelete,
}: {
  task: TaskDTO;
  platform?: PlatformDTO;
  onRetry: (id: string) => void;
  onAskConfirm: (task: TaskDTO) => void;
  onDelete: (id: string) => void;
}) {
  const p = platform ?? { id: task.platformId, name: task.platformId, char: "?", color: "#2C6FF0", fg: undefined };
  const running = task.status === "running";
  const ok = task.status === "success";
  const pct = Math.max(0, Math.min(100, Math.floor(task.progress)));
  const awaiting = isAwaiting(task);
  const activeRunning = task.status === "running" && !awaiting;
  /* 水位层只在真正推进时渲染：等待确认（100%+等）再画一层会和底下的平台 icon 叠成重影 */
  const filling = activeRunning;
  const fg = (p as { fg?: string }).fg || "#fff";
  const pc = (p as { color: string }).color;

  const TILE =
    "relative flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[14px] border border-transparent p-0 text-base font-black leading-none shadow-[0_1px_2px_rgba(15,15,15,0.06)] transition-transform data-[hovered=true]:-translate-y-[3px]";
  const body = (
    <span className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[12px]" aria-hidden="true">
      <span className="relative z-[2]"><PlatformMark id={p.id} char={(p as { char: string }).char} size={18} imgScale={1.4} /></span>
      {filling && (
        <span className="absolute inset-x-0 bottom-0 z-[1] transition-[height] duration-[550ms]" style={{ height: `${pct}%`, background: pc }}>
          {/* 两层同宽椭圆叠出水面：一层定形，一层缓慢平移做波纹 */}
          <i className="absolute left-[-60%] top-[-6px] block h-3 w-[220%] rounded-[50%] opacity-95" style={{ background: pc }} />
          <i className="absolute left-[-60%] top-[-3px] block h-3 w-[220%] rounded-[50%] opacity-55 animate-q-wave" style={{ background: pc }} />
          {/* 白色平台字只露出水线以下：clip-path 随水位裁剪，波浪不受影响 */}
          <span className="absolute inset-x-0 bottom-0 z-[1] flex h-[46px] items-center justify-center font-black" style={{ color: fg, clipPath: `inset(${100 - pct}% 0 0 0)` }}>
            <PlatformMark id={p.id} char={(p as { char: string }).char} size={18} imgScale={1.4} />
          </span>
        </span>
      )}
    </span>
  );

  if (ok) {
    const tile = (
      <span className={TILE + " cursor-pointer"} style={{ background: pc, color: fg }}>
        {body}
        <span className="absolute right-[-6px] top-[-6px] z-[3] flex h-[19px] w-[19px] items-center justify-center rounded-[7px] border-2 border-white text-white" style={{ background: "var(--color-green)" }}><Check size={10} strokeWidth={4} /></span>
      </span>
    );
    if (!task.url) {
      return <span title={`${p.name} · 已发布`}>{tile}</span>;
    }
    return (
      <span title={`${p.name}${task.channelName ? ` · ${task.channelName}` : ""} 已发布，点击访问`}>
      <OndaLink
        className={TILE}
        style={{ background: pc, color: fg }}
        href={task.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${p.name}${task.channelName ? ` · ${task.channelName}` : ""} 已发布，点击访问`}
      >
        {body}
        <span className="absolute right-[-6px] top-[-6px] z-[3] flex h-[19px] w-[19px] items-center justify-center rounded-[7px] border-2 border-white text-white" style={{ background: "var(--color-green)" }}><Check size={10} strokeWidth={4} /></span>
      </OndaLink>
      </span>
    );
  }
  if (awaiting) {
    // 人工确认：适配器已把内容填进浏览器，等用户点完发布回来标记
    return (
      <span
        title={`${p.name}${task.channelName ? ` · ${task.channelName}` : ""} · 已到「${STAGE_LABELS[3]}」，检查后回填结果`}
        onClick={() => onAskConfirm(task)}
      >
        <Button
          className={TILE + " cursor-default bg-hover"}
          style={{ color: pc }}
          onPress={() => onAskConfirm(task)}
        >
          {body}
          <span className="absolute bottom-[-7px] right-[-7px] z-[3] flex h-[17px] min-w-5 items-center justify-center rounded-md border-2 border-white bg-accent px-1 font-mono text-[9.5px] font-extrabold text-white">等</span>
        </Button>
      </span>
    );
  }
  if (running) {
    return (
      <span className={TILE + " cursor-default bg-hover hover:translate-y-0"} style={{ color: pc }} title={`${p.name}${task.channelName ? ` · ${task.channelName}` : ""} · ${STAGE_LABELS[task.stage]} ${pct}%`}>
        {body}
        <span className="absolute bottom-[-7px] right-[-7px] z-[3] flex h-[17px] min-w-5 items-center justify-center rounded-md border-2 border-white bg-accent px-1 font-mono text-[9.5px] font-extrabold text-white">{pct}</span>
      </span>
    );
  }
  /* 出问题：整块换错误色；原因/时间收进悬浮 tooltip（portal 到 body，永不裁切），
     可重试的失败悬浮时浮现重试 icon */
  return <FailedTile task={task} platform={platform} onRetry={onRetry} onDelete={onDelete} />;
}

/* 失败方块：tooltip 渲染到 body（position:fixed），按方块位置摆放并夹在视口内，
   彻底摆脱滚动容器/卡片的裁剪；悬停方块本身永不被盖住 */
function FailedTile({
  task, platform, onRetry, onDelete,
}: {
  task: TaskDTO;
  platform?: PlatformDTO;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const kind = failKind(task.failReason);
  const finishedAt = task.finishedAt || "";
  const when = relativeTaskTime(finishedAt);
  const p = platform ?? { id: task.platformId, name: task.platformId, char: "?", color: "#2C6FF0", fg: undefined };
  const label = p.name;
  const wrapRef = React.useRef<HTMLSpanElement | null>(null);
  const tipRef = React.useRef<HTMLSpanElement | null>(null);
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
  const TILE =
    "relative flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[14px] border border-transparent p-0 text-base font-black leading-none shadow-[0_1px_2px_rgba(15,15,15,0.06)]";
  return (
    <span
      className="q-tilewrap"
      ref={wrapRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span className={TILE + " cursor-default border-transparent text-white"} style={{ background: "var(--color-error)" }}>
        <span className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[12px]" aria-hidden="true">
          <span className="relative z-[2]"><PlatformMark id={p.id} char={(p as { char: string }).char} size={18} imgScale={1.4} /></span>
        </span>
        <span className="absolute right-[-6px] top-[-6px] z-[3] flex h-[19px] w-[19px] items-center justify-center rounded-[7px] border-2 border-white text-white" style={{ background: "var(--color-error)" }}><Alert size={10} strokeWidth={4} /></span>
        {kind === "retry" && (
          <Button
            variant="ghost"
            className="q-tile-retry rounded-[14px] p-0"
            onPress={() => onRetry(task.id)}
            aria-label={`重试发布到 ${label}`}
          >
            <Refresh size={13} strokeWidth={3.3} />
          </Button>
        )}
      </span>
      {open && ReactDOM.createPortal(
        <span className="q-tip" ref={tipRef} style={{ left: xy.x, top: xy.y }} role="tooltip">
          <span className="q-tiptxt">{task.failReason}</span>
          <span className="q-tipmeta">
            <span>{when}{kind !== "retry" ? " · " + FAIL_TAG[kind] : ""}</span>
            <Button
              variant="ghost"
              className="q-tipx rounded-none bg-transparent p-0"
              onPress={() => onDelete(task.id)}
              aria-label="移除这条记录"
            >
              移除
            </Button>
          </span>
        </span>,
        document.body
      )}
    </span>
  );
}

export function TasksView({
  tasks, posts, platforms, onRetry, onConfirmTask, onOpen, onDelete,
}: {
  tasks: TaskDTO[];
  posts: { id: string; type: string; title: string }[];
  platforms: PlatformDTO[];
  onRetry: (id: string) => void;
  onConfirmTask: (id: string, url: string | null) => void;
  onOpen: (id: string) => void;
  /** 删除队列记录：传该条记录组里的任务 id 列表（不动稿子与平台账号） */
  onDelete: (ids: string[]) => void;
}) {
  const [confirmTask, setConfirmTask] = React.useState<TaskDTO | null>(null);
  /* 轮询本身会让相对时间随时间刷新 */
  const running = tasks.filter((t) => t.status === "running" && !isAwaiting(t));
  const awaiting = tasks.filter(isAwaiting);
  const onDeleteOne = (id: string) => onDelete([id]);
  const failed = tasks.filter((t) => t.status === "failed");
  const ok = tasks.filter((t) => t.status === "success");

  const order: { postId: string; tasks: TaskDTO[]; post?: (typeof posts)[number]; running: number; busy: boolean; bad: number; latest: string; latestRaw: string }[] = [];
  const byPost = new Map<string, { postId: string; tasks: TaskDTO[]; post?: (typeof posts)[number]; running: number; busy: boolean; bad: number; latest: string; latestRaw: string }>();
  tasks.forEach((t) => {
    let g = byPost.get(t.postId);
    if (!g) {
      g = { postId: t.postId, tasks: [], running: 0, busy: false, bad: 0, latest: "", latestRaw: "" };
      byPost.set(t.postId, g);
      order.push(g);
    }
    g.tasks.push(t);
  });
  order.forEach((g) => {
    g.post = posts.find((p) => p.id === g.postId);
    g.running = g.tasks.filter((t) => t.status === "running" && !isAwaiting(t)).length;
    /* 忙 = 排队或真正执行中；等待确认（stage3+100%）不算，可删 */
    g.busy = g.tasks.some((t) => t.status === "queued" || (t.status === "running" && !(t.stage === 3 && t.progress >= 100)));
    g.bad = g.tasks.filter((t) => t.status === "failed").length;
    g.latestRaw = g.tasks.reduce((acc, t) => {
      const s = t.finishedAt || t.createdAt || "";
      return s > acc ? s : acc;
    }, "");
    g.latest = relativeTaskTime(g.latestRaw);
  });
  order.sort((a, b) => (b.running > 0 ? 1 : 0) - (a.running > 0 ? 1 : 0));

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-center gap-[18px] font-mono text-xs text-ink2">
        <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-blue" />进行中<b className="ml-[5px] text-[15px] text-ink">{running.length}</b></span>
        <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-accent" />待确认<b className="ml-[5px] text-[15px] text-ink">{awaiting.length}</b></span>
        <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-green" />成功<b className="ml-[5px] text-[15px] text-ink">{ok.length}</b></span>
        <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-error" />失败<b className="ml-[5px] text-[15px] text-ink">{failed.length}</b></span>
        <span className="ml-auto text-ink3">发布在后台跑，不阻塞界面</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {tasks.length === 0 && <div className="rounded-[14px] border border-dashed border-ink3 p-[22px] text-center font-mono text-[13px] text-ink2">队列空闲 — 去编辑器点「发布」试试</div>}
        {order.map((g) => {
          const t0 = g.post ? TYPE_META[g.post.type as keyof typeof TYPE_META] : TYPE_META.article;
          return (
            <article className="group rounded-[14px] border border-line bg-card px-4 py-[11px] shadow-[0_1px_2px_rgba(15,15,15,0.04)] transition-transform hover:-translate-y-0.5" key={g.postId}>
              <div className="flex min-h-[46px] items-center gap-3.5">
                <span className="block h-3.5 w-3.5 flex-none rounded" style={{ background: t0.color }} />
                <Button
                  variant="ghost"
                  className="min-w-0 max-w-[38%] flex-[0_1_auto] truncate border-none bg-transparent p-0 text-left text-[15px] font-bold tracking-[-0.2px] text-ink data-[hovered=true]:bg-transparent data-[hovered=true]:underline"
                  style={{ justifyContent: "flex-start" }}
                  onPress={() => g.post && onOpen(g.post.id)}
                >
                  {g.tasks[0]?.postTitle || "未命名"}
                </Button>
                {g.tasks.some((task) => task.channelName) && (
                  <span className="hidden min-w-0 flex-none max-w-[24%] truncate text-[12px] font-bold text-ink2 xl:block" title={g.tasks.map((t) => [t.channelName, t.failReason].filter(Boolean).join(" · ")).filter(Boolean).join(" / ")}>
                    {g.tasks.map((task) => task.channelName).filter(Boolean).join(" / ")}
                  </span>
                )}
                <div className="ml-1.5 flex flex-none items-center gap-3.5">
                  {g.tasks.map((task) => (
                    <PlatformTile
                      key={task.id}
                      task={task}
                      platform={platforms.find((x) => x.id === task.platformId)}
                      onRetry={onRetry}
                      onAskConfirm={setConfirmTask}
                      onDelete={onDeleteOne}
                    />
                  ))}
                </div>
                <div className="ml-auto flex flex-none items-center gap-3.5 font-mono text-[11px] text-ink2">
                  <span>{g.tasks.length} 个平台</span>
                  <span title={g.latestRaw}>{g.latest}</span>
                  {/* 删除这条队列记录（该稿子的全部发布记录）：只删记录，不动稿子与平台；进行中不可删 */}
                  <span title={g.busy ? "发布进行中，结束后才能删除" : "删除这条队列记录"}>
                    <Button
                      variant="ghost"
                      isDisabled={g.busy}
                      className="h-[22px] min-w-[22px] w-[22px] rounded-[7px] border-none bg-transparent px-0 text-ink3 opacity-0 transition-opacity data-[hovered=true]:bg-error/10 data-[hovered=true]:text-error group-hover:opacity-100 aria-disabled:opacity-25"
                      style={{ justifyContent: "center" }}
                      isIconOnly
                      onPress={() => onDelete(g.tasks.map((t) => t.id))}
                      aria-label="删除这条队列记录"
                    >
                      <X size={11} strokeWidth={3.3} />
                    </Button>
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {confirmTask && (
        <ConfirmPublishDialog
          task={confirmTask}
          platforms={platforms}
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


/* 人工确认必须经过显式弹层：避免把“等”误点成发布成功。
   有公开链接时必须回填；没有公开链接时，也要求用户显式承担确认责任。 */
function ConfirmPublishDialog({
  task, platforms, onClose, onConfirm,
}: {
  task: TaskDTO;
  platforms: PlatformDTO[];
  onClose: () => void;
  onConfirm: (id: string, url: string | null) => void;
}) {
  const [url, setUrl] = React.useState(task.url ?? "");
  const [noPublicUrl, setNoPublicUrl] = React.useState(false);
  const p = platforms.find((x) => x.id === task.platformId) ?? {
    id: task.platformId, name: task.platformId, color: "#2C6FF0", link: "",
  };
  const normalizedUrl = url.trim();
  const urlInvalid = !!normalizedUrl && !/^https?:\/\/\S+$/i.test(normalizedUrl);
  const canConfirm = !urlInvalid && (!!normalizedUrl || noPublicUrl);
  const inspectUrl = task.url || p.link || "#";

  return (
    <Modal>
      <Modal.Backdrop isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
        <Modal.Container>
          <Modal.Dialog
            className="max-w-[520px] rounded-[18px] bg-paper p-6 shadow-[0_14px_40px_rgba(15,15,15,0.16)]"
            role="dialog"
            aria-label={`确认${p.name}发布结果`}
          >
            <Modal.Heading className="text-[17px] font-bold tracking-[-0.2px] text-ink">
              确认 {p.name} 发布结果
            </Modal.Heading>

            <div className="mt-4 flex min-w-0 items-baseline gap-3">
              <span className="w-9 flex-none font-mono text-[10.5px] text-ink3">任务</span>
              <b className="min-w-0 truncate text-sm text-ink">{task.postTitle}</b>
            </div>
            {task.channelName && (
              <div className="mt-2.5 flex min-w-0 items-baseline gap-3">
                <span className="w-9 flex-none font-mono text-[10.5px] text-ink3">目标</span>
                <b className="min-w-0 truncate text-sm text-ink">{task.channelName}</b>
              </div>
            )}

            <OndaLink
              className="mt-4 inline-flex text-sm font-bold text-accent hover:underline"
              href={inspectUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              打开 {p.name} 页面检查
            </OndaLink>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (!canConfirm) return;
              onConfirm(task.id, noPublicUrl ? null : normalizedUrl);
            }}>
              <label className="mt-5 block">
                <span className="block text-[12.5px] font-bold text-ink">回填发布链接</span>
                <Input
                  type="url"
                  inputMode="url"
                  variant="secondary"
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  aria-invalid={urlInvalid}
                  className={
                    "mt-2 w-full rounded-[10px] border bg-card px-3 py-2.5 text-[13px] text-ink shadow-none outline-none transition-colors " +
                    (urlInvalid
                      ? "border-error focus:border-error focus-visible:border-error"
                      : "border-line focus:border-accent focus-visible:border-accent") +
                    " data-[focus-visible=true]:ring-0"
                  }
                />
                {urlInvalid && (
                  <span className="mt-1.5 block text-[11.5px] text-error">请输入 http(s) 开头的完整链接。</span>
                )}
              </label>

              <Checkbox
                isSelected={noPublicUrl}
                onChange={setNoPublicUrl}
                className="mt-3.5"
              >
                <Checkbox.Content className="items-start gap-2.5 text-[12.5px] font-medium leading-relaxed text-ink2">
                  <Checkbox.Control className="mt-0.5 h-[15px] w-[15px] rounded-[5px]">
                    <Checkbox.Indicator>
                      <Check className="h-2.5 w-2.5" strokeWidth={3.2} />
                    </Checkbox.Indicator>
                  </Checkbox.Control>
                  <span>该结果没有公开链接，我已在平台确认完成</span>
                </Checkbox.Content>
              </Checkbox>

              <div className="mt-6 flex items-center justify-end gap-2.5">
                <Button variant="ghost" className="rounded-full bg-transparent px-3.5 py-2 text-[13.5px] font-bold text-ink2 data-[hovered=true]:bg-hover" onPress={onClose}>
                  取消
                </Button>
                <Button
                  type="submit"
                  isDisabled={!canConfirm}
                  className="rounded-full bg-accent px-5 py-2 text-[13.5px] font-bold text-white data-[disabled=true]:opacity-35 data-[hovered=true]:brightness-105"
                >
                  确认发布完成
                </Button>
              </div>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}