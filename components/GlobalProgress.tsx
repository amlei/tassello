"use client";

// 顶部全局进度条：贴在顶栏下沿的一条细线（3px 以内）。
// 只在存在活跃任务时出现，显示聚合进度；点击跳转到发布队列。
// 任务全部结束后短暂显示结果，然后淡出。

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";

export function GlobalProgress() {
  const { state } = useApp();
  const jobs = state.jobs;
  const active = jobs.filter(
    (j) => j.status === "queued" || j.status === "running",
  );
  const finished = jobs.filter(
    (j) => j.status === "succeeded" || j.status === "failed",
  );
  const total = active.length + finished.length;
  const done = finished.length;
  const hasActive = active.length > 0;

  const progress =
    total === 0
      ? 0
      : Math.round(
          (finished.length + active.reduce((s, j) => s + j.progress, 0) / 100) /
            total *
            100,
        );

  // 全部结束后短暂显示结果再淡出
  const [showResult, setShowResult] = useState(false);
  const wasActive = useRef(false);
  useEffect(() => {
    if (hasActive) {
      wasActive.current = true;
      return;
    }
    if (wasActive.current && total > 0) {
      wasActive.current = false;
      const show = setTimeout(() => setShowResult(true), 0);
      const hide = setTimeout(() => setShowResult(false), 3000);
      return () => {
        clearTimeout(show);
        clearTimeout(hide);
      };
    }
  }, [hasActive, total]);

  if (!state.hydrated || (!hasActive && !showResult)) return null;

  const failedCount = jobs.filter((j) => j.status === "failed").length;

  return (
    <div className={!hasActive && showResult ? "progress-done" : undefined}>
      <Link
        href="/tasks"
        aria-label={`发布队列：${done}/${total} 已完成`}
        className="group relative block h-6 border-b border-rule bg-surface px-4"
      >
        <span className="flex h-full items-center justify-between font-mono text-[11px] text-ink-600">
          <span>
            {hasActive ? (
              <>
                正在发布 <span className="text-ink">{done}</span>
                <span className="text-ink-300">/</span>
                <span className="text-ink">{total}</span>
                <span className="ml-2 text-ink-300">
                  {active[0]?.message ?? ""}
                </span>
              </>
            ) : failedCount > 0 ? (
              <span>
                发布结束：{done - failedCount} 个平台已发布，
                {failedCount} 个失败。查看发布队列 →
              </span>
            ) : (
              <span>已发布 {done}/{total}。查看发布队列 →</span>
            )}
          </span>
          <span className="text-ink-300 group-hover:text-ink">队列 →</span>
        </span>
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[2px] bg-rule/60"
        >
          <span
            className="progress-bar-fill block h-full bg-ink"
            style={{ width: `${progress}%` }}
          />
        </span>
      </Link>
    </div>
  );
}
