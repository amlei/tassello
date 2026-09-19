import { confirmTask, retryTask } from "@tassello/server";
import type { ApiResult, TaskDTO } from "@tassello/shared";
import { ensureBoot, fail, json, readJson } from "../../_lib";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/tasks/:id  body: { action: "confirm" | "retry", url? } */
export async function POST(req: Request, ctx: Ctx) {
  ensureBoot();
  const { id } = await ctx.params;
  const body = (await readJson<{ action?: string; url?: string }>(req).catch(() => ({ action: "confirm" }))) as {
    action?: string;
    url?: string;
  };
  try {
    if (body.action === "retry") {
      const task = await retryTask(id);
      return json<ApiResult<TaskDTO>>({ ok: true, data: task });
    }
    const task = await confirmTask(id, body.url);
    return json<ApiResult<TaskDTO>>({ ok: true, data: task });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
