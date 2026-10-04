import { importProfile } from "@tassello/server";
import type { ApiResult } from "@tassello/shared";
import { ensureBoot, fail, json } from "../../_lib";

/** POST /api/profile/import —— 以设置所选日常浏览器整体覆盖登录态，然后自动重校验全部账号 */
export async function POST() {
  ensureBoot();
  try {
    const result = await importProfile();
    return json<ApiResult<{ ok: boolean; message?: string }>>({ ok: true, data: result });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
