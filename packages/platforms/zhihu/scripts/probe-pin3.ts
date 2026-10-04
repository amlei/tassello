/* 纯接口直发想法验证：POST content/publish (action=pin) → 拿 pinId → DELETE 清理 */
import { CdpConnection, openPageSession, evaluateScalar } from "@tassello/cdp";
const ver = await fetch("http://127.0.0.1:9342/json/version").then((r) => r.json() as Promise<{ webSocketDebuggerUrl: string }>);
const cdp = await CdpConnection.connect(ver.webSocketDebuggerUrl, 10_000);
const page = await openPageSession({ cdp, reusing: true, url: "https://www.zhihu.com/creator", enableRuntime: true, enablePage: true, enableNetwork: true });
await new Promise((r) => setTimeout(r, 6000));
let pinId: string | null = null;
cdp.on("Network.responseReceived", (p: any) => {
  if (/\/api\/v4\/content\/publish$/.test(p.response.url)) {
    // 拿响应体需要在额外异步任务里取，这里只标记
  }
});
const r = await evaluateScalar<any>(cdp, page.sessionId, `(async () => {
  try {
    const body = {
      action: "pin",
      data: {
        publish: { traceId: String(Date.now()) + "," + crypto.randomUUID() },
        commentsPermission: { comment_permission: "all" },
        extra_info: { view_permission: "all", publisher: "pc" },
        draft: { disabled: 1 },
        hybrid: { html: "<p>[tassello 探针] 纯接口想法直发，稍后删除。</p>", textLength: 22 },
      },
    };
    const r = await fetch("https://www.zhihu.com/api/v4/content/publish", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const t = await r.text();
    let id = null;
    try { const j = JSON.parse(t); id = j?.data?.publish?.id ?? j?.data?.result ? (() => { try { return JSON.parse(j.data.result)?.publish?.id ?? null; } catch { return null; } })() : null; } catch {}
    return JSON.parse(JSON.stringify({ status: r.status, body: t.slice(0, 800), id }));
  } catch (e) { return JSON.parse(JSON.stringify({ status: 0, body: String(e), id: null })); }
})()`, { timeoutMs: 30_000 });
console.log("publish:", r.status, r.body);
pinId = r.id;
// 兜底：从 body 里的 result JSON 串解析 id
if (!pinId) {
  try {
    const j = JSON.parse(r.body);
    pinId = JSON.parse(j.data.result)?.publish?.id ?? null;
  } catch {}
}
console.log("pinId:", pinId);
if (pinId) {
  const del = await evaluateScalar<number>(cdp, page.sessionId, `(async () => {
    const d = await fetch("https://www.zhihu.com/api/v4/pins/${pinId}", { method: "DELETE", credentials: "include" });
    return d.status;
  })()`, { timeoutMs: 15_000 });
  console.log("delete:", pinId, "→", del);
}
await cdp.send("Target.closeTarget", { targetId: page.targetId }).catch(() => {});
process.exit(0);
