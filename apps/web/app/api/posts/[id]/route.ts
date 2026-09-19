import { deletePost, getPost, updatePost } from "@tassello/server";
import { postUpdateSchema, type ApiResult, type PostDTO } from "@tassello/shared";
import { ensureBoot, fail, json, readJson } from "../../_lib";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  ensureBoot();
  const { id } = await ctx.params;
  const post = await getPost(id);
  if (!post) return fail("稿子不存在", 404);
  return json<ApiResult<PostDTO>>({ ok: true, data: post });
}

export async function PATCH(req: Request, ctx: Ctx) {
  ensureBoot();
  const { id } = await ctx.params;
  const body = await readJson<unknown>(req);
  const parsed = postUpdateSchema.safeParse(body);
  if (!parsed.success) return fail("参数不合法");
  const post = await updatePost(id, parsed.data);
  if (!post) return fail("稿子不存在", 404);
  return json<ApiResult<PostDTO>>({ ok: true, data: post });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  ensureBoot();
  const { id } = await ctx.params;
  await deletePost(id);
  return json<ApiResult<{ deleted: boolean }>>({ ok: true, data: { deleted: true } });
}
