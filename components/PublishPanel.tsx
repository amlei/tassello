"use client";

// 发布面板：平台多选 + 约束提示 + 发布按钮 + 该稿件的最近任务。
// 平台与账号的连接状态在这里展示（mock），通过弹层查看全部平台——
// 平台不单独占导航入口。不支持的类型禁用并给出理由；违反硬约束时行内联提示。

import Link from "next/link";
import { useMemo } from "react";
import { CheckCircle, Clock, Link as LinkIcon, ListCheck, Send, Warning } from "reicon-react";
import type { Content, PublishJob } from "@/lib/types";
import {
  PLATFORMS,
  platformSupports,
  validateForPlatform,
} from "@/lib/platforms";
import { contentTypeMeta } from "@/lib/content-types";
import { STAGE_LABEL, useApp } from "@/lib/store";
import { formatDateTime } from "@/lib/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PlatformIcon } from "@/components/PlatformIcon";
import type { ConnectionStatus } from "@/lib/types";

// 连接状态三态：颜色（success/idle/warning）+ 图标 + 文字 + 下一步动作，
// 不依赖颜色也能区分（色盲友好）；「已连接」用 success 绿，不再是浅灰的「不可用」样子。
const CONNECTION_META: Record<
  ConnectionStatus,
  {
    label: string;
    action: string;
    icon: typeof CheckCircle;
    className: string;
  }
