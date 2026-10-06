/* library —— 工作台主界面：左栏（四类型 + 发布队列）+ 统一卡片网格
   视觉体系：方向 B · 中性工作台（HeroUI 语义 token + 发丝线 + 功能蓝） */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { TYPE_META, type ContentType, type PlatformDTO, type PostDTO, type TaskDTO } from "@tassello/shared";
import { AlertDialog, Button } from "@heroui/react";
import { fmtDate, fmtTime } from "./bits";
import { FloatingPill } from "./bits";
import { api } from "./api";
import { WorkspaceShell } from "./workspace-shell";
import { useLongPressReorder } from "./dnd";
import { Check, X } from "reicon-react";

/* 列表摘要：跳过插图记号和空行，取第一段真正的文字 */
export function plainSummary(body: string): string {
  const lines = (body || "").split("\n").map((s) => s.trim()).filter(Boolean);
  return lines.find((l) => !/^!\[([^\]]*)\]\(asset:\/\/([^)]+)\)$/.test(l)) || "";
}

/* ---------- 行内动作：删除只负责发起，确认走弹窗（原型 RowActions 同构） ---------- */
function RowActions({ post, onAskDelete, solid }: { post: PostDTO; onAskDelete: (post: PostDTO) => void; solid?: boolean }) {
  return (
    <div
      className={
        "w-tileacts flex gap-1.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 " +
        (solid ? "absolute right-[19px] top-[19px] z-[2]" : "relative flex-none items-center")
      }
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        isIconOnly
        variant="ghost"
        className={
          "min-w-0 flex items-center justify-center border border-line text-ink2 transition-colors " +
          (solid
            ? "h-[27px] w-[27px] rounded-[9px] media-x bg-white/95 shadow-[0_1px_4px_rgba(15,15,15,0.12)] data-[hovered=true]:bg-hover data-[hovered=true]:text-ink"
            : "h-[30px] w-[30px] rounded-lg media-x bg-card data-[hovered=true]:bg-hover data-[hovered=true]:text-ink")
        }
        aria-label={`删除 ${post.title || "未命名"}`}
        onPress={() => onAskDelete(post)}
      >
        <X size={11} strokeWidth={4} />
      </Button>
    </div>
  );
}

/* ---------- 卡片：四种类型共用一个卡片壳，封面各自长脸；封面左下角可挂「发布中」 ---------- */
function CoverLive({ live }: { live: boolean }) {
  if (!live) return null;
  return (
    <span className="absolute bottom-1.5 left-[7px] z-[1] inline-flex items-center gap-1.5 rounded-full bg-accent px-2 py-[2.5px] font-mono text-[10px] font-bold text-white">
      <i className="block h-1.5 w-1.5 rounded-[2px] bg-white animate-pulse-live" />发布中
    </span>
  );
}

/* 已发布贴纸：标题行的小徽标，提示这篇发出去过，防止重复发布 */
function PublishedBadge({ published }: { published: boolean }) {
  if (!published) return null;
  return (
    <span className="inline-flex h-[16px] items-center gap-1 rounded-full bg-green/10 px-2 font-mono text-[10px] font-bold leading-none text-green">
      <Check size={9} strokeWidth={4} aria-hidden="true" />
      已发布
    </span>
  );
}

/* 静态布局用内联样式锁定（HeroUI 按钮基础样式会压过工具类），hover 交给 data-attr 类。
   whitespace-normal：HeroUI 按钮自带 nowrap，不放开换行的话摘要/标题的 line-clamp 全部失效 */
const TILE_CLS = "w-full gap-2.5 whitespace-normal break-words rounded-[14px]";
/* 悬浮起浮作用在整卡（原型 .w-tile:hover）—— 行内删除钮跟着卡片一起动，不会钉死在原地 */
const TILE_HOVER =
  "rounded-[14px] transition-[translate,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_3px_10px_rgba(15,15,15,0.07)]";
const TILE_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  justifyContent: "flex-start",
  height: "auto",
  padding: "12px",
  background: "var(--color-card)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--color-line)",
};

