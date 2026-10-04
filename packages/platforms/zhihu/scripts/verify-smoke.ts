/* 冒烟：知乎 verify（附着共享池；真机验证时用独立 profile：
 *   TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/zhihu \
 *   bun packages/platforms/zhihu/scripts/verify-smoke.ts
 * 若独立 Chrome（端口 9342）已在跑，池会读 profile 的 DevToolsActivePort 直接复用 */
import { zhihuAdapter } from "../src/index";
const ctx = { secrets: { get: async () => null, set: async () => {} }, log: (e: string, p?: unknown) => console.log("[log]", e, p ?? "") };
const r = await zhihuAdapter.account.verify({ id: "t", uid: null, profile: undefined as never }, ctx);
console.log(JSON.stringify(r, null, 2));
process.exit(0);
