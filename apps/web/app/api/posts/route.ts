import { createPost, listPosts, type SortKey } from "@tassello/server";
import { postCreateSchema, type ApiResult, type PostDTO } from "@tassello/shared";
import { ensureBoot, fail, json, readJson } from "../_lib";

export async function GET(req: Request) {
  ensureBoot();
  const url = new URL(req.url);
  const scope = (url.searchParams.get("scope") ?? "all") as "all" | "article" | "image" | "video" | "audio";
  const query = url.searchParams.get("query") ?? "";
  const sort = (url.searchParams.get("sort") ?? "recent") as SortKey;
  const posts = await listPosts({ scope, query, sort });
  return json<ApiResult<PostDTO[]>>({ ok: true, data: posts });
}

export async function POST(req: Request) {
  ensureBoot();
  const body = await readJson<unknown>(req);
  const parsed = postCreateSchema.safeParse(body);
  if (!parsed.success) return fail("参数不合法");
  const post = await createPost(parsed.data);
  return json<ApiResult<PostDTO>>({ ok: true, data: post });
}
