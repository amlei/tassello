/* 探针 2：监听 Network 域，导航到主播后台，抓真实 XHR/fetch 接口清单与响应片段
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou bun packages/platforms/xiaoyuzhou/scripts/probe-network.ts
 * 说明：探针 profile 独占，Network 事件只来自本会话，按 method 订阅即可 */
import { withPage, evaluateScalar, type CdpConnection } from "@tassello/cdp";

await withPage("xiaoyuzhou-probe", { url: "about:blank", keepOpen: false, activate: false }, async (cdp: CdpConnection, sid: string) => {
  const reqs = new Map<string, { url: string; method: string; resourceType: string; status?: number }>();
  const bodies = new Map<string, string>();

  cdp.on("Network.requestWillBeSent", (p: unknown) => {
    const q = p as { requestId: string; request?: { url?: string; method?: string }; type?: string };
    const url = q.request?.url ?? "";
    if (url.startsWith("http")) reqs.set(q.requestId, { url, method: q.request?.method ?? "", resourceType: q.type ?? "" });
  });
  cdp.on("Network.responseReceived", (p: unknown) => {
    const q = p as { requestId: string; response?: { status?: number } };
    const r = reqs.get(q.requestId);
    if (r) r.status = q.response?.status;
  });
  cdp.on("Network.loadingFinished", (p: unknown) => {
    const q = p as { requestId: string };
    const r = reqs.get(q.requestId);
    if (r && (r.resourceType === "XHR" || r.resourceType === "Fetch")) {
      cdp.send("Network.getResponseBody", { requestId: q.requestId }, { sessionId: sid })
        .then((b: { body?: string }) => bodies.set(q.requestId, String(b?.body ?? "").slice(0, 800)))
        .catch(() => {});
    }
  });

  await cdp.send("Network.enable", {}, { sessionId: sid });
  await cdp.send("Page.enable", {}, { sessionId: sid });
  await cdp.send("Page.navigate", { url: "https://podcaster.xiaoyuzhoufm.com/podcast" }, { sessionId: sid });
  await new Promise((res) => setTimeout(res, 12_000));

  const list = [...reqs.values()].filter((r) => r.resourceType === "XHR" || r.resourceType === "Fetch");
  const out = list.map((r) => {
    const id = [...reqs.entries()].find(([, v]) => v === r)?.[0] ?? "";
    return { ...r, body: bodies.get(id) ?? null };
  });
  console.log(JSON.stringify(out, null, 2));
});
process.exit(0);
