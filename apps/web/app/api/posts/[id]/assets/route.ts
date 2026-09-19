import { createAsset, reorderAssets } from "@tassello/server";
import type { ApiResult, AssetDTO } from "@tassello/shared";
import { ensureBoot, fail, json, readJson } from "../../../_lib";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/posts/:id/assets  body: { color? } —— 新建占位素材 */
export async function POST(req: Request, ctx: Ctx) {
  ensureBoot();
  const { id } = await ctx.params;
  const body = await readJson<{ color?: string }>(req).catch(() => ({}) as { color?: string });
  const asset = await createAsset(id, body.color);
  if (!asset) return fail("稿子不存在", 404);
  return json<ApiResult<AssetDTO>>({ ok: true, data: asset });
}

/** PATCH /api/posts/:id/assets  body: { order: [assetId] } —— 拖拽换位 */
export async function PATCH(req: Request, ctx: Ctx) {
  ensureBoot();
  const { id } = await ctx.params;
  const body = await readJson<{ order: string[] }>(req);
  if (!Array.isArray(body.order)) return fail("参数不合法");
  await reorderAssets(id, body.order);
  return json<ApiResult<{ ok: boolean }>>({ ok: true, data: { ok: true } });
}
