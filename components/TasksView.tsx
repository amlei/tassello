"use client";

// 任务页 /tasks：发布状态的真相源。
// 进行中区段用 AI Elements 的 queue + task 呈现每个平台任务，展开可见
// plan（分步计划）、terminal（发布日志）、confirmation（等待人工确认）；
// 已完成区段用 commit 呈现历史条目，失败任务带 stack-trace 错误详情并可重试。

import Link from "next/link";
import { useMemo } from "react";
import { CheckCircle, Refresh, Trash, XCircle } from "reicon-react";
import type { Content, JobStage, PublishJob } from "@/lib/types";
import { platformById } from "@/lib/platforms";
import { STAGE_LABEL, useApp } from "@/lib/store";
import { formatDuration } from "@/lib/format";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Queue,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "@/components/ai-elements/queue";
import { Task, TaskContent, TaskTrigger } from "@/components/ai-elements/task";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import {
  Confirmation,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import { Terminal } from "@/components/ai-elements/terminal";
import {
  StackTrace,
  StackTraceContent,
  StackTraceError,
  StackTraceErrorMessage,
  StackTraceErrorType,
  StackTraceExpandButton,
  StackTraceFrames,
  StackTraceHeader,
} from "@/components/ai-elements/stack-trace";
import {
  Commit,
  CommitActions,
  CommitContent,
  CommitHash,
  CommitHeader,
  CommitInfo,
  CommitMessage,
  CommitMetadata,
  CommitSeparator,
  CommitTimestamp,
} from "@/components/ai-elements/commit";
import { Shimmer } from "@/components/ai-elements/shimmer";

const STAGE_ORDER: JobStage[] = ["render", "assets", "fill", "review", "done"];

function stageIndex(stage: JobStage): number {
  return STAGE_ORDER.indexOf(stage);
}

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 7);
}

function clock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 由任务状态合成一份可读的发布日志（确定性，不随机） */
function jobLog(job: PublishJob, content: Content | undefined): string {
  const lines: string[] = [];
  const platform = platformById(job.platformId);
  lines.push(
    `[${clock(job.createdAt)}] 进入发布队列 → ${platform?.name ?? job.platformId}`,
  );
  if (!job.startedAt) {
    lines.push("等待队列调度 …");
    return lines.join("\n");
  }
  lines.push(`[${clock(job.startedAt)}] 渲染排版`);
  const idx = stageIndex(job.stage);
  if (idx > stageIndex("render") || job.status === "failed") {
    if (job.status === "failed") {
      lines.push(`渲染排版时校验失败`);
    } else {
      lines.push(`渲染排版完成`);
    }
  }
  if (idx > stageIndex("render") && job.status !== "failed") {
    const n = content?.assets.length ?? 0;
    lines.push(n > 0 ? `素材上传完成（${n} 个）` : "无素材，跳过上传");
  }
  if (idx > stageIndex("assets") && job.status !== "failed") {
    lines.push("平台编辑器填充完成");
  }
  if (idx > stageIndex("fill") && job.status !== "failed") {
    lines.push("等待人工确认 …");
  }
  if (job.status === "succeeded" && job.finishedAt) {
    lines.push(`[${clock(job.finishedAt)}] 已发布`);
  }
  if (job.status === "failed" && job.finishedAt) {
    lines.push(`[${clock(job.finishedAt)}] 失败：${job.message}`);
  }
  if (job.status === "running") {
    lines.push(job.message);
  }
  return lines.join("\n");
}

function failureTrace(job: PublishJob, platformName: string): string {
  return [
    `ConstraintError: ${job.message}`,
    `    at validateForPlatform (lib/platforms.ts:103:11)`,
    `    at runPublishJob (lib/store.tsx:271:9)`,
    `    at publish → ${platformName} (attempt ${job.attempt})`,
  ].join("\n");
}

