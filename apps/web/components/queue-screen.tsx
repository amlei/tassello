/* queue-screen —— 发布队列页（客户端）：任务轮询 + 重试/确认 */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { PlatformDTO, TaskDTO } from "@tassello/shared";
import { api } from "./api";
import { WorkspaceShell } from "./workspace-shell";
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
  /* 删除队列记录（一组或单条失败）：只删记录，不动稿子与平台账号 */
  const deleteTasks = async (ids: string[]) => {
    try { await Promise.all(ids.map((id) => api.deleteTask(id))); } catch {}
    void api.listTasks().then(setTasks).catch(() => {});
  };
  const runningCount = tasks.filter((t) => t.status === "running").length;
  const avgProgress = runningCount
    ? Math.round(tasks.filter((t) => t.status === "running").reduce((sum, t) => sum + t.progress, 0) / runningCount)
    : 0;

  return (
    <WorkspaceShell
      active="queue"
      counts={counts}
      runningCount={runningCount}
      queueCount={tasks.length}
      platforms={platforms}
      screenLabel="发布队列"
      context={{ title: "发布队列", meta: `${tasks.length} 条发布` }}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[1560px] flex-1 flex-col">
        <div className="scroll-thin min-h-0 flex-1 overflow-auto px-[34px] pb-[120px]">
          <TasksView
            tasks={tasks}
            posts={postMins}
            platforms={platforms}
            onRetry={(id) => void retryTask(id)}
            onConfirm={(id) => void confirmTask(id)}
            onOpen={(id) => router.push(`/editor/${id}`)}
            onDelete={(ids) => void deleteTasks(ids)}
          />
        </div>
      </div>
      <FloatingPill running={runningCount} avg={avgProgress} onClick={() => {}} />
    </WorkspaceShell>
  );
}
