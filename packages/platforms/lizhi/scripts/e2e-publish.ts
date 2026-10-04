/* e2e：荔枝播客发布链路 —— 本期阻塞（登录态过期，需人工验证码/扫码重新登录），publish 显式报错。
 * 保留此脚本作为续探入口：拿到登录态并完成存草稿链路适配后，
 * 用法：bun packages/platforms/lizhi/scripts/e2e-publish.ts <音频路径> [标题] [简介] [播单id]
 * 红线：荔枝发布语义 = 只存草稿。最多走到「草稿保存成功」即停（needsManualConfirm: true），
 * 绝不点击「发布」类按钮，正式发布由用户在荔枝后台完成。 */
import { lizhiAdapter } from "../src/index";
const [, , audio = "/tmp/lizhi-test.m4a", title = "tassello 链路测试", body = "tassello 存草稿链路测试，测试完即删。", channelId = ""] = process.argv;
const ctx = { secrets: { get: async () => null, set: async () => {} }, log: (e: string, p?: unknown) => console.log("[log]", e, p ?? "") };
const onStage = (e: { stage: number; progress: number; message?: string | null }) => console.log(`[stage ${e.stage}] ${e.progress}% ${e.message ?? ""}`);
const r = await lizhiAdapter.publish(
  {
    id: "e2e",
    type: "audio",
    title,
    body,
    bodyHtml: "",
    durationSec: 30,
    assets: [{ id: "a1", kind: "audio", path: audio }, ...(channelId ? [{ id: "ch", kind: "channel", path: channelId }] : [])],
  },
  { id: "t", uid: null, profile: undefined as never },
  ctx,
  onStage,
);
console.log("RESULT:", JSON.stringify(r));
process.exit(0);
