/* posts —— 内容库：列表（筛选/搜索/排序）、编辑、拖拽排序、媒体上传 */
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getPrisma, resolveDataDir } from "@tassello/db";
import { TYPE_META, type ContentType, type PostDTO, type AssetDTO } from "@tassello/shared";
import { mdToHtml, plainSummary } from "@tassello/render";

export type SortKey = "recent" | "oldest" | "title" | "manual";

function toAssetDTO(a: { id: string; kind: string; path: string; meta: string }): AssetDTO {
  let color: string | null = null;
  try {
    color = (JSON.parse(a.meta) as { color?: string }).color ?? null;
  } catch {}
  return { id: a.id, kind: a.kind, path: a.path, color };
}

export function toPostDTO(
  p: {
    id: string; type: string; title: string; body: string; bodyHtml: string;
    durationSec: number | null; updatedAt: Date; manualOrder: number;
    assets: { id: string; kind: string; path: string; meta: string }[];
  },
): PostDTO {
  const assets = p.assets.map(toAssetDTO);
  const type = p.type as ContentType;
  const color = TYPE_META[type]?.color ?? "#2C6FF0";
  return {
    id: p.id,
    type,
    title: p.title,
    body: p.body,
    bodyHtml: p.bodyHtml || mdToHtml(p.body, color, assets.map((a) => ({ id: a.id, color: a.color }))),
    durationSec: p.durationSec,
    updatedAt: p.updatedAt.toISOString(),
    manualOrder: p.manualOrder,
    assets,
  };
}

export async function listPosts(opts: {
  scope?: ContentType | "all";
  query?: string;
  sort?: SortKey;
}): Promise<PostDTO[]> {
  const prisma = getPrisma();
  const rows = await prisma.post.findMany({
    where: opts.scope && opts.scope !== "all" ? { type: opts.scope } : undefined,
    include: { assets: { orderBy: { order: "asc" } } },
  });
  let posts = rows.map(toPostDTO);
  const q = (opts.query ?? "").trim().toLowerCase();
  if (q) {
    posts = posts.filter((p) =>
      ((p.title + "\n" + p.body).toLowerCase().includes(q) ||
        plainSummary(p.body).toLowerCase().includes(q)),
    );
  }
  const sort = opts.sort ?? "recent";
  posts.sort((a, b) => {
    if (sort === "manual") return a.manualOrder - b.manualOrder;
    if (sort === "title") return a.title.localeCompare(b.title, "zh");
    const ta = Date.parse(a.updatedAt);
    const tb = Date.parse(b.updatedAt);
    return sort === "oldest" ? ta - tb : tb - ta;
  });
  return posts;
}

export async function getPost(id: string): Promise<PostDTO | null> {
  const row = await getPrisma().post.findUnique({
    where: { id },
    include: { assets: { orderBy: { order: "asc" } } },
  });
  return row ? toPostDTO(row) : null;
}

export async function createPost(input: {
  type: ContentType;
  title?: string;
  body?: string;
}): Promise<PostDTO> {
  const prisma = getPrisma();
  const max = await prisma.post.aggregate({ _max: { manualOrder: true } });
  const created = await prisma.post.create({
    data: {
      type: input.type,
      title: input.title ?? "",
      body: input.body ?? "",
      manualOrder: (max._max.manualOrder ?? 0) + 1,
    },
    include: { assets: { orderBy: { order: "asc" } } },
  });
  return toPostDTO(created);
}

export async function updatePost(
  id: string,
  patch: { title?: string; body?: string; bodyHtml?: string; durationSec?: number | null; order?: string[] },
): Promise<PostDTO | null> {
  const prisma = getPrisma();
  if (patch.order) {
    // 拖拽排序：可见稿子按新顺序占回原槽位（原型 reorderPosts 语义）
    const all = await prisma.post.findMany({ orderBy: { manualOrder: "asc" }, select: { id: true } });
    const picked = new Set(patch.order);
    const queue = [...patch.order];
    const byId = new Map(all.map((p) => [p.id, p]));
    const nextOrder = all.map((p) => (picked.has(p.id) ? byId.get(queue.shift()!)! : p));
    await prisma.$transaction(
      nextOrder.map((p, i) => prisma.post.update({ where: { id: p.id }, data: { manualOrder: i } })),
    );
  }
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.body !== undefined) data.body = patch.body;
  if (patch.bodyHtml !== undefined) data.bodyHtml = patch.bodyHtml;
  if (patch.durationSec !== undefined) data.durationSec = patch.durationSec;
  if (Object.keys(data).length) {
    await prisma.post.update({ where: { id }, data });
  }
  return getPost(id);
}