function TileTitleMeta({ post, extra, published }: { post: PostDTO; extra?: string; published?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="line-clamp-2 min-h-[2.7em] text-[15px] font-bold leading-[1.35] tracking-[-0.2px] text-ink">{post.title || "未命名稿子"}</span>
      <span className="flex h-[16px] items-center gap-[9px] font-mono text-[10.5px] leading-none text-ink2">
        <span>{fmtDate(post.updatedAt)}</span>
        {extra ? <span>{extra}</span> : null}
        <PublishedBadge published={!!published} />
      </span>
    </span>
  );
}

function ArticleTile({
  post, live, published, onOpen, onAskDelete,
}: {
  post: PostDTO;
  live: boolean;
  published: boolean;
  onOpen: (id: string) => void;
  onAskDelete: (post: PostDTO) => void;
}) {
  const t = TYPE_META[post.type];
  const excerpt = plainSummary(post.body);
  return (
    <div className={"group relative " + TILE_HOVER}>
      <Button variant="ghost" className={TILE_CLS + " text-left"} style={TILE_STYLE} onPress={() => onOpen(post.id)} aria-label={post.title || "未命名稿子"}>
        <span className="relative block w-full">
          <span className="relative block aspect-[16/10] overflow-hidden rounded-[10px] bg-hover">
            <span className={"m-0 overflow-hidden px-3.5 pb-5 pt-[13px] text-[12.5px] leading-[1.62] line-clamp-3 text-left " + (excerpt ? "text-ink2" : "text-ink3")} style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3 }}>{excerpt || "还没写内容"}</span>
            <CoverLive live={live} />
          </span>
        </span>
        <TileTitleMeta post={post} extra={`${post.body.length} 字`} published={published} />
      </Button>
      <RowActions post={post} onAskDelete={onAskDelete} solid />
    </div>
  );
}

function AudioTile({
  post, live, published, onOpen, onAskDelete,
}: {
  post: PostDTO;
  live: boolean;
  published: boolean;
  onOpen: (id: string) => void;
  onAskDelete: (post: PostDTO) => void;
}) {
  const excerpt = plainSummary(post.body);
  return (
    <div className={"group relative " + TILE_HOVER}>
      <Button variant="ghost" className={TILE_CLS + " text-left"} style={TILE_STYLE} onPress={() => onOpen(post.id)} aria-label={post.title || "未命名稿子"}>
        <span className="relative block w-full">
          <span className="relative block aspect-[16/10] overflow-hidden rounded-[10px] bg-hover">
            <span className={"m-0 overflow-hidden px-3.5 pb-10 pt-[13px] text-[12.5px] leading-[1.62] line-clamp-3 " + (excerpt ? "text-ink2" : "text-ink3")} style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3 }}>{excerpt || "还没写内容"}</span>
            <span className="absolute bottom-[9px] left-[9px] h-0 w-0 border-y-[7px] border-l-[11px] border-l-cyan border-y-transparent opacity-95" aria-hidden="true" />
            <span className="absolute bottom-[7px] right-2 font-mono text-[10px] text-ink2">{post.durationSec ? fmtTime(post.durationSec) : "00:00"}</span>
            <CoverLive live={live} />
          </span>
        </span>
        <TileTitleMeta post={post} extra={post.durationSec ? fmtTime(post.durationSec) : "00:00"} published={published} />
      </Button>
      <RowActions post={post} onAskDelete={onAskDelete} solid />
    </div>
  );
}

type TileDnd = ReturnType<typeof useLongPressReorder> | null;

