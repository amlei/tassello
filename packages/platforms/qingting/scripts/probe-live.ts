/* 探针：直连应用专用 profile 那个正在运行的 Chrome（调试端口 63168），开新标签访问 channels 页，
 * 验证登录态并抓 performance 请求清单。端口可用 LIVE_PORT 覆盖。 */
import { CdpConnection, openPageSession, evaluateScalar } from "@tassello/cdp";
const port = process.env.LIVE_PORT || "63168";
const cdp = await CdpSession();
async function CdpSession() {
  const res = await fetch(`http://127.0.0.1:${port}/json/version`);
  const j = await res.json() as { webSocketDebuggerUrl: string };
  return CdpConnection.connect(j.webSocketDebuggerUrl, 15_000);
}
const { sessionId } = await openPageSession({ cdp, url: "https://admin.qingting.fm/content/channels", reusing: true, enableRuntime: true });
await new Promise((r) => setTimeout(r, 6_000));
const out = await evaluateScalar(cdp, sessionId, `JSON.parse(JSON.stringify({
  url: location.href,
  bodyText: (document.body?.innerText||"").slice(0, 2000),
  reqs: performance.getEntriesByType("resource").map(e=>e.name).filter(u=>!/\\.(js|css|png|jpg|svg|woff|gif|ico)/.test(u)).slice(0,60),
}))`, { timeoutMs: 20_000 });
console.log(JSON.stringify(out, null, 2));
await cdp.send("Target.closeTarget", { targetId: (await cdp.send("Target.getTargets")).targetInfos.find((t: {targetId: string}) => t.targetId)?.targetId }).catch(()=>{});
process.exit(0);
