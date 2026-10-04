/* 冒烟：喜马拉雅 verify 链路（headless，专用 probe profile）——主播号 + 专辑列表写入 profile */
import { ximalayaAdapter } from "../src/index";
const ctx = { secrets: { get: async () => null, set: async () => {} }, log: (e: string, p?: unknown) => console.log("[log]", e, p ?? "") };
const r = await ximalayaAdapter.account.verify({ id: "t", uid: null, profile: undefined as never }, ctx);
console.log(JSON.stringify(r, null, 2));
process.exit(0);
