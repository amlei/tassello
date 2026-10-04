/* 临时冒烟：蜻蜓FM verify 链路（headless，专用 probe profile） */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/qingting`;
import { qingtingAdapter } from "../src/index";
const ctx = { secrets: { get: async () => null, set: async () => {} }, log: (e: string, p?: unknown) => console.log("[log]", e, p ?? "") };
const r = await qingtingAdapter.account.verify({ id: "t", uid: null, profile: undefined as never }, ctx);
console.log(JSON.stringify(r, null, 2));
process.exit(0);
