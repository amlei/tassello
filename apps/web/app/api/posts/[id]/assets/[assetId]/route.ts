import { deleteAsset } from "@tassello/server";
import { ensureBoot, json } from "../../../../_lib";

type Ctx = { params: Promise<{ id: string; assetId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  ensureBoot();
  const { id, assetId } = await ctx.params;
  await deleteAsset(id, assetId);
  return json({ ok: true, data: { deleted: true } });
}
