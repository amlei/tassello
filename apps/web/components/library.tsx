/* library —— 工作台主界面：左栏（四类型 + 发布队列）+ 统一卡片网格
   视觉体系：方向 B · 中性工作台（HeroUI 语义 token + 发丝线 + 功能蓝） */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { TYPE_META, type ContentType, type PlatformDTO, type PostDTO, type TaskDTO } from "@tassello/shared";
import { AlertDialog, Button, Dropdown, SearchField, Tooltip } from "@heroui/react";
import { Check as ReiconCheck } from "reicon-react";
import { Check } from "reicon-react";
import { fmtDate, fmtTime } from "./bits";
import { FloatingPill } from "./bits";
import { api } from "./api";
import { Rail } from "./rail";
import { IcPlus, IcSort, IcX } from "./icons";

export const SORTS = [
  { id: "recent", label: "最近更新" },
  { id: "oldest", label: "最早更新" },
  { id: "title", label: "按标题" },
  { id: "manual", label: "自定义顺序" },
] as const;
export type SortKey = (typeof SORTS)[number]["id"];

/* 列表摘要：跳过插图记号和空行，取第一段真正的文字 */
export function plainSummary(body: string): string {
  const lines = (body || "").split("\n").map((s) => s.trim()).filter(Boolean);
  return lines.find((l) => !/^!\[([^\]]*)\]\(asset:\/\/([^)]+)\)$/.test(l)) || "";
}

