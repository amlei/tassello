import { createTasks } from "@tassello/server";
import { publishRequestSchema, type ApiResult, type TaskDTO } from "@tassello/shared";
import { ensureBoot, fail, json, readJson } from "../_lib";

export async function POST(req: Request) {
  ensureBoot();
  const body = await readJson<unknown>(req);
  const parsed = publishRequestSchema.safeParse(body);
  if (!parsed.success) return fail("参数不合法");
  try {
    const tasks = await createTasks(parsed.data.postId, parsed.data.platformIds);
    return json<ApiResult<TaskDTO[]>>({ ok: true, data: tasks });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
