/* queue-screen —— 发布队列页面：任务轮询、重试与确认 */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { PlatformDTO, TaskDTO } from "@tassello/shared";
import { api, connectClientEvents } from "../adapters/api";
import { WorkspaceShell } from "../adapters/workspace-shell";
import { TasksView } from "../features/queue/tasks-view";
import { FloatingPill } from "../features/feedback/floating-pill";

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
  const [livePlatforms, setLivePlatforms] = React.useState(platforms);
  /* 队列是发布事实的唯一展示处：1.5s 轮询推进水位 */
  React.useEffect(() => {
    const timer = setInterval(() => { void api.listTasks().then(setTasks).catch(() => {}); }, 1500);
    return () => clearInterval(timer);
  }, []);
  React.useEffect(() => connectClientEvents((event) => {
    if (event.type === "platforms" || event.type === "snapshot") setLivePlatforms(event.platforms);
  }), []);

  const retryTask = async (id: string) => {
    try { await api.retryTask(id); } catch {}
    void api.listTasks().then(setTasks).catch(() => {});
  };
  const confirmTask = async (id: string, url: string | null, noPublicUrl: boolean) => {
    try { await api.confirmTask(id, url ?? undefined, noPublicUrl); } catch {}
    void api.listTasks().then(setTasks).catch(() => {});
  };
  const focusTask = async (id: string) => {
    try {
      await api.focusTaskTab(id);
    } catch {}
  };
  /* 删除队列记录（一组或单条失败）：只删记录，不动稿子与平台账号 */
  const deleteTasks = async (ids: string[]) => {
    try { await Promise.all(ids.map((id) => api.deleteTask(id))); } catch {}
    void api.listTasks().then(setTasks).catch(() => {});
  };
  const activeRunningTasks = tasks.filter((t) => (
    t.status === "running" || t.status === "rendering" || t.status === "uploading" || t.status === "filling"
  ) && !(t.stage === 3 && t.progress >= 100));
  const runningCount = activeRunningTasks.length;
  const queueItemCount = new Set(tasks.map((t) => t.postId)).size;
  const activeRunningItemCount = new Set(activeRunningTasks.map((t) => t.postId)).size;
  const avgProgress = runningCount
    ? Math.round(activeRunningTasks.reduce((sum, t) => sum + t.progress, 0) / runningCount)
    : 0;

  return (
    <WorkspaceShell
      active="queue"
      counts={counts}
      runningCount={activeRunningItemCount}
      queueCount={queueItemCount}
      platforms={livePlatforms}
      screenLabel="发布队列"
      context={{ title: "发布队列" }}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[1560px] flex-1 flex-col">
        <div className="scroll-thin min-h-0 flex-1 overflow-auto px-[34px] pt-3 pb-[120px]">
          <TasksView
            tasks={tasks}
            posts={postMins}
            platforms={livePlatforms}
            onRetry={(id) => void retryTask(id)}
            onConfirmTask={(id, url, noPublicUrl) => void confirmTask(id, url, noPublicUrl)}
            onFocus={(id) => void focusTask(id)}
            onOpen={(id) => router.push(`/editor/${id}`)}
            onDelete={(ids) => void deleteTasks(ids)}
          />
        </div>
      </div>
      <FloatingPill running={runningCount} avg={avgProgress} onClick={() => {}} />
    </WorkspaceShell>
  );
}
