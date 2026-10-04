/* e2e：喜马拉雅发布链路——走生产 publish() 填表（绝不自动点「确认发布」，停在人工确认）。
 * 确认发布/清理的真机验证见 probe-confirm-publish.ts 与 cleanup-e2e.ts。
 * 用法：bun packages/platforms/ximalaya/scripts/e2e-publish.ts [音频路径] [标题] [简介] */
import { ximalayaAdapter } from "../src/index";
const [, , audio = "/tmp/ximalaya-test.m4a", title = "tassello 链路测试", body = "tassello 发布链路测试，测试完即删。"] = process.argv;
const ctx = { secrets: { get: async () => null, set: async () => {} }, log: (e: string, p?: unknown) => console.log("[log]", e, p ?? "") };
const onStage = (e: { stage: number; progress: number; message?: string | null }) => console.log(`[stage ${e.stage}] ${e.progress}% ${e.message ?? ""}`);

// 标题带时间戳，方便 cleanup-e2e 精确找到测试条目
const finalTitle = `${title} ${new Date().toISOString().slice(0, 16)}`;
const r = await ximalayaAdapter.publish(
  { id: "e2e", type: "audio", title: finalTitle, body, bodyHtml: "", durationSec: 30, assets: [{ id: "a1", kind: "audio", path: audio }] },
  { id: "t", uid: null, profile: undefined as never },
  ctx,
  onStage,
);
console.log("RESULT:", JSON.stringify(r));
process.exit(0);
