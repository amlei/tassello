/* 真机验证：小宇宙 verify（登录态 + 账号信息 + 节目列表）
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou \
 *   bun packages/platforms/xiaoyuzhou/scripts/verify-smoke.ts */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE ?? `${process.env.HOME}/.local/share/tassello/probe-profiles/xiaoyuzhou`;

const { xiaoyuzhouAdapter } = await import("../src/index.ts");

const r = await xiaoyuzhouAdapter.account.verify(
  { id: "smoke", uid: null, profile: { uid: "", channels: [] } },
  { secrets: { get: async () => null, set: async () => {} }, log: (e, p) => console.error("[log]", e, p ?? "") },
);
console.log(JSON.stringify(r, null, 2));
if (r.state !== "ok") process.exit(1);