> = {
  connected: {
    label: "已连接",
    action: "可直接发布",
    icon: CheckCircle,
    className: "text-success",
  },
  disconnected: {
    label: "未连接",
    action: "尚未连接账号，需要先完成授权",
    icon: LinkIcon,
    className: "text-idle",
  },
  expired: {
    label: "已过期",
    action: "授权已过期，需要重新连接",
    icon: Clock,
    className: "text-warning",
  },
};

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const meta = CONNECTION_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[11px] ${meta.className}`}
    >
      <Icon size={11} color="currentColor" className="shrink-0" />
      {meta.label}
    </span>
  );
}

function PlatformsOverview() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-xs text-ink-600 underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
        >
          查看全部平台与连接状态
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="px-1 font-medium text-sm">全部平台</p>
        <ul className="flex flex-col gap-1">
          {PLATFORMS.map((p) => (
            <li
              key={p.id}
              className="rounded-[6px] px-2 py-1.5 text-xs hover:bg-muted"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium">
                  <PlatformIcon platformId={p.id} />
                  {p.name}
                </span>
                <ConnectionBadge status={p.connection} />
              </div>
              {p.connection !== "connected" && (
                <p className={`mt-0.5 text-[11px] ${p.connection === "expired" ? "text-warning" : "text-idle"}`}>
                  {CONNECTION_META[p.connection].action}
                </p>
              )}
              <p className="mt-0.5 text-ink-600">
                支持：
                {p.supports
                  .map((t) => contentTypeMeta(t).name)
                  .join(" / ")}
              </p>
              {p.constraintNotes !== "—" && (
                <p className="mt-0.5 font-mono text-[11px] text-ink-600">
                  {p.constraintNotes}
                </p>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function jobStatusText(job: PublishJob): string {
  switch (job.status) {
    case "queued":
      return "排队中";
    case "running":
      return `发布中 · ${STAGE_LABEL[job.stage]}`;
    case "succeeded":
      return "已发布";
    case "failed":
      return "失败";
    case "canceled":
      return "已取消";
  }
}

export function PublishPanel({ content }: { content: Content }) {
  const { state, updateContent, publish } = useApp();
  const typeName = contentTypeMeta(content.type).name;

  const rows = useMemo(
    () =>
      PLATFORMS.map((p) => {
        const supported = platformSupports(p, content.type);
        const connected = p.connection === "connected";
        const enabled = supported && connected;
        const problems = supported ? validateForPlatform(content, p) : [];
        return { platform: p, supported, connected, enabled, problems };
      }),
    [content],
  );

  const availableIds = rows.filter((r) => r.enabled).map((r) => r.platform.id);
  const selected = content.platforms.filter((id) =>
    availableIds.includes(id),
  );

  const recentJobs = useMemo(
    () =>
      state.jobs
        .filter((j) => j.contentId === content.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5),
    [state.jobs, content.id],
  );

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    updateContent(content.id, { platforms: next });
  };

  const handlePublish = () => {
    if (selected.length === 0) return;
    // 立即入队，绝不阻塞界面——顶部进度条与任务页接管后续状态
    publish(content.id, selected);
  };

  return (
    <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
      <section className="rounded-[8px] border border-rule bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-base">发布平台</h2>
          <button
            type="button"
            onClick={() => updateContent(content.id, { platforms: availableIds })}
            className="flex items-center gap-1 text-xs text-ink-600 transition-colors hover:text-ink"
          >
            <ListCheck size={13} color="currentColor" />
            选中全部可用平台
          </button>
        </div>

        <ul className="mt-3 flex flex-col">
          {rows.map(({ platform, supported, connected, enabled, problems }) => {
            const isSelected = selected.includes(platform.id);
            return (
              <li key={platform.id} className="border-t border-rule py-2 first:border-t-0">
                <label
                  className={`flex items-center gap-2 text-sm ${
                    enabled ? "cursor-pointer" : "cursor-not-allowed text-ink-300"
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={!enabled}
                    onCheckedChange={() => toggle(platform.id)}
                    aria-label={platform.name}
                  />
                  <PlatformIcon platformId={platform.id} dimmed={!enabled} />
                  <span className="flex-1">{platform.name}</span>
                  <ConnectionBadge status={platform.connection} />
                </label>
                {!supported && (
                  <p className="mt-1 pl-6 text-[11px] text-ink-600">
                    不支持{typeName}
                  </p>
                )}
                {supported && !connected && (
                  <p
                    className={`mt-1 pl-6 text-[11px] ${
                      platform.connection === "expired"
                        ? "text-warning"
                        : "text-idle"
                    }`}
                  >
                    {CONNECTION_META[platform.connection].action}
                  </p>
                )}
                {problems.map((p) => (
                  <p
                    key={p}
                    className="mt-1 flex items-start gap-1 pl-6 text-[11px] text-destructive"
                  >
                    <Warning size={11} color="currentColor" className="mt-0.5 shrink-0" />
                    {p}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>

        <Button
          onClick={handlePublish}
          disabled={selected.length === 0}
          className="mt-3 w-full"
        >
          <Send size={14} color="currentColor" />
          {selected.length > 0 ? `发布到 ${selected.length} 个平台` : "发布"}
        </Button>
        <p className="mt-2 text-center font-mono text-[11px] text-ink-600">
          发布在后台进行，不打断你继续写
        </p>

        <div className="mt-3 border-t border-rule pt-3">
          <PlatformsOverview />
        </div>
      </section>

      <section className="rounded-[8px] border border-rule bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-base">最近任务</h2>
          <Link
            href="/tasks"
            className="flex items-center gap-1 text-xs text-ink-600 transition-colors hover:text-ink"
          >
            <CheckCircle size={13} color="currentColor" />
            发布队列
          </Link>
        </div>
        {recentJobs.length === 0 ? (
          <p className="mt-3 text-xs text-ink-600">
            这篇稿子还没有发布过。选好平台，点「发布」。
          </p>
        ) : (
          <ul className="mt-2 flex flex-col">
            {recentJobs.map((j) => {
              const p = PLATFORMS.find((x) => x.id === j.platformId);
              return (
                <li
                  key={j.id}
                  className="flex items-baseline justify-between gap-2 border-t border-rule py-1.5 text-xs first:border-t-0"
                >
                  <span>{p?.name ?? j.platformId}</span>
                  <span
                    className={
                      j.status === "failed"
                        ? "text-destructive"
                        : j.status === "succeeded"
                          ? "text-success"
                          : "text-ink-600"
                    }
                  >
                    {jobStatusText(j)}
                  </span>
                  <span className="font-mono text-[11px] text-ink-600">
                    {formatDateTime(j.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}