export async function deletePost(id: string): Promise<void> {
  await getPrisma().post.delete({ where: { id } });
}

export async function deleteAsset(postId: string, assetId: string): Promise<void> {
  const prisma = getPrisma();
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  await prisma.asset.deleteMany({ where: { id: assetId, postId } });
  // 移除视频/音频素材时同步清掉稿子时长，避免留下没有文件却有时长的假数据
  if (asset && (asset.kind === "video" || asset.kind === "audio")) {
    await prisma.post.update({ where: { id: postId }, data: { durationSec: null } });
  }
}

export async function reorderAssets(postId: string, ids: string[]): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(
    ids.map((id, i) => prisma.asset.updateMany({ where: { id, postId }, data: { order: i } })),
  );
}

const MEDIA_UPLOAD_EXT: Record<"video" | "audio" | "image", string[]> = {
  video: [".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"],
  audio: [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"],
  image: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg"],
};

/** ffprobe 可用则取时长（秒），不可用/失败返回 null（时长留空，UI 显示 00:00） */
function probeDurationSec(file: string): number | null {
  try {
    const r = spawnSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
      { encoding: "utf8", timeout: 10_000 },
    );
    if (r.status !== 0) return null;
    const sec = Math.round(Number.parseFloat(r.stdout.trim()));
    return Number.isFinite(sec) && sec > 0 ? sec : null;
  } catch {
    return null;
  }
}

/** 上传媒体素材：落盘 data/media/uploads/<postId>/。
 *  video/audio 替换同类型旧素材并尽量回填时长；image 追加到素材条末尾 */
export async function setPostMedia(
  postId: string,
  kind: "video" | "audio" | "image",
  fileName: string,
  bytes: Uint8Array,
): Promise<PostDTO | null> {
  const prisma = getPrisma();
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return null;
  const base = fileName.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_").replace(/^\.+/, "");
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")).toLowerCase() : "";
  if (!(MEDIA_UPLOAD_EXT[kind] ?? []).includes(ext)) {
    throw new Error(`不支持的文件格式：${ext || "无扩展名"}`);
  }
  const dir = path.join(resolveDataDir(), "media", "uploads", postId);
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${Date.now()}_${base}`);
  await fs.writeFile(dest, bytes);
  if (kind === "image") {
    const count = await prisma.asset.count({ where: { postId } });
    await prisma.asset.create({
      data: {
        id: `a${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        postId,
        kind: "image",
        path: dest,
        order: count,
        meta: JSON.stringify({ fileName: base }),
      },
    });
  } else {
    await prisma.asset.deleteMany({ where: { postId, kind } });
    await prisma.asset.create({
      data: {
        id: `a${Date.now()}`,
        postId,
        kind,
        path: dest,
        order: 0,
        meta: JSON.stringify({ fileName: base }),
      },
    });
    const durationSec = probeDurationSec(dest);
    if (durationSec !== null) {
      await prisma.post.update({ where: { id: postId }, data: { durationSec } });
    }
  }
  return getPost(postId);
}

/** 读素材原文件字节（供路由回传缩略图/预览；空路径 = 占位色块，返回 null） */
export async function readAssetFile(assetId: string): Promise<{ bytes: Buffer; ext: string } | null> {
  const asset = await getPrisma().asset.findUnique({ where: { id: assetId } });
  if (!asset || !asset.path) return null;
  try {
    const bytes = await fs.readFile(asset.path);
    return { bytes, ext: asset.path.slice(asset.path.lastIndexOf(".")).toLowerCase() };
  } catch {
    return null;
  }
}
