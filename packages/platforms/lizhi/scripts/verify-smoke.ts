/* 冒烟：荔枝播客 verify 链路（headless，专用 probe profile）。
 * 用法：bun packages/platforms/lizhi/scripts/verify-smoke.ts */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/lizhi`;
import { lizhiAdapter } from "../src/index";
const ctx = { secrets: { get: async () => null, set: async () => {} }, log: (e: string, p?: unknown) => console.log("[log]", e, p ?? "") };
const r = await lizhiAdapter.account.verify({ id: "t", uid: null, profile: undefined as never }, ctx);
console.log(JSON.stringify(r, null, 2));
process.exit(0);