/* ---------- 主区头部：标题 + 搜索 + 排序 + 新建（scope 恒为某一类型，新建直达） ---------- */
function ViewHead({
  title, meta, query, onQuery, sort, onSort, scope, onNew,
}: {
  title: string;
  meta: string;
  query: string;
  onQuery: (q: string) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  scope: string;
  onNew: (type: string) => void;
}) {
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const cur = SORTS.find((s) => s.id === sort) || SORTS[0];
  const t = TYPE_META[scope as ContentType];

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="flex flex-none flex-wrap items-end gap-4 px-[34px] pb-4 pt-[26px]">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="text-[28px] font-bold leading-[1.35] tracking-[-0.4px]">{title}</h1>
        <span className="whitespace-nowrap font-mono text-[11.5px] tracking-[0.5px] text-ink2">{meta}</span>
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <SearchField
          aria-label="搜索稿子"
          value={query}
          onChange={onQuery}
          className="[&_.heroui-input]:bg-card"
        >
          <SearchField.Group className="w-[210px] rounded-full border border-line bg-card px-3.5 py-2 focus-within:border-accent">
            <SearchField.SearchIcon className="text-ink3" />
            <SearchField.Input
              ref={searchRef}
              placeholder="搜索标题与正文"
              className="text-sm text-ink"
            />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>

        <Dropdown>
          <Button variant="ghost" className="gap-[7px] rounded-full border border-line bg-card px-[15px] py-2 text-[13.5px] font-bold text-ink">
            <IcSort size={13} /> {cur.label}
          </Button>
          <Dropdown.Popover placement="bottom right">
            <Dropdown.Menu
              aria-label="排序方式"
              selectedKeys={[sort]}
              selectionMode="single"
              disallowEmptySelection
              onAction={(k) => onSort(k as SortKey)}
            >
              {SORTS.map((s) => (
                <Dropdown.Item key={s.id} textValue={s.label}>{s.label}</Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>

        <Button
          className="gap-2 whitespace-nowrap rounded-full px-[18px] py-[9px] text-sm font-black text-white"
          style={{ background: t.color }}
          onPress={() => onNew(scope)}
        >
          <IcPlus size={14} /> 新建{t.zh}
        </Button>
      </div>
    </header>
  );
}

/* ---------- 行内动作：删除只负责发起，确认走弹窗（与常规软件一致） ---------- */
function RowActions({ post, onAskDelete, solid }: { post: PostDTO; onAskDelete: (post: PostDTO) => void; solid?: boolean }) {
  const base = solid
    ? "h-[27px] w-[27px] rounded-[9px] bg-white/95 shadow-[0_1px_4px_rgba(15,15,15,0.12)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
    : "h-[30px] w-[30px] rounded-lg bg-card opacity-0 group-hover:opacity-100 focus-visible:opacity-100";
  return (
    <div
      className={solid ? "absolute right-[7px] top-[7px] z-[2] flex gap-1.5" : "flex flex-none items-center gap-1.5"}
      onClick={(e) => e.stopPropagation()}
    >
      <Tooltip delay={200}>
        <Button
          isIconOnly
          aria-label={`删除 ${post.title || "未命名"}`}
          variant="ghost"
          className={base + " border border-line text-ink2 hover:text-ink"}
          onPress={() => onAskDelete(post)}
        >
          <IcX size={11} />
        </Button>
      </Tooltip>
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
    <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2 py-[2px] font-mono text-[10px] font-bold text-green">
      <Check size={9} aria-hidden="true" />
      已发布
    </span>
  );
}

/* 静态布局用内联样式锁定（HeroUI 按钮基础样式会压过工具类），hover 交给 data-attr 类 */
const TILE_CLS =
  "w-full gap-2.5 rounded-[14px] transition-[transform,box-shadow] data-[hovered=true]:-translate-y-1 data-[hovered=true]:shadow-[0_3px_10px_rgba(15,15,15,0.07)]";
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

function TileTitleMeta({ post, extra, published }: { post: PostDTO; extra: string; published?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="line-clamp-2 text-[15px] font-bold leading-[1.35] tracking-[-0.2px] text-ink">{post.title || "未命名稿子"}</span>
      <span className="flex items-center gap-[9px] font-mono text-[10.5px] text-ink2">
        <span>{fmtDate(post.updatedAt)}</span>
        <span>{extra}</span>
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
    <div className="group relative">
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
    <div className="group relative">
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

function ImageTile({
  post, live, published, onOpen, onAskDelete,
}: {
  post: PostDTO;
  live: boolean;
  published: boolean;
  onOpen: (id: string) => void;
  onAskDelete: (post: PostDTO) => void;
}) {
  const imgs = post.assets;
  const cells = [0, 1, 2, 3].map((i) => imgs[i % Math.max(imgs.length, 1)]);
  return (
    <div className="group relative">
      <Button variant="ghost" className={TILE_CLS + " text-left"} style={TILE_STYLE} onPress={() => onOpen(post.id)} aria-label={post.title || "未命名稿子"}>
        <span className="relative block w-full">
          <span className="relative grid aspect-[16/10] grid-cols-2 grid-rows-2 gap-[3px] overflow-hidden rounded-[10px] bg-hover" aria-hidden="true">
            {cells.map((im, i) => (
              <i key={i} className="block" style={{ background: im ? im.color || "#EDECE9" : "#EDECE9" }} />
            ))}
            <span className="absolute bottom-1.5 right-[7px] rounded-full bg-[rgba(55,53,47,0.6)] px-2 py-0.5 font-mono text-[10px] font-bold text-white">{imgs.length} 张</span>
            <CoverLive live={live} />
          </span>
        </span>
        <TileTitleMeta post={post} extra={`${post.body.length} 字`} published={published} />
      </Button>
      <RowActions post={post} onAskDelete={onAskDelete} solid />
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
  return (
    <div className="group relative">
      <Button variant="ghost" className={TILE_CLS + " text-left"} style={TILE_STYLE} onPress={() => onOpen(post.id)} aria-label={post.title || "未命名稿子"}>
        <span className="relative block w-full">
          <span className="relative flex aspect-video items-center justify-center overflow-hidden rounded-[10px] bg-hover" aria-hidden="true">
            <span className="ml-1 h-0 w-0 border-y-[9px] border-l-[14px] border-l-ink border-y-transparent opacity-[.92]" />
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
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("recent");
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

  /* 删除确认：行内 X 只负责发起，确认走弹窗（鼠标移开不再丢状态） */
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

  const list = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return posts.filter((p) => (p.title + " " + p.body).toLowerCase().includes(q));
    return posts;
  }, [posts, query]);

  const sorted = React.useMemo(() => {
    const out = list.slice();
    out.sort((a, b) => {
      if (sort === "manual") return a.manualOrder - b.manualOrder;
      if (sort === "title") return (a.title || "").localeCompare(b.title || "", "zh");
      const d = Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
      return sort === "oldest" ? d : -d;
    });
    return out;
  }, [list, sort]);

  const meta = [
    `${sorted.length} 篇`,
    t.en,
    query.trim() ? `筛选「${query.trim()}」` : null,
  ].filter(Boolean).join(" · ");

  const shown = sorted;

  const renderTile = (p: PostDTO) => {
    const live = runningIds.includes(p.id);
    const published = publishedIds.has(p.id);
    if (p.type === "video") return <VideoTile key={p.id} post={p} live={live} published={published} onOpen={openPost} onAskDelete={onAskDelete} />;
    if (p.type === "image") return <ImageTile key={p.id} post={p} live={live} published={published} onOpen={openPost} onAskDelete={onAskDelete} />;
    if (p.type === "audio") return <AudioTile key={p.id} post={p} live={live} published={published} onOpen={openPost} onAskDelete={onAskDelete} />;
    return <ArticleTile key={p.id} post={p} live={live} published={published} onOpen={openPost} onAskDelete={onAskDelete} />;
  };

  return (
    <div className="flex h-screen min-h-0 overflow-hidden" data-screen-label={`内容库 · ${t.zh}`}>
      <Rail active={type} counts={counts} runningCount={runningCount} queueCount={tasks.length} platforms={platforms} />
      <div className="mx-auto flex w-full max-w-[1560px] min-h-0 flex-1 flex-col">
        <ViewHead
          title={t.zh}
          meta={meta}
          query={query}
          onQuery={setQuery}
          sort={sort}
          onSort={setSort}
          scope={type}
          onNew={(newType) => void newPost(newType)}
        />
        <div className="scroll-thin min-h-0 flex-1 overflow-auto px-[34px] pb-[120px]">
          {sorted.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-ink3 p-11 text-center font-mono text-[13px] text-ink2">
              {query.trim() ? `没有匹配「${query.trim()}」的稿子 — 换个词，或清空搜索` : "这里还没有内容 — 点右上角新建一篇"}
            </div>
          )}
          <div className="relative grid grid-cols-[repeat(auto-fill,minmax(212px,1fr))] gap-3.5">
            {shown.map(renderTile)}
          </div>
        </div>
      </div>

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
                <Button variant="ghost" className="rounded-full px-4 py-2 text-[13.5px] font-bold text-ink2 hover:text-ink" onPress={() => setDeleteTarget(null)}>
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
    </div>
  );
}
