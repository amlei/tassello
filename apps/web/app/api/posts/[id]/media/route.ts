import { setPostMedia } from "@tassello/server";
import type { ApiResult, PostDTO } from "@tassello/shared";
import { ensureBoot, fail, json } from "../../../_lib";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/posts/:id/media  multipart: { kind: "video"|"audio"|"image", file } —— 上传媒体素材（video/audio 替换，image 追加） */
export async function POST(req: Request, ctx: Ctx) {
  ensureBoot();
  const { id } = await ctx.params;
  try {
    const form = await req.formData();
    const kind = String(form.get("kind") ?? "");
    const file = form.get("file");
    if (kind !== "video" && kind !== "audio" && kind !== "image") return fail("kind 必须是 video、audio 或 image");
    if (!(file instanceof File)) return fail("缺少文件");
    const post = await setPostMedia(id, kind, file.name, new Uint8Array(await file.arrayBuffer()));
    if (!post) return fail("稿子不存在", 404);
    return json<ApiResult<PostDTO>>({ ok: true, data: post });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 400);
  }
}
