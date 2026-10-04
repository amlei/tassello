/* 探针 3：页面上下文 fetch 荔枝关键 JSON 接口，dump 真实响应（verify/播单列表素材）。
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/lizhi \
 *       bun packages/platforms/lizhi/scripts/probe-api.ts
 */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/lizhi`;
import { evaluateScalar, withPage } from "@tassello/cdp";

const ENDPOINTS = [
  "https://njnew.lizhi.fm/user/getCurrentUserInfo",
  "https://njnew.lizhi.fm/playsheet/list?type=0&keyword=",
  "https://njnew.lizhi.fm/voice/getUserHasRedPoint?voiceType=-1",
  "https://njnew.lizhi.fm/user/getAnchorPodcastMarkStatus",
];

const r = await withPage("lizhi", { url: "https://nj.lizhi.fm/static/newsite/#/manage/sheet", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  // 等 SPA 完成首次接口调用
  await new Promise((res) => setTimeout(res, 6000));
  const results = [];
  for (const ep of ENDPOINTS) {
    const one = await evaluateScalar<unknown>(
      cdp,
      sid,
      `(async () => {
        try {
          const r = await fetch(${JSON.stringify(ep)}, { credentials: "include", headers: { Accept: "application/json" } });
          const t = await r.text();
          return JSON.parse(JSON.stringify({ ep: ${JSON.stringify(ep)}, status: r.status, body: t.slice(0, 3000) }));
        } catch (e) {
          return JSON.parse(JSON.stringify({ ep: ${JSON.stringify(ep)}, status: 0, err: String(e) }));
        }
      })()`,
      { timeoutMs: 20000 },
    );
    results.push(one);
  }
  return results;
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
