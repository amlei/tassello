/* 探针 2：发现接口与上传入口——performance resource 里的 XHR + 页面链接 + 用户/专辑接口猜测 */
import { evaluateScalar, withPage } from "@tassello/cdp";

const r = await withPage(
  "ximalaya",
  { url: "https://studio.ximalaya.com/", keepOpen: false, activate: false, mode: "headless" },
  async (cdp, sid) => {
    await new Promise((res) => setTimeout(res, 8000));
    const home = await evaluateScalar<any>(
      cdp,
      sid,
      `(() => {
        const resources = performance.getEntriesByType("resource").map(e => e.name)
          .filter(u => !/\\.(js|css|png|jpg|webp|gif|woff|svg|ico)/.test(u));
        const links = Array.from(document.querySelectorAll("a[href]")).map(a => ({ href: a.getAttribute("href"), t: (a.textContent||"").trim().slice(0,20) }))
          .filter(l => /upload|upload|sound|album|track|creation/i.test(l.href));
        return JSON.parse(JSON.stringify({ resources: resources.slice(0, 60), links }));
      })()`,
      { timeoutMs: 15000 },
    );
    // 试探一批可能的用户/专辑接口（猜测只作线索，结果以真机响应为准）
    const api = await evaluateScalar<any>(
      cdp,
      sid,
      `(async () => {
        const paths = [
          "/web/user/info", "/api/user/info", "/web/users/self", "/api/web/user",
          "/web/albums", "/api/albums", "/web/album/list", "/api/web/albums",
          "/gateway/web/user/info", "/gateway/web/album/list",
        ];
        const out = [];
        for (const p of paths) {
          try {
            const r = await fetch(p, { credentials: "include", headers: { Accept: "application/json" } });
            const t = await r.text();
            out.push({ p, status: r.status, body: t.slice(0, 200) });
          } catch (e) { out.push({ p, status: 0, body: String(e).slice(0, 100) }); }
        }
        return JSON.parse(JSON.stringify(out));
      })()`,
      { timeoutMs: 40000 },
    );
    return { home, api };
  },
);
console.log(JSON.stringify(r, null, 2));
process.exit(0);
