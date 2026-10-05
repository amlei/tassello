/* 临时冒烟：小红书 verify 链路（headless，专用 profile） */
import { xhsAdapter } from "../src/index";
const ctx = { runPage: async () => { throw new Error("此脚本未注入 runPage"); }, secrets: { get: async () => null, set: async () => {} }, log: (e: string, p?: unknown) => console.log("[log]", e, p ?? "") };
const r = await xhsAdapter.account.verify({ id: "t", uid: null, profile: undefined as never }, ctx);
console.log(JSON.stringify(r, null, 2));
process.exit(0);
