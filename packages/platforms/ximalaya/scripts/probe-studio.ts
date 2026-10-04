/* 探针 1：studio.ximalaya.com 页面状态（headless，只读）——登录态、全局对象、页面文本 */
import { evaluateScalar, withPage } from "@tassello/cdp";

const r = await withPage(
  "ximalaya",
  { url: "https://studio.ximalaya.com/", keepOpen: false, activate: false, mode: "headless" },
  async (cdp, sid) => {
    await new Promise((res) => setTimeout(res, 8000));
    return evaluateScalar<any>(
      cdp,
      sid,
      `(async () => {
        const out = {
          url: location.href,
          title: document.title,
          bodyText: ((document.body && document.body.innerText) || "").slice(0, 1500),
          cookies: document.cookie.split(";").map(c => c.trim().split("=")[0]).filter(Boolean),
          globalKeys: Object.keys(window).filter(k => /xmly|initialState|INITIAL|__|track|user/i.test(k)).slice(0, 40),
        };
        try {
          const r = await fetch("/api", { credentials: "include" });
          out.probeApiStatus = r.status;
        } catch (e) { out.probeApiStatus = String(e); }
        return JSON.parse(JSON.stringify(out));
      })()`,
      { timeoutMs: 20000 },
    );
  },
);
console.log(JSON.stringify(r, null, 2));
process.exit(0);