function StageList({ job }: { job: PublishJob }) {
  const current = stageIndex(job.stage);
  const failed = job.status === "failed";
  return (
    <ol className="flex flex-col gap-1.5">
      {STAGE_ORDER.slice(0, 4).map((stage) => {
        const done = stageIndex(stage) < current || job.status === "succeeded";
        const active =
          !failed && job.status === "running" && stageIndex(stage) === current;
        const brokeHere = failed && stage === "render";
        return (
          <li
            key={stage}
            className="flex items-center gap-2 font-mono text-xs"
          >
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                brokeHere
                  ? "bg-destructive"
                  : done
                    ? "bg-ink"
                    : active
                      ? "animate-pulse bg-ink"
                      : "bg-rule"
              }`}
            />
            <span className={done || active ? "text-ink" : "text-ink-300"}>
              {STAGE_LABEL[stage]}
            </span>
            {brokeHere && (
              <span className="text-destructive">校验未通过</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ActiveJobItem({
  job,
  content,
}: {
  job: PublishJob;
  content: Content | undefined;
}) {
  const { cancelJob } = useApp();
  const platform = platformById(job.platformId);
  const running = job.status === "running";
  const title = content?.title || "未命名稿件";

  return (
    <Task defaultOpen={false} className="rounded-md border border-rule bg-surface px-3 py-2">
      <TaskTrigger title={`${platform?.name ?? job.platformId} · ${title}`}>
        <div className="flex w-full cursor-pointer items-center gap-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-ink">
              {platform?.name ?? job.platformId}
              <span className="mx-1.5 text-ink-300">·</span>
              <span className="text-ink-600">{title}</span>
            </span>
            <span className="mt-0.5 block font-mono text-[11px] text-ink-300">
              {running ? (
                <Shimmer duration={1.6} className="text-[11px]">
                  {job.message}
                </Shimmer>
              ) : (
                job.message
              )}
            </span>
          </span>
          <span className="hidden w-28 shrink-0 sm:block">
            <Progress value={job.progress} className="h-[3px]" />
          </span>
          <span className="shrink-0 font-mono text-[11px] text-ink-600">
            {STAGE_LABEL[job.stage]}
          </span>
          {job.status === "queued" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cancelJob(job.id);
              }}
              className="flex shrink-0 items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px] text-ink-600 transition-colors hover:bg-muted hover:text-ink"
            >
              <XCircle size={12} color="currentColor" />
              取消
            </button>
          )}
        </div>
      </TaskTrigger>
      <TaskContent>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Plan isStreaming={running} defaultOpen>
            <PlanHeader>
              <div>
                <PlanTitle>{`发布到 ${platform?.name ?? job.platformId}`}</PlanTitle>
                <PlanDescription>
                  渲染排版 → 上传素材 → 填充编辑器 → 等待人工确认
                </PlanDescription>
              </div>
              <PlanAction>
                <PlanTrigger />
              </PlanAction>
            </PlanHeader>
            <PlanContent>
              <StageList job={job} />
            </PlanContent>
          </Plan>
          <div className="flex flex-col gap-3">
            {running && job.stage === "review" && (
              <Confirmation approval={{ id: job.id }} state="approval-requested">
                <ConfirmationTitle>
                  平台编辑器已填充，等待人工确认。
                </ConfirmationTitle>
                <ConfirmationRequest>
                  <p className="text-xs text-muted-foreground">
                    原型环境将自动确认并继续发布；接入真实平台后，这里需要人工点一次。
                  </p>
                </ConfirmationRequest>
              </Confirmation>
            )}
            <Terminal
              output={jobLog(job, content)}
              isStreaming={running}
              className="max-h-56"
            />
          </div>
        </div>
      </TaskContent>
    </Task>
  );
}

function FinishedJobItem({
  job,
  content,
}: {
  job: PublishJob;
  content: Content | undefined;
}) {
  const { retryJob } = useApp();
  const platform = platformById(job.platformId);
  const platformName = platform?.name ?? job.platformId;
  const title = content?.title || "未命名稿件";
  const failed = job.status === "failed";
  const elapsed =
    job.startedAt && job.finishedAt ? job.finishedAt - job.startedAt : null;
  const statusText = failed
    ? "失败"
    : job.status === "canceled"
      ? "已取消"
      : "已发布";

  return (
    <Commit defaultOpen={false}>
      <CommitHeader>
        <CommitInfo>
          <span className="flex items-center gap-2">
            <CommitHash>{shortId(job.id)}</CommitHash>
            <CommitMessage>
              《{title}》→ {platformName}
            </CommitMessage>
          </span>
          <CommitMetadata>
            <span className={failed ? "text-destructive" : undefined}>
              {statusText}
            </span>
            <CommitSeparator />
            <span>第 {job.attempt} 次尝试</span>
            {elapsed !== null && (
              <>
                <CommitSeparator />
                <span>耗时 {formatDuration(elapsed)}</span>
              </>
            )}
            <CommitSeparator />
            <CommitTimestamp date={new Date(job.createdAt)} />
          </CommitMetadata>
        </CommitInfo>
        {failed && (
          <CommitActions>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => retryJob(job.id)}
              className="gap-1"
            >
              <Refresh size={13} color="currentColor" />
              重试
            </Button>
          </CommitActions>
        )}
      </CommitHeader>
      <CommitContent>
        {failed ? (
          <div className="p-3">
            <StackTrace trace={failureTrace(job, platformName)}>
              <StackTraceHeader>
                <StackTraceError>
                  <StackTraceErrorType />
                  <StackTraceErrorMessage />
                </StackTraceError>
                <StackTraceExpandButton />
              </StackTraceHeader>
              <StackTraceContent>
                <StackTraceFrames />
              </StackTraceContent>
            </StackTrace>
          </div>
        ) : (
          <p className="p-3 text-xs text-muted-foreground">
            {job.message}
            {job.status === "succeeded" &&
              "。再次发布同一平台会生成新的任务。"}
          </p>
        )}
      </CommitContent>
    </Commit>
  );
}

export function TasksView() {
  const { state, clearFinishedJobs } = useApp();

  const { active, finished } = useMemo(() => {
    const sorted = [...state.jobs].sort((a, b) => b.createdAt - a.createdAt);
    return {
      active: sorted.filter(
        (j) => j.status === "queued" || j.status === "running",
      ),
      finished: sorted.filter(
        (j) =>
          j.status === "succeeded" ||
          j.status === "failed" ||
          j.status === "canceled",
      ),
    };
  }, [state.jobs]);

  if (!state.hydrated) return null;

  const contentOf = (id: string) => state.contents.find((c) => c.id === id);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="flex items-end justify-between border-b-2 border-ink pb-3">
        <div>
          <h1 className="font-serif text-2xl">发布队列</h1>
          <p className="mt-1 font-mono text-xs text-ink-300">
            {active.length} 个进行中 · {finished.length} 条记录
          </p>
        </div>
        {finished.length > 0 && (
          <button
            type="button"
            onClick={clearFinishedJobs}
            className="flex items-center gap-1.5 rounded-[6px] border border-rule bg-surface px-3 py-2 text-sm text-ink-600 transition-colors hover:text-ink"
          >
            <Trash size={14} color="currentColor" />
            清空已完成
          </button>
        )}
      </header>

      {state.jobs.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-[6px] border border-rule bg-surface"
          >
            <CheckCircle size={22} color="currentColor" className="text-ink-300" />
          </span>
          <p className="font-serif text-lg">还没有发布记录。</p>
          <p className="max-w-sm text-sm text-ink-600">
            去发布页挑一篇稿子，选好平台就能发。
          </p>
          <Link
            href="/"
            className="mt-2 rounded-[6px] bg-ink px-4 py-2 text-sm text-surface transition-colors hover:bg-ink-600"
          >
            去发布页
          </Link>
        </div>
      ) : (
        <Queue className="mt-4">
          {active.length > 0 && (
            <QueueSection defaultOpen>
              <QueueSectionTrigger>
                <QueueSectionLabel count={active.length} label="个进行中" />
              </QueueSectionTrigger>
              <QueueSectionContent>
                <div className="flex flex-col gap-2 py-2">
                  {active.map((j) => (
                    <ActiveJobItem key={j.id} job={j} content={contentOf(j.contentId)} />
                  ))}
                </div>
              </QueueSectionContent>
            </QueueSection>
          )}
          {finished.length > 0 && (
            <QueueSection defaultOpen={active.length === 0}>
              <QueueSectionTrigger>
                <QueueSectionLabel count={finished.length} label="条已完成" />
              </QueueSectionTrigger>
              <QueueSectionContent>
                <div className="flex flex-col gap-2 py-2">
                  {finished.map((j) => (
                    <FinishedJobItem
                      key={j.id}
                      job={j}
                      content={contentOf(j.contentId)}
                    />
                  ))}
                </div>
              </QueueSectionContent>
            </QueueSection>
          )}
        </Queue>
      )}
    </div>
  );
}
