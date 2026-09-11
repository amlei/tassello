"use client";

// 稿件编辑页：左侧编辑区按类型渲染不同形态，右侧发布面板。
// 五种类型共享「标题 + 内容描述」骨架，但编辑形态必须明显不同——
// 长文是写作，短文是速记，贴图是编排，视频/音频是素材 + 元信息。
// 窄屏下双栏收为单栏。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Plus, Trash, X } from "reicon-react";
import type { AssetPlaceholder, Content } from "@/lib/types";
import { contentTypeMeta } from "@/lib/content-types";
import { useApp } from "@/lib/store";
import { formatDateTime } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import { FormatMark } from "./FormatMark";
import { PublishPanel } from "./PublishPanel";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-xs text-ink-600">
        <span>{label}</span>
        {hint && <span className="font-mono text-[11px] text-ink-300">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Count({ value, limit }: { value: string; limit?: number }) {
  const over = limit !== undefined && value.length > limit;
  return (
    <span className={`font-mono text-[11px] ${over ? "text-destructive" : "text-ink-300"}`}>
      {value.length}
      {limit !== undefined ? ` / ${limit}` : " 字"}
    </span>
  );
}

function TagsEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const t = draft.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="flex items-center gap-1 rounded-full border border-rule bg-surface px-2 py-0.5 text-xs text-ink-600"
          >
            {t}
            <button
              type="button"
              aria-label={`移除标签 ${t}`}
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="text-ink-300 transition-colors hover:text-ink"
            >
              <X size={11} color="currentColor" />
            </button>
          </span>
        ))}
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder={tags.length === 0 ? "输入标签，回车添加" : ""}
          className="h-7 w-40 border-transparent px-1 text-xs focus-visible:border-input"
        />
      </div>
    </div>
  );
}

// —— 素材占位区 ——
// 不做真实上传：素材是占位卡，可添加、可删除，显示序号与尺寸/时长占位文案，
// 传达「以后这里会放真实文件」。

const ASSET_KIND_LABEL: Record<AssetPlaceholder["kind"], string> = {
  image: "图片",
  cover: "封面",
  video: "视频",
  audio: "音频",
};

const ASSET_KIND_NOTE: Record<AssetPlaceholder["kind"], string> = {
  image: "3000 × 2000 · 占位素材",
  cover: "1280 × 720 · 占位封面",
  video: "16:9 · 占位视频素材",
  audio: "占位音频素材",
};

const ASSET_KIND_MEDIA_TYPE: Record<AssetPlaceholder["kind"], string> = {
  image: "image/placeholder",
  cover: "image/placeholder",
  video: "video/placeholder",
  audio: "audio/placeholder",
};

