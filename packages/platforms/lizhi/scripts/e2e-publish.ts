/* e2e：荔枝手动上传向导 —— 用户选择播单后，把音频交给 batchToSheet 并停住。
 * 红线：绝不点击「发布 / 保存 / 创建」类按钮，最终动作由用户在可见页面完成。
 * 用法：bun packages/platforms/lizhi/scripts/e2e-publish.ts <播单id> [音频路径]
 */
import { lizhiAdapter } from "../src/index";
import { withPage } from "@tassello/cdp";

const [, , channelId = "", audio = "/tmp/lizhi-test.m4a", title = "tassello 链路测试", body = "tassello 手动上传向导测试"] = process.argv;
if (!channelId) throw new Error("用法：bun e2e-publish.ts <播单id> [音频路径] [标题] [简介]");

const result = await lizhiAdapter.publish(
  {
    id: "e2e",
    type: "audio",
    title,
    body,
    bodyHtml: "",
    durationSec: null,
    assets: [{ id: "a1", kind: "audio", path: audio }],
    targetChannel: { id: channelId, name: `e2e:${channelId}` },
  },
  { id: "t", uid: null, profile: undefined as never },
  {
    log: (event, payload) => console.log("[log]", event, payload ?? ""),
    runPage: (platformId, options, handler) =>
      withPage(platformId, { ...options, mode: "visible" }, handler),
  },
  (event) => console.log(`[stage ${event.stage}] ${event.progress}% ${event.message ?? ""}`),
);
console.log("RESULT:", JSON.stringify(result, null, 2));
process.exit(0);
