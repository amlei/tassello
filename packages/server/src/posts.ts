/* posts —— 内容库：列表（筛选/搜索/排序）、编辑、拖拽排序 */
import { getPrisma } from "@tassello/db";
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
      // 原型语义：新建贴图默认带三个占位色块
      ...(input.type === "image"
        ? {
            assets: {
              create: ["#D52088", "#FD8D11", "#2C6FF0"].map((color, i) => ({
                id: `a${Date.now()}_${i}`,
                kind: "image",
                order: i,
                meta: JSON.stringify({ color }),
              })),
            },
          }
        : {}),
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

const PLACEHOLDER_PALETTE = ["#2C6FF0", "#D52088", "#FD8D11", "#0EC3D4", "#07B56F", "#16130E"];

export async function createAsset(postId: string, color?: string): Promise<AssetDTO | null> {
  const prisma = getPrisma();
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return null;
  const count = await prisma.asset.count({ where: { postId } });
  const created = await prisma.asset.create({
    data: {
      id: `a${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      postId,
      kind: "image",
      order: count,
      meta: JSON.stringify({ color: color ?? PLACEHOLDER_PALETTE[count % PLACEHOLDER_PALETTE.length] }),
    },
  });
  return toAssetDTO(created);
}

export async function deleteAsset(postId: string, assetId: string): Promise<void> {
  await getPrisma().asset.deleteMany({ where: { id: assetId, postId } });
}

export async function reorderAssets(postId: string, ids: string[]): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(
    ids.map((id, i) => prisma.asset.updateMany({ where: { id, postId }, data: { order: i } })),
  );
}
