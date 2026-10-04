/* 诊断：附着现有 probe Chrome，dump 所有 create 页签的正文片段（只读） */
import { CdpConnection } from "@tassello/cdp";

const port = Number(process.argv[2] ?? 49557);
const res = await fetch(`http://127.0.0.1:${port}/json/version`);
const { webSocketDebuggerUrl } = (await res.json()) as { webSocketDebuggerUrl: string };
const cdp = await CdpConnection.connect(webSocketDebuggerUrl, 10_000);
const targets = (await cdp.send("Target.getTargets", {})) as { targetInfos?: { targetId: string; type: string; url: string }[] };
for (const t of targets.targetInfos ?? []) {
  if (t.type !== "page" || !t.url.includes("episode/create")) continue;
  const s = await cdp.send("Target.attachToTarget", { targetId: t.targetId, flatten: true }) as { sessionId: string };
  const text = await cdp.send("Runtime.evaluate", {
    expression: `((document && document.body && document.body.innerText) || "").slice(0, 700)`,
    returnByValue: true,
  }, { sessionId: s.sessionId }) as { result?: { value?: string } };
  console.log("=== tab", t.url.slice(-20), "===\n" + text.result?.value);
}
process.exit(0);
