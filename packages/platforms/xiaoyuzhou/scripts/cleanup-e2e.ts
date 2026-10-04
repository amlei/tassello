/* e2e 清理：检查探针/e2e 是否在小宇宙平台侧留下测试单集或音频资源残留。
 * 适配器发布语义停在「创建」前，正常不产生平台侧数据；本脚本用于事后核对。
 * 1) 逐节目查 /v1/episode/list（按 title 匹配 tassello 测试单集）；
 * 2) 查 /v1/hosted-resource/list AUDIO 残留；
 * 3) 只有显式设置 TASSELLO_XIAOYUZHOU_CONFIRM_DELETE=1 且拿到 eid 时才调用
 *    /v1/episode/hosted/remove（真机证据：bundle 内 removeHosted({eid})），默认只报告不动手。
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou \
 *   bun packages/platforms/xiaoyuzhou/scripts/cleanup-e2e.ts [pid …]（缺省 = verify 拿全部节目） */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE ?? `${process.env.HOME}/.local/share/tassello/probe-profiles/xiaoyuzhou`;

import { withPage, evaluateScalar } from "@tassello/cdp";

const pids = process.argv.slice(2);

const r = await withPage("xiaoyuzhou", { url: "https://podcaster.xiaoyuzhoufm.com/podcast", keepOpen: false, activate: false }, async (cdp, sid) => {
  // 先等页面就绪（cookie 在 podcaster 域）
  for (let i = 0; i < 10; i++) {
    await new Promise((res) => setTimeout(res, 2000));
    try {
      const ok = await evaluateScalar<boolean>(cdp, sid, `(() => location.hostname === "podcaster.xiaoyuzhoufm.com")()`, { timeoutMs: 8_000 });
      if (ok) break;
    } catch {}
  }
  const H = `{ Accept: "application/json", "Content-Type": "application/json", "x-jike-allow-app-token-in-cookie": "true", "x-app-build-time": "2026-09-24 14:25:46 +0800" }`;
  return evaluateScalar<Record<string, unknown>>(cdp, sid, `(async () => {
    const headers = ${H};
    const out = { episodes: [], audioResources: [], deleted: [] };
    const pids = ${JSON.stringify(pids)};
    let targets = pids;
    if (!targets.length) {
      const l = await fetch("https://podcaster-api.xiaoyuzhoufm.com/v1/podcast/list", { method: "POST", credentials: "include", headers, body: "{}" });
      targets = (((await l.json()).data) || []).map((x) => x.pid);
    }
    for (const pid of targets) {
      const e = await fetch("https://podcaster-api.xiaoyuzhoufm.com/v1/episode/list", {
        method: "POST", credentials: "include", headers,
        body: JSON.stringify({ pid, skip: 0, limit: 50 }),
      });
      const ej = await e.json().catch(() => ({}));
      const eps = (ej.data && (ej.data.episodes || ej.data.data || ej.data)) || [];
      for (const ep of Array.isArray(eps) ? eps : []) {
        const t = String(ep.title || ep.episode?.title || "");
        if (/tassello|e2e/i.test(t)) out.episodes.push({ pid, eid: String(ep.id || ep.eid || ep.episode?.id || ""), title: t });
      }
      const ra = await fetch("https://podcaster-api.xiaoyuzhoufm.com/v1/hosted-resource/list", {
        method: "POST", credentials: "include", headers,
        body: JSON.stringify({ title: "", pid, type: "AUDIO", skip: 0, limit: 50 }),
      });
      const raj = await ra.json().catch(() => ({}));
      for (const res of raj.data || []) {
        if (/tassello|xyz-test|xyz-e2e/i.test(String(res.title || res.name || ""))) out.audioResources.push({ pid, id: String(res.id || ""), title: res.title || res.name });
      }
    }
    const confirmDelete = ${JSON.stringify(process.env.TASSELLO_XIAOYUZHOU_CONFIRM_DELETE === "1")};
    if (confirmDelete) {
      for (const ep of out.episodes) {
        if (!ep.eid) continue;
        const d = await fetch("https://podcaster-api.xiaoyuzhoufm.com/v1/episode/hosted/remove", {
          method: "POST", credentials: "include", headers, body: JSON.stringify({ eid: ep.eid }),
        });
        out.deleted.push({ eid: ep.eid, status: d.status });
      }
    }
    return out;
  })()`, { timeoutMs: 60_000 });
});

console.log(JSON.stringify(r, null, 2));
console.error(
  r.episodes.length === 0 && r.audioResources.length === 0
    ? "[cleanup] 平台侧无 tassello 测试残留 ✓"
    : "[cleanup] 发现残留（删除需 TASSELLO_XIAOYUZHOU_CONFIRM_DELETE=1）",
);
