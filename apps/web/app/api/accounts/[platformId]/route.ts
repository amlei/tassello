import { acquireAccount, verifyAccount } from "@tassello/server";
import type { AccountDTO, ApiResult } from "@tassello/shared";
import { ensureBoot, fail, json, readJson } from "../../_lib";

type Ctx = { params: Promise<{ platformId: string }> };

/** POST /api/accounts/:platformId  body: { action: "acquire" | "verify" }
 *  verify = 纯校验（UI 只走这个）；acquire = 校验 + 失效时打开登录页兜底，不再复制文件 */
export async function POST(req: Request, ctx: Ctx) {
  ensureBoot();
  const { platformId } = await ctx.params;
  const body = await readJson<{ action?: string }>(req).catch(() => ({ action: "verify" }));
  try {
    if (body.action === "acquire") {
      const account = await acquireAccount(platformId);
      return json<ApiResult<AccountDTO>>({ ok: true, data: account });
    }
    const account = await verifyAccount(platformId);
    return json<ApiResult<AccountDTO>>({ ok: true, data: account });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
