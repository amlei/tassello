/* 抓页面真实 API 请求头 + profile/get、podcast/list 完整 body */
import { withPage, evaluateScalar, type CdpConnection } from "@tassello/cdp";

await withPage("xiaoyuzhou-probe", { url: "https://podcaster.xiaoyuzhoufm.com/podcast", keepOpen: false, activate: false }, async (cdp: CdpConnection, sid: string) => {
  const reqHeaders = new Map<string, Record<string, string>>();
  cdp.on("Network.requestWillBeSentExtraInfo", (p: unknown) => {
    const q = p as { requestId: string; headers?: Record<string, string> };
    if (q.headers) reqHeaders.set(q.requestId, q.headers);
  });
  cdp.on("Network.requestWillBeSent", (p: unknown) => {
    const q = p as { requestId: string; request?: { url?: string } };
    const u = q.request?.url ?? "";
    if (u.includes("podcaster-api")) reqHeaders.set("URL:" + q.requestId, { url: u });
  });
  await cdp.send("Network.enable", {}, { sessionId: sid });
  await new Promise((res) => setTimeout(res, 9000));
  const out = await evaluateScalar<{ status: number; body: string }>(
    cdp, sid,
    `(async () => {
      const r = await fetch("https://podcaster-api.xiaoyuzhoufm.com/v1/podcast/list", {
        method: "POST", credentials: "include",
        headers: { Accept: "application/json", "Content-Type": "application/json", "x-jike-allow-app-token-in-cookie": "true", "x-app-build-time": "2026-09-24 14:25:46 +0800" },
        body: "{}",
      });
      return { status: r.status, body: await r.text() };
    })()`,
    { timeoutMs: 30_000 },
  );
  const pairs: Record<string, Record<string, string>> = {};
  // 配对：找同 requestId 的 URL 标记
  for (const [k, v] of reqHeaders) {
    if (k.startsWith("URL:")) {
      const id = k.slice(4);
      const h = reqHeaders.get(id);
      if (h) pairs[v.url!] = h;
    }
  }
  console.log(JSON.stringify({ list: out, pageReqHeaders: pairs }, null, 2));
});
process.exit(0);
