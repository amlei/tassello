/* e2e：蜻蜓FM 发布链路真机验证（专用 probe profile）。
 * 红线：绝不点「发 布」——publish 最多走到「音频已传 + 表单已填、停在发布确认前」，
 * needsManualConfirm: true，最后一步（提交上线/进审核）由用户在保持打开的页面里完成。
 * 平台侧残留：未点发布前不产生节目（文件只传到 OBS 暂存），无需平台侧清理。
 * 用法：bun packages/platforms/qingting/scripts/e2e-publish.ts [音频路径] [标题] [导语]
 *      TASSELLO_QINGTING_CHANNEL_ID=530120 可指定目标专辑（单专辑账号可省略）。 */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/qingting`;
import { qingtingAdapter } from "../src/index";

const [, , audio = "/tmp/qingting-test.m4a", title = "tassello 链路测试", body = "tassello 发布链路测试，测试完请在蜻蜓页面取消，勿点发布。"] = process.argv;
const ctx = { secrets: { get: async () => null, set: async () => {} }, log: (e: string, p?: unknown) => console.log("[log]", e, p ?? "") };
const onStage = (e: { stage: number; progress: number; message?: string | null }) => console.log(`[stage ${e.stage}] ${e.progress}% ${e.message ?? ""}`);

// 先 verify 拿账号+专辑列表，再发布
const v = await qingtingAdapter.account.verify({ id: "e2e", uid: null, profile: undefined as never }, ctx);
console.log("VERIFY:", JSON.stringify(v, null, 2));
if (v.state !== "ok") {
  console.log("verify 未通过，终止 e2e。");
  process.exit(1);
}
const profile = v.profile!;
const r = await qingtingAdapter.publish(
  { id: "e2e", type: "audio", title, body, bodyHtml: "", durationSec: 30, assets: [{ id: "a1", kind: "audio", path: audio }] },
  { id: "e2e", uid: profile.uid, profile },
  ctx,
  onStage,
);
console.log("PUBLISH RESULT:", JSON.stringify(r, null, 2));
console.log(r.needsManualConfirm ? "已按草稿语义停在发布确认前，请人工核对。" : "⚠️ 异常：不应自动发布！");
process.exit(0);
