"use client";

// 发布页主区域：当前内容类型的稿件列表。
// 每行是一个「版面样本」——格式标记、标题、已选平台 chip、最近发布状态、更新时间。
// 密集但有序的信息表，不做卡片瀑布。新建入口在表头，创建的内容属于当前类型。

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "reicon-react";
import type { Content, ContentTypeId, PublishJob } from "@/lib/types";
import { contentTypeMeta } from "@/lib/content-types";
import { platformById } from "@/lib/platforms";
import { useApp } from "@/lib/store";
import { formatDateTime } from "@/lib/format";
import { FormatMark } from "./FormatMark";
import { NewContentDialog } from "./NewContentDialog";

function latestBatch(jobs: PublishJob[]): PublishJob[] {
  if (jobs.length === 0) return [];
  const max = Math.max(...jobs.map((j) => j.createdAt));
  return jobs.filter((j) => j.createdAt === max);
}

function StatusCell({ jobs }: { jobs: PublishJob[] }) {
  if (jobs.length === 0) return <span className="text-ink-300">尚未发布</span>;
  const batch = latestBatch(jobs);
  const running = batch.filter(
    (j) => j.status === "queued" || j.status === "running",
  ).length;
  const failed = batch.filter((j) => j.status === "failed").length;
  const done = batch.filter((j) => j.status === "succeeded").length;
  if (running > 0)
    return (
      <span>
        发布中 <span className="font-mono">{done}/{batch.length}</span>
      </span>
    );
  if (failed > 0)
    return (
      <span>
        <span className="text-ink">{done} 个已发布</span>
        <span className="text-ink-300"> · </span>
        <span className="text-destructive">{failed} 个失败</span>
      </span>
    );
  return <span>{done} 个平台已发布</span>;
}

function Row({ content, jobs }: { content: Content; jobs: PublishJob[] }) {
  const meta = contentTypeMeta(content.type);
  const platforms = content.platforms
    .map((id) => platformById(id))
    .filter((p) => p !== undefined);
  return (
    <li className="row-enter">
      <Link
        href={`/content/${content.id}`}
        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-rule px-4 py-2.5 transition-colors hover:bg-surface sm:grid-cols-[auto_minmax(0,2fr)_minmax(0,2fr)_auto_auto] sm:gap-x-4"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-rule bg-surface">
          <FormatMark type={content.type} size={16} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-serif text-[15px]">
            {content.title || `未命名${meta.name}`}
          </span>
          <span className="mt-0.5 block font-mono text-[11px] text-ink-300">
            {meta.name}
          </span>
        </span>
        <span className="hidden min-w-0 flex-wrap gap-1 sm:flex">
          {platforms.length === 0 ? (
            <span className="text-xs text-ink-300">未选平台</span>
          ) : (
            platforms.map((p) => (
              <span
                key={p.id}
                className="rounded-full border border-rule bg-surface px-2 py-0.5 text-[11px] text-ink-600"
              >
                {p.name}
              </span>
            ))
          )}
        </span>
        <span className="hidden text-xs text-ink-600 sm:block">
          <StatusCell jobs={jobs} />
        </span>
        <span className="text-right font-mono text-[11px] text-ink-300">
          {formatDateTime(content.updatedAt)}
        </span>
      </Link>
    </li>
  );
}

export function Workbench({ type }: { type: ContentTypeId }) {
  const { state } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const meta = contentTypeMeta(type);

  const rows = useMemo(
    () =>
      state.contents
        .filter((c) => c.type === type)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [state.contents, type],
  );

  const jobsByContent = useMemo(() => {
    const map = new Map<string, PublishJob[]>();
    for (const j of state.jobs) {
      const arr = map.get(j.contentId) ?? [];
      arr.push(j);
      map.set(j.contentId, arr);
    }
    return map;
  }, [state.jobs]);

  if (!state.hydrated) return null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="flex items-end justify-between border-b-2 border-ink pb-3">
        <div>
          <h1 className="flex items-center gap-2.5 font-serif text-2xl">
            <FormatMark type={type} size={22} />
            {meta.name}
          </h1>
          <p className="mt-1 font-mono text-xs text-ink-300">
            {rows.length} 篇 · {meta.blurb}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 rounded-[6px] bg-ink px-3.5 py-2 text-sm text-surface transition-colors hover:bg-ink-600"
        >
          <Plus size={15} color="currentColor" />
          新建
        </button>
      </header>

      {rows.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-[6px] border border-rule bg-surface"
          >
            <FormatMark type={type} size={26} />
          </span>
          <p className="font-serif text-lg">这一类还没有稿子。</p>
          <p className="max-w-sm text-sm text-ink-600">
            {meta.blurb}点「新建」写第一篇{meta.name}
            ，选好平台就能一次铺出去。
          </p>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="mt-2 flex items-center gap-1.5 rounded-[6px] bg-ink px-4 py-2 text-sm text-surface transition-colors hover:bg-ink-600"
          >
            <Plus size={15} color="currentColor" />
            新建{meta.name}
          </button>
        </div>
      ) : (
        <ul className="mt-1">
          {rows.map((c) => (
            <Row key={c.id} content={c} jobs={jobsByContent.get(c.id) ?? []} />
          ))}
        </ul>
      )}

      <NewContentDialog
        open={dialogOpen}
        type={type}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
