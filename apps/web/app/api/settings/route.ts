import { getSettings, saveSettings } from "@tassello/server";
import { settingsUpdateSchema, type ApiResult, type AppSettings } from "@tassello/shared";
import { ensureBoot, fail, json, readJson } from "../_lib";

export async function GET() {
  ensureBoot();
  const settings = await getSettings();
  return json<ApiResult<AppSettings>>({ ok: true, data: settings });
}

export async function PATCH(req: Request) {
  ensureBoot();
  const body = await readJson<unknown>(req);
  const parsed = settingsUpdateSchema.safeParse(body);
  if (!parsed.success) return fail("参数不合法");
  const settings = await saveSettings(parsed.data as Partial<AppSettings>);
  return json<ApiResult<AppSettings>>({ ok: true, data: settings });
}