/* 贴图卡：2×2 拼贴封面；自定义顺序档下长按可拖拽排序（其余格 FLIP 让位） */
function ImageTile({
  post, live, published, onOpen, onAskDelete, dnd,
}: {
  post: PostDTO;
  live: boolean;
  published: boolean;
  onOpen: (id: string) => void;
  onAskDelete: (post: PostDTO) => void;
  dnd?: TileDnd;
}) {
  const imgs = post.assets;
  const n = imgs.length;
  const shown: (typeof imgs)[number][] | undefined[] = n === 0 ? [undefined, undefined, undefined, undefined] : imgs.slice(0, 4);
  const span = (i: number) => (n === 1 ? "col-span-2 row-span-2" : n === 2 ? "row-span-2" : n === 3 && i === 0 ? "col-span-2" : "");
  const dragging = !!dnd && dnd.dragId === post.id;
  return (
    <div
      className={
        "group relative " + TILE_HOVER +
        (dnd?.pressing === post.id ? " scale-[.975]" : "") +
        (dragging ? " z-[12] [transition:none] cursor-grabbing shadow-[0_14px_40px_rgba(15,15,15,0.2)] rounded-[14px]" : "")
      }
      ref={dnd ? (el) => { dnd.register(post.id, el); } : undefined}
      onPointerDown={dnd ? (e) => dnd.onTilePointerDown(e, post.id) : undefined}
    >
      <Button
        variant="ghost"
        className={TILE_CLS + " text-left"}
        style={TILE_STYLE}
        onPress={() => { if (dnd && dnd.shouldSuppressClick()) return; onOpen(post.id); }}
        aria-label={(post.title || "未命名稿子") + (dnd ? "，长按可拖动排序" : "")}
      >
        <span className="relative block w-full">
        <span className="relative grid aspect-[16/10] grid-cols-2 grid-rows-2 gap-[3px] overflow-hidden rounded-[10px] bg-hover" aria-hidden="true">
          {shown.map((im, i) => (
            <span key={im?.id ?? i} className={"relative block " + span(i)} style={{ background: im ? (im.path ? "#4A4740" : im.color || "var(--onda-hover)") : "#EDECE9" }}>
              {im?.path && (
                // eslint-disable-next-line @next/next/no-img-element -- 本地 API 字节流缩略图
                <img src={`/api/assets/${im.id}/raw`} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
              )}
            </span>
          ))}
          <CoverLive live={live} />
        </span>
        </span>
        <TileTitleMeta post={post} extra={`${post.body.length} 字`} published={published} />
      </Button>
      {!dragging && <RowActions post={post} onAskDelete={onAskDelete} solid />}
    </div>
  );
}

function VideoTile({
  post, live, published, onOpen, onAskDelete,
}: {
  post: PostDTO;
  live: boolean;
  published: boolean;
  onOpen: (id: string) => void;
  onAskDelete: (post: PostDTO) => void;
}) {
  const video = post.assets.find((asset) => asset.kind === "video" && asset.path);
  const [previewRatio, setPreviewRatio] = React.useState<number | null>(null);
  const [videoDuration, setVideoDuration] = React.useState(post.durationSec ?? 0);
  const previewRatioRef = React.useRef<number>(0);
  const previewVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const duration = post.durationSec || videoDuration;

  const seekPreview = (ratio: number) => {
    const clamped = Math.min(1, Math.max(0, ratio));
    previewRatioRef.current = clamped;
    setPreviewRatio(clamped);
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = clamped * duration;
    }
  };

  const resetPreview = () => {
    previewRatioRef.current = 0;
    setPreviewRatio(null);
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = 0.001;
    }
  };

  const seekFromPointer = (event: React.MouseEvent<HTMLElement>) => {
    if (!video || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    seekPreview((event.clientX - rect.left) / rect.width);
  };

  return (
    <div className={"group relative " + TILE_HOVER}>
      <Button variant="ghost" className={TILE_CLS + " text-left"} style={TILE_STYLE} onPress={() => onOpen(post.id)} aria-label={post.title || "未命名稿子"}>
        <span className="relative block w-full">
          <span
            className="relative flex aspect-video items-center justify-center overflow-hidden rounded-[14px] bg-hover"
            onMouseEnter={() => video && seekPreview(previewRatioRef.current)}
            onMouseMove={seekFromPointer}
            onMouseLeave={resetPreview}
          >
            {video && (
              <video
                ref={previewVideoRef}
                src={`/api/assets/${video.id}/raw`}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
                onLoadedData={(event) => {
                  if (previewRatioRef.current === 0) {
                    event.currentTarget.currentTime = 0.001;
                  }
                }}
                onLoadedMetadata={(event) => {
                  setVideoDuration(event.currentTarget.duration || duration);
                  const ratio = previewRatioRef.current;
                  if (ratio > 0) {
                    event.currentTarget.currentTime = ratio * (event.currentTarget.duration || duration);
                  }
                }}
              />
            )}

            {previewRatio != null ? (
              <span className="absolute inset-x-0 bottom-0">
                <span className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-full bg-black/25" aria-hidden="true">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-error"
                    style={{ width: `${Math.round(previewRatio * 100)}%` }}
                  />
                </span>
                <span className="absolute bottom-[7px] right-2 rounded-[4px] bg-black/72 px-[5px] py-[1px] font-mono text-[10px] text-white">
                  {fmtTime(Math.floor((previewRatio || 0) * duration))}
                </span>
              </span>
            ) : (
              <span className="absolute bottom-[7px] right-2 font-mono text-[10px] text-ink2">
                {duration ? fmtTime(duration) : "00:00"}
              </span>
            )}
            <CoverLive live={live} />
          </span>
        </span>
        {/* 时长只出现在封面上，不重复（原型 VideoTile 同款） */}
        <TileTitleMeta post={post} published={published} />
      </Button>
      <RowActions post={post} onAskDelete={onAskDelete} solid />
    </div>
  );
}

