import { listPlatforms } from "@tassello/server";
import type { ApiResult, PlatformDTO } from "@tassello/shared";
import { ensureBoot, json } from "../_lib";

export async function GET() {
  ensureBoot();
  const platforms = await listPlatforms();
  return json<ApiResult<PlatformDTO[]>>({ ok: true, data: platforms });
}
