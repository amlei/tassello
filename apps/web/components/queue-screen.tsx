/* queue-screen —— 发布队列页（客户端）：任务轮询 + 重试/确认 */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { PlatformDTO, TaskDTO } from "@tassello/shared";
import { api } from "./api";
import { Rail } from "./rail";
import { TasksView } from "./tasks";
import { FloatingPill } from "./bits";

export function QueueScreen({
  tasks: initialTasks, postMins, platforms, counts,
}: {
  tasks: TaskDTO[];
  postMins: { id: string; type: string; title: string }[];
  platforms: PlatformDTO[];
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const [tasks, setTasks] = React.useState(initialTasks);
  /* 队列是发布事实的唯一展示处：1.5s 轮询推进水位 */
  React.useEffect(() => {
    const timer = setInterval(() => { void api.listTasks().then(setTasks).catch(() => {}); }, 1500);
    return () => clearInterval(timer);
  }, []);

  const retryTask = async (id: string) => {
    try { await api.retryTask(id); } catch {}
    void api.listTasks().then(setTasks).catch(() => {});
  };
  const confirmTask = async (id: string) => {
    try { await api.confirmTask(id); } catch {}
    void api.listTasks().then(setTasks).catch(() => {});
  };
  const runningCount = tasks.filter((t) => t.status === "running").length;
  const avgProgress = runningCount
    ? Math.round(tasks.filter((t) => t.status === "running").reduce((sum, t) => sum + t.progress, 0) / runningCount)
    : 0;

  return (
    <div className="flex h-screen min-h-0 overflow-hidden" data-screen-label="发布队列">
      <Rail active="queue" counts={counts} runningCount={runningCount} queueCount={tasks.length} platforms={platforms} />
      <div className="mx-auto flex min-h-0 w-full max-w-[1560px] flex-1 flex-col">
        <header className="flex flex-none flex-wrap items-end gap-4 px-[34px] pb-4 pt-[26px]">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="text-[28px] font-bold leading-[1.35] tracking-[-0.4px]">发布队列</h1>
            <span className="whitespace-nowrap font-mono text-[11.5px] tracking-[0.5px] text-ink2">{tasks.length} 个发布动作 · 发布事实只此一处</span>
          </div>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-auto px-[34px] pb-[120px]">
          <TasksView
            tasks={tasks}
            posts={postMins}
            platforms={platforms}
            onRetry={(id) => void retryTask(id)}
            onConfirm={(id) => void confirmTask(id)}
            onOpen={(id) => router.push(`/editor/${id}`)}
          />
        </div>
      </div>
      <FloatingPill running={runningCount} avg={avgProgress} onClick={() => {}} />
    </div>
  );
}
