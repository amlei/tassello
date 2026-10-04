/* 探针 1：podcaster.xiaoyuzhoufm.com 登录态探测 + 页面结构粗查
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou bun packages/platforms/xiaoyuzhou/scripts/probe-login.ts */
import { withPage, evaluateScalar } from "@tassello/cdp";

const r = await withPage("xiaoyuzhou-probe", { url: "https://podcaster.xiaoyuzhoufm.com/", keepOpen: false, activate: false }, async (cdp, sid) => {
  await new Promise((res) => setTimeout(res, 5000));
  const info = await evaluateScalar<{ url: string; title: string; text: string }>(
    cdp,
    sid,
    `(async () => {
      await new Promise((res) => setTimeout(res, 2000));
      return JSON.parse(JSON.stringify({
        url: location.href,
        title: document.title,
        text: ((document.body && document.body.innerText) || "").slice(0, 1500),
      }));
    })()`,
    { timeoutMs: 20_000 },
  );
  // 已知/猜得的接口逐个试一遍，记录真实返回
  const apis = await evaluateScalar<{ status: number; body: string }[]>(
    cdp,
    sid,
    `(async () => {
      const out = [];
      const eps = [
        "/web_api/podcast/mine",
        "/web_api/user/info",
        "/web_api/podcast/list",
        "/api/podcast/mine",
      ];
      for (const ep of eps) {
        try {
          const r = await fetch(ep, { credentials: "include", headers: { Accept: "application/json" } });
          out.push({ status: r.status, body: (await r.text()).slice(0, 600) });
        } catch (e) {
          out.push({ status: 0, body: String(e) });
        }
      }
      return out;
    })()`,
    { timeoutMs: 30_000 },
  );
  return { info, apis };
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
