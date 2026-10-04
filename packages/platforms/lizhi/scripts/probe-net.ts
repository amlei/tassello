/* 探针 2：抓包 nj.lizhi.fm SPA 的 XHR/fetch（Network 域事件），找真实 JSON 接口与登录判定。
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/lizhi \
 *       bun packages/platforms/lizhi/scripts/probe-net.ts [url]
 */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/lizhi`;
import { withPage } from "@tassello/cdp";

const URL = process.argv[2] || "https://nj.lizhi.fm/static/newsite/#/manage/sheet";

await withPage("lizhi", { url: "about:blank", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  const reqs = new Map();
  cdp.on?.("Network.requestWillBeSent", () => {});
  await cdp.send("Network.enable", {}, { sessionId: sid });
  // 用事件轮询：cdp 封装若有 on 能力则订阅，否则退化为事后 resource 列表
  try {
    (cdp as unknown as { on: (e: string, f: (p: unknown) => void) => void }).on("Network.requestWillBeSent", (p) => {
      const q = p as { requestId: string; request: { url: string; method: string }; type?: string };
      reqs.set(q.requestId, { url: q.request.url, method: q.request.method, type: q.type ?? "" });
    });
    (cdp as unknown as { on: (e: string, f: (p: unknown) => void) => void }).on("Network.responseReceived", (p) => {
      const q = p as { requestId: string; response: { status: number; mimeType: string } };
      const r = reqs.get(q.requestId);
      if (r) { r.status = q.response.status; r.mime = q.response.mimeType; }
    });
  } catch {}
  await cdp.send("Page.navigate", { url: URL }, { sessionId: sid });
  await new Promise((res) => setTimeout(res, 15000));
  const rows = [...reqs.values()].filter((r) => /json|lizhi|api/i.test(`${r.url} ${r.mime ?? ""}`));
  console.log(JSON.stringify(rows, null, 2));
});
process.exit(0);
