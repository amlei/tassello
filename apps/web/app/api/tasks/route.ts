import { listTasks } from "@tassello/server";
import type { ApiResult, TaskDTO } from "@tassello/shared";
import { ensureBoot, json } from "../_lib";

export async function GET() {
  ensureBoot();
  const tasks = await listTasks();
  return json<ApiResult<TaskDTO[]>>({ ok: true, data: tasks });
}