function AssetSection({
  title,
  kind,
  assets,
  onAdd,
  onRemove,
}: {
  title: string;
  kind: AssetPlaceholder["kind"];
  assets: AssetPlaceholder[];
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h3 className="text-xs text-ink-600">{title}</h3>
        <span className="font-mono text-[11px] text-ink-300">
          {assets.length} 个占位
        </span>
      </div>
      {assets.length > 0 && (
        <Attachments variant="list" className="mb-2">
          {assets.map((a, i) => (
            <Attachment
              key={a.id}
              data={{
                id: a.id,
                type: "file",
                mediaType: ASSET_KIND_MEDIA_TYPE[a.kind],
                filename: `${ASSET_KIND_LABEL[a.kind]} ${i + 1}`,
                url: "",
              }}
              onRemove={() => onRemove(a.id)}
            >
              <AttachmentPreview />
              <AttachmentInfo />
              <span className="shrink-0 font-mono text-[11px] text-ink-300">
                {a.note}
              </span>
              <AttachmentRemove label={`移除${ASSET_KIND_LABEL[a.kind]} ${i + 1}`} />
            </Attachment>
          ))}
        </Attachments>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-dashed border-rule px-3 py-2 text-xs text-ink-600 transition-colors hover:border-ink-300 hover:bg-surface"
      >
        <Plus size={13} color="currentColor" />
        添加{ASSET_KIND_LABEL[kind]}（占位）
      </button>
    </section>
  );
}

// —— 五种编辑形态 ——

function LongformEditor({
  content,
  patch,
}: {
  content: Content;
  patch: (p: Partial<Content>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="标题（必填）" hint="微信公众号 ≤64 · 微博 ≤32">
        <Input
          value={content.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="文章标题"
          className="font-serif text-lg"
        />
      </Field>
      <Field label="摘要" hint="微博发布时作为导语，≤44">
        <Textarea
          value={content.summary}
          onChange={(e) => patch({ summary: e.target.value })}
          placeholder="一两句话说清这篇讲什么"
          className="min-h-16 max-w-[34em]"
        />
        <div className="mt-1 text-right">
          <Count value={content.summary} />
        </div>
      </Field>
      <Field label="正文（Markdown）">
        <Textarea
          value={content.body}
          onChange={(e) => patch({ body: e.target.value })}
          placeholder="从这里开始写。支持 Markdown。"
          className="manuscript-grid min-h-[420px] max-w-[34em] px-4 py-3 text-[15px] leading-[1.75]"
        />
        <div className="mt-1 text-right">
          <Count value={content.body} />
        </div>
      </Field>
      <Field label="标签">
        <TagsEditor tags={content.tags} onChange={(tags) => patch({ tags })} />
      </Field>
    </div>
  );
}

function ShortformEditor({
  content,
  patch,
}: {
  content: Content;
  patch: (p: Partial<Content>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="标题（选填）">
        <Input
          value={content.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="可留空"
        />
      </Field>
      <Field label="正文" hint="X ≤280 字符">
        <Textarea
          value={content.body}
          onChange={(e) => patch({ body: e.target.value })}
          placeholder="速记一条，写完就走。"
          className="min-h-40 max-w-[34em] text-[15px] leading-[1.75]"
        />
        <div className="mt-1 text-right">
          <Count value={content.body} limit={280} />
        </div>
      </Field>
      <Field label="标签">
        <TagsEditor tags={content.tags} onChange={(tags) => patch({ tags })} />
      </Field>
    </div>
  );
}

function GalleryEditor({
  content,
  patch,
}: {
  content: Content;
  patch: (p: Partial<Content>) => void;
}) {
  const images = content.assets.filter((a) => a.kind === "image");
  return (
    <div className="flex flex-col gap-5">
      <Field label="标题（必填）" hint="微信公众号 / 小红书 ≤20">
        <Input
          value={content.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="这组图叫什么"
        />
      </Field>
      <Field label="一句话描述" hint="≤1000">
        <Textarea
          value={content.body}
          onChange={(e) => patch({ body: e.target.value })}
          placeholder="一句话说清这组图。"
          className="min-h-20 max-w-[34em] text-[15px] leading-[1.75]"
        />
        <div className="mt-1 text-right">
          <Count value={content.body} limit={1000} />
        </div>
      </Field>
      <AssetSection
        title="图片素材"
        kind="image"
        assets={images}
        onAdd={() =>
          patch({
            assets: [
              ...content.assets,
              { id: newId(), kind: "image", note: ASSET_KIND_NOTE.image },
            ],
          })
        }
        onRemove={(id) =>
          patch({ assets: content.assets.filter((a) => a.id !== id) })
        }
      />
      <Field label="标签">
        <TagsEditor tags={content.tags} onChange={(tags) => patch({ tags })} />
      </Field>
    </div>
  );
}

function VideoEditor({
  content,
  patch,
}: {
  content: Content;
  patch: (p: Partial<Content>) => void;
}) {
  const videos = content.assets.filter((a) => a.kind === "video");
  const covers = content.assets.filter((a) => a.kind === "cover");
  return (
    <div className="flex flex-col gap-5">
      <Field label="标题（必填）">
        <Input
          value={content.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="视频标题"
        />
      </Field>
      <Field label="简介">
        <Textarea
          value={content.body}
          onChange={(e) => patch({ body: e.target.value })}
          placeholder="这段视频讲了什么。"
          className="min-h-24 max-w-[34em] text-[15px] leading-[1.75]"
        />
        <div className="mt-1 text-right">
          <Count value={content.body} />
        </div>
      </Field>
      <AssetSection
        title="视频素材"
        kind="video"
        assets={videos}
        onAdd={() =>
          patch({
            assets: [
              ...content.assets,
              { id: newId(), kind: "video", note: ASSET_KIND_NOTE.video },
            ],
          })
        }
        onRemove={(id) =>
          patch({ assets: content.assets.filter((a) => a.id !== id) })
        }
      />
      <AssetSection
        title="封面"
        kind="cover"
        assets={covers}
        onAdd={() =>
          patch({
            assets: [
              ...content.assets,
              { id: newId(), kind: "cover", note: ASSET_KIND_NOTE.cover },
            ],
          })
        }
        onRemove={(id) =>
          patch({ assets: content.assets.filter((a) => a.id !== id) })
        }
      />
      <Field label="标签">
        <TagsEditor tags={content.tags} onChange={(tags) => patch({ tags })} />
      </Field>
    </div>
  );
}

function AudioEditor({
  content,
  patch,
}: {
  content: Content;
  patch: (p: Partial<Content>) => void;
}) {
  const audios = content.assets.filter((a) => a.kind === "audio");
  return (
    <div className="flex flex-col gap-5">
      <Field label="标题（必填）">
        <Input
          value={content.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="音频标题"
        />
      </Field>
      <Field label="简介">
        <Textarea
          value={content.body}
          onChange={(e) => patch({ body: e.target.value })}
          placeholder="这一期讲了什么。"
          className="min-h-24 max-w-[34em] text-[15px] leading-[1.75]"
        />
        <div className="mt-1 text-right">
          <Count value={content.body} />
        </div>
      </Field>
      <AssetSection
        title="音频素材"
        kind="audio"
        assets={audios}
        onAdd={() =>
          patch({
            assets: [
              ...content.assets,
              { id: newId(), kind: "audio", note: ASSET_KIND_NOTE.audio },
            ],
          })
        }
        onRemove={(id) =>
          patch({ assets: content.assets.filter((a) => a.id !== id) })
        }
      />
      <Field label="时长" hint="如 12:30">
        <Input
          value={content.duration}
          onChange={(e) => patch({ duration: e.target.value })}
          placeholder="12:30"
          className="w-32 font-mono"
        />
      </Field>
      <Field label="标签">
        <TagsEditor tags={content.tags} onChange={(tags) => patch({ tags })} />
      </Field>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 px-4 py-24 text-center">
      <p className="font-serif text-lg">找不到这篇稿子。</p>
      <p className="text-sm text-ink-600">
        它可能已被删除。回到发布页看看现有的稿子。
      </p>
      <Link
        href="/"
        className="mt-2 rounded-[6px] bg-ink px-4 py-2 text-sm text-surface transition-colors hover:bg-ink-600"
      >
        回到发布页
      </Link>
    </div>
  );
}

export function Editor({ contentId }: { contentId: string }) {
  const router = useRouter();
  const { state, updateContent, deleteContent } = useApp();

  if (!state.hydrated) return null;

  const content = state.contents.find((c) => c.id === contentId);
  if (!content) return <NotFound />;

  const meta = contentTypeMeta(content.type);
  const patch = (p: Partial<Content>) => updateContent(content.id, p);
  const listHref =
    content.type === "longform" ? "/" : `/?type=${content.type}`;

  const handleDelete = () => {
    deleteContent(content.id);
    router.push(listHref);
  };

  return (
    <div>
      <div className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href={listHref}
            className="flex items-center gap-1 text-sm text-ink-600 transition-colors hover:text-ink"
          >
            <ArrowLeft size={14} color="currentColor" />
            返回
          </Link>
          <span className="text-ink-300" aria-hidden>
            /
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <FormatMark type={content.type} size={16} />
            <span className="truncate font-serif text-[15px]">
              {content.title || `未命名${meta.name}`}
            </span>
          </span>
          <span className="ml-auto hidden font-mono text-[11px] text-ink-300 sm:block">
            更新于 {formatDateTime(content.updatedAt)}
          </span>
          <button
            type="button"
            onClick={handleDelete}
            aria-label="删除这篇稿子"
            className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-xs text-ink-300 transition-colors hover:text-destructive"
          >
            <Trash size={13} color="currentColor" />
            删除
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          {content.type === "longform" && (
            <LongformEditor content={content} patch={patch} />
          )}
          {content.type === "shortform" && (
            <ShortformEditor content={content} patch={patch} />
          )}
          {content.type === "gallery" && (
            <GalleryEditor content={content} patch={patch} />
          )}
          {content.type === "video" && (
            <VideoEditor content={content} patch={patch} />
          )}
          {content.type === "audio" && (
            <AudioEditor content={content} patch={patch} />
          )}
          {/* 「活动」字段本期不实现：将来按平台在发布面板内处理 */}
        </div>
        <PublishPanel content={content} />
      </div>
    </div>
  );
}
