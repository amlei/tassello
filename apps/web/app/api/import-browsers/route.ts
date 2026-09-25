import { listImportBrowsers } from "@tassello/server";
import type { ApiResult, ImportBrowserDTO } from "@tassello/shared";
import { ensureBoot, json } from "../_lib";

/** GET /api/import-browsers —— 登录态导入的候选浏览器与检测状态 */
export async function GET() {
  ensureBoot();
  return json<ApiResult<ImportBrowserDTO[]>>({ ok: true, data: listImportBrowsers() });
}
