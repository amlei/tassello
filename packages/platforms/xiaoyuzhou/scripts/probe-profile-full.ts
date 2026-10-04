/* 探针 18：profile/get 完整字段 + hosted-resource AUDIO/IMAGE 残留检查
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou bun packages/platforms/xiaoyuzhou/scripts/probe-profile-full.ts */
import { withPage, evaluateScalar } from "@tassello/cdp";

await withPage("xiaoyuzhou-probe", { url: "https://podcaster.xiaoyuzhoufm.com/podcast", keepOpen: false, activate: false }, async (cdp, sid) => {
  await new Promise((r) => setTimeout(r, 8000));
  const out = await evaluateScalar<Record<string, unknown>>(cdp, sid, `(async () => {
    const H = { Accept: "application/json", "Content-Type": "application/json", "x-jike-allow-app-token-in-cookie": "true", "x-app-build-time": "2026-09-24 14:25:46 +0800" };
    const p = await fetch("https://podcaster-api.xiaoyuzhoufm.com/v1/profile/get", { credentials: "include", headers: H });
    const profile = await p.json();
    const l = await fetch("https://podcaster-api.xiaoyuzhoufm.com/v1/podcast/list", { method: "POST", credentials: "include", headers: H, body: "{}" });
    const list = await l.json();
    const ra = await fetch("https://podcaster-api.xiaoyuzhoufm.com/v1/hosted-resource/list", { method: "POST", credentials: "include", headers: H, body: JSON.stringify({ title: "", pid: "6aa0b3e56d64a2ee897188fd", type: "AUDIO", skip: 0, limit: 20 }) });
    const audioRes = await ra.json();
    return { profile, podcasts: (list.data || []).map((x) => ({ pid: x.pid, title: x.title, author: x.author, cover: x.image && x.image.picUrl, syncMode: x.syncMode })), audioRes };
  })()`, { timeoutMs: 30_000 });
  console.log(JSON.stringify(out, null, 1));
});
process.exit(0);
