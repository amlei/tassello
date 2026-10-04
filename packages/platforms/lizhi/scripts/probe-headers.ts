/* 探针 4：dump SPA 对 njnew.lizhi.fm 请求的完整头（找鉴权头/签名参数）。
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/lizhi \
 *       bun packages/platforms/lizhi/scripts/probe-headers.ts
 */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/lizhi`;
import { withPage } from "@tassello/cdp";

await withPage("lizhi", { url: "about:blank", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await cdp.send("Network.enable", {}, { sessionId: sid });
  const out: unknown[] = [];
  (cdp as unknown as { on: (e: string, f: (p: never) => void) => void }).on("Network.requestWillBeSent", (raw: never) => {
    const p = raw as { request: { url: string; method: string; headers: Record<string, string> } };
    if (p.request.url.includes("njnew.lizhi.fm")) {
      out.push({ url: p.request.url, method: p.request.method, headers: p.request.headers });
    }
  });
  await cdp.send("Page.navigate", { url: "https://nj.lizhi.fm/static/newsite/#/manage/sheet" }, { sessionId: sid });
  await new Promise((res) => setTimeout(res, 12000));
  console.log(JSON.stringify(out, null, 2));
});
process.exit(0);