/* ---------- 主视图：四种类型全部以卡片呈现 ---------- */
export function LibraryScreen({
  type, posts: initialPosts, counts, platforms, initialTasks,
}: {
  type: string;
  posts: PostDTO[];
  counts: Record<string, number>;
  platforms: PlatformDTO[];
  initialTasks: TaskDTO[];
}) {
  const router = useRouter();
  const [posts, setPosts] = React.useState(initialPosts);
  const [sort, setSort] = React.useState<"recent" | "manual">("recent");
  const [tasks, setTasks] = React.useState(initialTasks);
  /* 轮询任务：仅取轻量任务列表，驱动「发布中 / 已发布」徽标与浮动条 */
  React.useEffect(() => {
    const timer = setInterval(() => { void api.listTasks().then(setTasks).catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  }, []);

  const t = TYPE_META[type as ContentType];
  const runningIds = React.useMemo(
    () => Array.from(new Set(tasks.filter((x) => x.status === "running").map((x) => x.postId))),
    [tasks],
  );
  const publishedIds = React.useMemo(
    () => new Set(tasks.filter((x) => x.status === "success").map((x) => x.postId)),
    [tasks],
  );
  const runningCount = tasks.filter((x) => x.status === "running").length;
  const avgProgress = runningCount
    ? Math.round(tasks.filter((x) => x.status === "running").reduce((sum, x) => sum + x.progress, 0) / runningCount)
    : 0;
  /* 侧栏数字以内容项为准：一篇稿子发到多个平台仍算一项 */
  const activeRunningCount = new Set(
    tasks
      .filter((x) => x.status === "running" && !(x.stage === 3 && x.progress >= 100))
      .map((x) => x.postId),
  ).size;
  const queueItemCount = new Set(tasks.map((x) => x.postId)).size;

  /* 删除确认：行内 × 只负责发起，确认走弹窗（Esc / 点背景取消） */
  const [deleteTarget, setDeleteTarget] = React.useState<PostDTO | null>(null);
  const onAskDelete = (post: PostDTO) => setDeleteTarget(post);

  const openPost = (id: string) => router.push(`/editor/${id}`);
  const deletePost = async (id: string) => {
    setPosts((ps) => ps.filter((p) => p.id !== id));
    await api.deletePost(id);
    router.refresh();
  };
  const newPost = async (newType: string) => {
    const post = await api.createPost(newType);
    router.push(`/editor/${post.id}`);
  };

  const sorted = React.useMemo(() => {
    const out = posts.slice();
    out.sort((a, b) => {
      if (sort === "manual") return a.manualOrder - b.manualOrder;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
    return out;
  }, [posts, sort]);

  /* 长按拖动排序只开在贴图上：其它类型的顺序由时间决定，手动排没有意义。
     搜索中、或按标题排的时候也先关掉 —— 那时顺序不是用户排的。 */
  const orderable = type === "image" && sort !== "manual";
  const dnd = useLongPressReorder({
    ids: orderable ? sorted.map((p) => p.id) : [],
    onCommit: (ids) => {
      /* 排序档切到「自定义顺序」，否则下一次排序会把顺序抹掉；
         本类型内 manualOrder 按新数组顺序重排（与服务端占槽语义一致），随后落库 */
      setSort("manual");
      setPosts((ps) => {
        const ordered = ps.slice().sort((a, b) => a.manualOrder - b.manualOrder);
        const picked = new Set(ids);
        const byId = new Map(ordered.map((p) => [p.id, p]));
        const queue = ids.slice();
        const next = ordered.map((p) => (picked.has(p.id) ? byId.get(queue.shift()!)! : p));
        return next.map((p, i) => ({ ...p, manualOrder: i }));
      });
      void api.updatePost(ids[0]!, { order: ids }).catch(() => {});
    },
  });
  /* 拖拽预演：预览顺序按 id 回填，其余格实时让位（FLIP 在 dnd 内做） */
  const shown = (() => {
    if (!orderable || !dnd.order) return sorted;
    const byId = new Map(sorted.map((p) => [p.id, p]));
    const reordered = dnd.order.map((id) => byId.get(id)).filter(Boolean) as PostDTO[];
    return reordered.length === sorted.length ? reordered : sorted;
  })();

  const renderTile = (p: PostDTO) => {
    const live = runningIds.includes(p.id);
    const published = publishedIds.has(p.id);
    if (p.type === "video") return <VideoTile key={p.id} post={p} live={live} published={published} onOpen={openPost} onAskDelete={onAskDelete} />;
    if (p.type === "image") return <ImageTile key={p.id} post={p} live={live} published={published} onOpen={openPost} onAskDelete={onAskDelete} dnd={orderable ? dnd : undefined} />;
    if (p.type === "audio") return <AudioTile key={p.id} post={p} live={live} published={published} onOpen={openPost} onAskDelete={onAskDelete} />;
    return <ArticleTile key={p.id} post={p} live={live} published={published} onOpen={openPost} onAskDelete={onAskDelete} />;
  };

  return (
    <WorkspaceShell
      active={type}
      counts={counts}
      runningCount={activeRunningCount}
      queueCount={queueItemCount}
      platforms={platforms}
      newScope={type as ContentType}
      onNew={(newType) => void newPost(newType)}
      screenLabel={`内容库 · ${t.zh}`}
      context={{ title: t.zh }}
    >
      <div className="mx-auto flex w-full max-w-[1560px] min-h-0 flex-1 flex-col">
        <div className="scroll-thin min-h-0 flex-1 overflow-auto px-[34px] pt-3 pb-[120px]">
          {sorted.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-ink3 p-11 text-center font-mono text-[13px] text-ink2">
              这里还没有内容 — 用顶部按钮新建一篇
            </div>
          )}
          <div className={"relative grid grid-cols-[repeat(auto-fill,minmax(212px,1fr))] gap-3.5" + (dnd.dragId ? " cursor-grabbing" : "")} ref={orderable ? dnd.gridRef : undefined}>
            {shown.map(renderTile)}
          </div>
        </div>
      </div>

      {/* 删除确认：Esc / 点背景取消（AlertDialog 原生处理） */}
      <AlertDialog>
        <AlertDialog.Backdrop isOpen={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="max-w-[420px] rounded-[20px] bg-paper p-6 shadow-[0_14px_40px_rgba(15,15,15,0.14)]" role="alertdialog" aria-label="删除稿子">
              <AlertDialog.Header className="flex items-start gap-3">
                <AlertDialog.Heading className="text-[17px] font-bold tracking-[-0.2px]">删除这篇稿子？</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className="mt-1.5 text-sm leading-relaxed text-ink2">
                「{deleteTarget?.title || "未命名"}」将被删除，此操作不可撤销。
              </AlertDialog.Body>
              <AlertDialog.Footer className="mt-5 flex items-center justify-end gap-3">
                <Button variant="ghost" className="rounded-full border-2 border-line bg-transparent px-4 py-2 text-[13.5px] font-bold text-ink2 data-[hovered=true]:bg-ink data-[hovered=true]:text-paper" onPress={() => setDeleteTarget(null)}>
                  取消
                </Button>
                <Button
                  className="rounded-full bg-error px-6 py-2.5 text-sm font-bold text-white data-[hovered=true]:brightness-105"
                  onPress={() => { const target = deleteTarget; setDeleteTarget(null); if (target) void deletePost(target.id); }}
                >
                  删除
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      <FloatingPill running={runningCount} avg={avgProgress} onClick={() => router.push("/queue")} />
    </WorkspaceShell>
  );
}
