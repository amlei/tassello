/* 探针 4：验证裸 fetch + x-jike-allow-app-token-in-cookie 头是否足够（决定 verify 可否接口化）
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou bun packages/platforms/xiaoyuzhou/scripts/probe-api-headers.ts */
import { withPage, evaluateScalar } from "@tassello/cdp";

const r = await withPage("xiaoyuzhou-probe", { url: "https://podcaster.xiaoyuzhoufm.com/podcast", keepOpen: false, activate: false }, async (cdp, sid) => {
  await new Promise((res) => setTimeout(res, 8000));
  const out = await evaluateScalar<{ status: number; body: string }[]>(
    cdp,
    sid,
    `(async () => {
      const out = [];
      const tries = [
        ["no-header", {}],
        ["with-header", { "x-jike-allow-app-token-in-cookie": "true", "x-app-build-time": "2026-09-24 14:25:46 +0800" }],
      ];
      for (const [tag, extra] of tries) {
        const p = await fetch("https://podcaster-api.xiaoyuzhoufm.com/v1/profile/get", { credentials: "include", headers: { Accept: "application/json", ...extra } });
        const l = await fetch("https://podcaster-api.xiaoyuzhoufm.com/v1/podcast/list", {
          method: "POST", credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json", ...extra }, body: "{}",
        });
        out.push({ tag, profileStatus: p.status, profileBody: (await p.text()).slice(0, 200), listStatus: l.status, listBody: (await l.text()).slice(0, 400) });
      }
      return out;
    })()`,
    { timeoutMs: 30_000 },
  );
  return out;
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
