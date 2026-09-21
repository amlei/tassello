import { reorderAssets } from "@tassello/server";
import type { ApiResult } from "@tassello/shared";
import { ensureBoot, fail, json, readJson } from "../../../_lib";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/posts/:id/assets  body: { order: [assetId] } —— 素材条拖拽换位 */
export async function PATCH(req: Request, ctx: Ctx) {
  ensureBoot();
  const { id } = await ctx.params;
  const body = await readJson<{ order: string[] }>(req);
  if (!Array.isArray(body.order)) return fail("参数不合法");
  await reorderAssets(id, body.order);
  return json<ApiResult<{ ok: boolean }>>({ ok: true, data: { ok: true } });
}
