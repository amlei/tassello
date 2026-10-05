/* 小红书适配器全链路 e2e：走生产 publish()，TASSELLO_XHS_VISIBILITY=self 时发「仅自己可见」
 * 用法：bun packages/platforms/xhs/scripts/e2e-publish.ts <图片路径> [标题] [正文]
 * 测试完请在创作者中心「笔记管理」删除（或先用仅自己可见模式） */
process.env.TASSELLO_XHS_VISIBILITY = process.env.TASSELLO_XHS_VISIBILITY || "self";
import { xhsAdapter } from "../src/index";
const [, , img = "/tmp/xhs-test.png", title = "tassello 链路测试", body = "tassello 发布链路测试，测试完即删。"] = process.argv;
const ctx = { runPage: async () => { throw new Error("此脚本未注入 runPage"); }, secrets: { get: async () => null, set: async () => {} }, log: (e: string, p?: unknown) => console.log("[log]", e, p ?? "") };
const onStage = (e: { stage: number; progress: number; message?: string | null }) => console.log(`[stage ${e.stage}] ${e.progress}% ${e.message ?? ""}`);
const r = await xhsAdapter.publish(
  { id: "e2e", type: "image", title, body, bodyHtml: "", durationSec: null, assets: [{ id: "a1", kind: "image", path: img }] },
  { id: "t", uid: null, profile: undefined as never },
  ctx,
  onStage,
);
console.log("RESULT:", JSON.stringify(r));
process.exit(0);
