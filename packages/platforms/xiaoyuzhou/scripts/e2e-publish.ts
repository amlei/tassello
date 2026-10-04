/* 真机 e2e：publish 全链路——上传音频 → 填标题/简介/shownotes → 停在「创建」前
 * 红线：绝不点击平台「创建 / 定时发布」按钮；needsManualConfirm: true。
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou \
 *   bun packages/platforms/xiaoyuzhou/scripts/e2e-publish.ts <pid> <音频路径>
 * 音频缺省用 /tmp/xyz-e2e.m4a（20 分钟静音 AAC，缺失时提示用 ffmpeg 生成）。 */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE ?? `${process.env.HOME}/.local/share/tassello/probe-profiles/xiaoyuzhou`;

const pid = process.argv[2];
const audio = process.argv[3] ?? "/tmp/xyz-e2e.m4a";
if (!pid) {
  console.error("用法: bun e2e-publish.ts <pid> [音频路径]（pid 见 verify-smoke 输出的 channels）");
  process.exit(1);
}

const { xiaoyuzhouAdapter } = await import("../src/index.ts");

const post = {
  id: "e2e-xyz",
  type: "audio",
  title: `tassello e2e 测试单集 ${new Date().toISOString().slice(0, 16)}`,
  body: "tassello e2e 测试简介：这条单集只填表单不发布，由人工点「创建」或直接关掉页面丢弃。",
  bodyHtml: "",
  durationSec: null,
  assets: [{ id: "a1", kind: "audio", path: audio, color: null }],
};

const r = await xiaoyuzhouAdapter.publish(
  post,
  { id: "e2e", uid: null, profile: { uid: "", channels: [{ pid, title: "e2e" }] } },
  { secrets: { get: async () => null, set: async () => {} }, log: (e, p) => console.error("[log]", e, p ?? "") },
  (s) => console.error(`[stage ${s.stage}] ${s.progress}% ${s.message ?? ""}`),
);
console.log(JSON.stringify(r, null, 2));
if (!r.needsManualConfirm) {
  console.error("!! 违反红线：publish 不应走到 needsManualConfirm=false");
  process.exit(1);
}
console.error("[e2e] 已停在创建页（未点「创建」）。要丢弃直接关标签页；平台侧无草稿/单集残留。");
