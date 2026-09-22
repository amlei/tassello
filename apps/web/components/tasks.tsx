/* tasks —— 发布队列：一篇稿子一行，平台是一枚枚可点的方块（移植原型 tasks.jsx） */
"use client";

import React from "react";
import { STAGE_LABELS, TYPE_META, type PlatformDTO, type TaskDTO } from "@tassello/shared";
import { Button, Link as OndaLink } from "@heroui/react";
import { PlatformMark } from "./platform-icons";
import { Alert, Check, Refresh } from "reicon-react";

function PlatformTile({
  task, platform, onRetry, onConfirm,
}: {
  task: TaskDTO;
  platform?: PlatformDTO;
  onRetry: (id: string) => void;
  onConfirm: (id: string) => void;
}) {
  const p = platform ?? { id: task.platformId, name: task.platformId, char: "?", color: "#2C6FF0", fg: undefined };
  const running = task.status === "running";
  const ok = task.status === "success";
  const pct = Math.max(0, Math.min(100, Math.floor(task.progress)));
  const awaiting = running && task.stage === 3 && task.progress >= 100;
  const fg = (p as { fg?: string }).fg || "#fff";
  const pc = (p as { color: string }).color;

  const TILE =
    "relative flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[14px] border border-transparent p-0 text-base font-black leading-none shadow-[0_1px_2px_rgba(15,15,15,0.06)] transition-transform data-[hovered=true]:-translate-y-[3px]";
  const body = (
    <span className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[12px]" aria-hidden="true">
      <span className="relative z-[2]"><PlatformMark id={p.id} char={(p as { char: string }).char} size={18} imgScale={1.4} /></span>
      {running && (
        <span className="absolute inset-x-0 bottom-0 z-[1] transition-[height] duration-[550ms]" style={{ height: `${pct}%`, background: pc }}>
          {/* 两层同宽椭圆叠出水面：一层定形，一层缓慢平移做波纹 */}
          <i className="absolute left-[-60%] top-[-6px] block h-3 w-[220%] rounded-[50%] opacity-95" style={{ background: pc }} />
          <i className="absolute left-[-60%] top-[-3px] block h-3 w-[220%] rounded-[50%] opacity-55 animate-q-wave" style={{ background: pc }} />
          <span className="absolute inset-x-0 bottom-0 z-[1] flex h-[46px] items-center justify-center font-black" style={{ color: fg }}>
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
      <OndaLink
        className={TILE}
        style={{ background: pc, color: fg }}
        href={task.url}
        aria-label={`${p.name} 已发布，点击访问`}
      >
        {body}
        <span className="absolute right-[-6px] top-[-6px] z-[3] flex h-[19px] w-[19px] items-center justify-center rounded-[7px] border-2 border-white text-white" style={{ background: "var(--color-green)" }}><Check size={10} strokeWidth={4} /></span>
      </OndaLink>
    );
  }
  if (awaiting) {
    // 人工确认：适配器已把内容填进浏览器，等用户点完发布回来标记
    return (
      <span title={`${p.name} · 已到「${STAGE_LABELS[3]}」，检查浏览器后点这里标记完成`}>
        <Button
          className={TILE + " cursor-default bg-hover"}
          style={{ color: pc }}
          onPress={() => onConfirm(task.id)}
        >
          {body}
          <span className="absolute bottom-[-7px] right-[-7px] z-[3] flex h-[17px] min-w-5 items-center justify-center rounded-md border-2 border-white bg-accent px-1 font-mono text-[9.5px] font-extrabold text-white">等</span>
        </Button>
      </span>
    );
  }
  if (running) {
    return (
      <span className={TILE + " cursor-default bg-hover hover:translate-y-0"} style={{ color: pc }} title={`${p.name} · ${STAGE_LABELS[task.stage]} ${pct}%`}>
        {body}
        <span className="absolute bottom-[-7px] right-[-7px] z-[3] flex h-[17px] min-w-5 items-center justify-center rounded-md border-2 border-white bg-accent px-1 font-mono text-[9.5px] font-extrabold text-white">{pct}</span>
      </span>
    );
  }
  return (
    <span title={`${p.name} · 发布失败，点一下重试`}>
      <Button
        className={TILE + " text-white"}
        style={{ background: "var(--color-error)", borderColor: "var(--color-error)" }}
        onPress={() => onRetry(task.id)}
        aria-label={`${p.name} 发布失败，点击重试`}
      >
        {body}
        <span className="absolute right-[-6px] top-[-6px] z-[3] flex h-[19px] w-[19px] items-center justify-center rounded-[7px] border-2 border-white text-white" style={{ background: "var(--color-error)" }}><Alert size={10} strokeWidth={4} /></span>
      </Button>
    </span>
  );
}

export function TasksView({
  tasks, posts, platforms, onRetry, onConfirm, onOpen,
}: {
  tasks: TaskDTO[];
  posts: { id: string; type: string; title: string }[];
  platforms: PlatformDTO[];
  onRetry: (id: string) => void;
  onConfirm: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const running = tasks.filter((t) => t.status === "running" && !(t.stage === 3 && t.progress >= 100));
  const failed = tasks.filter((t) => t.status === "failed");
  const ok = tasks.filter((t) => t.status === "success");

  const order: { postId: string; tasks: TaskDTO[]; post?: (typeof posts)[number]; running: number; bad: number; latest: string }[] = [];
  const byPost = new Map<string, { postId: string; tasks: TaskDTO[]; post?: (typeof posts)[number]; running: number; bad: number; latest: string }>();
  tasks.forEach((t) => {
    let g = byPost.get(t.postId);
    if (!g) {
      g = { postId: t.postId, tasks: [], running: 0, bad: 0, latest: "" };
      byPost.set(t.postId, g);
      order.push(g);
    }
    g.tasks.push(t);
  });
  order.forEach((g) => {
    g.post = posts.find((p) => p.id === g.postId);
    g.running = g.tasks.filter((t) => t.status === "running").length;
    g.bad = g.tasks.filter((t) => t.status === "failed").length;
    g.latest = g.tasks.reduce((acc, t) => {
      const s = (t.finishedAt || t.createdAt || "").replace("T", " ").slice(5, 16);
      return s > acc ? s : acc;
    }, "");
  });
  order.sort((a, b) => (b.running > 0 ? 1 : 0) - (a.running > 0 ? 1 : 0));

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-center gap-[18px] font-mono text-xs text-ink2">
        <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-blue" />进行中<b className="ml-[5px] text-[15px] text-ink">{running.length}</b></span>
        <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-green" />成功<b className="ml-[5px] text-[15px] text-ink">{ok.length}</b></span>
        <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-error" />失败<b className="ml-[5px] text-[15px] text-ink">{failed.length}</b></span>
        <span className="ml-auto text-ink3">发布在后台跑，不阻塞界面</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {tasks.length === 0 && <div className="rounded-[14px] border border-dashed border-ink3 p-[22px] text-center font-mono text-[13px] text-ink2">队列空闲 — 去编辑器点「发布」试试</div>}
        {order.map((g) => {
          const t0 = g.post ? TYPE_META[g.post.type as keyof typeof TYPE_META] : TYPE_META.article;
          const problems = g.tasks.filter((x) => x.status === "failed");
          return (
            <article className="rounded-[14px] border border-line bg-card px-4 py-[11px] shadow-[0_1px_2px_rgba(15,15,15,0.04)] transition-transform hover:-translate-y-0.5" key={g.postId}>
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
                <div className="ml-1.5 flex flex-none items-center gap-3.5">
                  {g.tasks.map((task) => (
                    <PlatformTile
                      key={task.id}
                      task={task}
                      platform={platforms.find((x) => x.id === task.platformId)}
                      onRetry={onRetry}
                      onConfirm={onConfirm}
                    />
                  ))}
                </div>
                <div className="ml-auto flex flex-none items-center gap-3.5 font-mono text-[11px] text-ink2">
                  <span>{g.tasks.length} 个平台</span>
                  <span>{g.latest}</span>
                </div>
              </div>
              {problems.map((p) => {
                const pf = platforms.find((x) => x.id === p.platformId);
                return (
                  <div className="mt-[9px] flex w-fit max-w-full items-center gap-[9px] rounded-[11px] border border-error/30 bg-error/10 px-3 py-2 text-error" key={p.id}>
                    <Alert size={13} strokeWidth={3.3} />
                    <span className="min-w-0 truncate text-[12.5px] leading-normal"><b className="font-black">{pf ? pf.name : p.platformId}</b> · {p.failReason}</span>
                    <Button variant="ghost" className="inline-flex flex-none items-center gap-[5px] rounded-full border border-error bg-card px-[11px] py-[3px] font-mono text-[11px] font-bold text-error data-[hovered=true]:bg-error data-[hovered=true]:text-white" onPress={() => onRetry(p.id)}><Refresh size={11} strokeWidth={3.3} /> 重试</Button>
                  </div>
                );
              })}
            </article>
          );
        })}
      </div>
    </div>
  );
}
