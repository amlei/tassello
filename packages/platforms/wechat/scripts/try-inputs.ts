/* 在活的 ct8 tab 上逐个喂三个 image input，看哪个能出第二张图 */
import { CdpConnection, evaluateScalar, findExistingChromeDebugPort, resolveChromeProfileDir } from "@tassello/cdp";
const port = await findExistingChromeDebugPort({ profileDir: resolveChromeProfileDir() });
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);
const targets = await cdp.send("Target.getTargets") as { targetInfos: any[] };
const pages = targets.targetInfos.filter((t) => t.type === "page" && t.url.includes("createType=8"));
const hit = pages[pages.length - 1];
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: hit.targetId, flatten: true }) as { sessionId: string };
await cdp.send("DOM.enable", {}, { sessionId });
const doc = await cdp.send("DOM.getDocument", {}, { sessionId }) as any;
const q = await cdp.send("DOM.querySelectorAll", { nodeId: doc.root.nodeId, selector: "input[type=file]" }, { sessionId }) as any;
const nodes = q.nodeIds ?? [];
for (let i = 0; i < nodes.length; i++) {
  const before = await evaluateScalar<number>(cdp, sessionId, `document.querySelectorAll("img[src*='mmbiz']").length`, { timeoutMs: 8000 });
  await cdp.send("DOM.setFileInputFiles", { files: ["/tmp/opencode/img2.png"], nodeId: nodes[i] }, { sessionId });
  let after = before;
  for (let k = 0; k < 6; k++) {
    await new Promise((r) => setTimeout(r, 4000));
    after = await evaluateScalar<number>(cdp, sessionId, `document.querySelectorAll("img[src*='mmbiz']").length`, { timeoutMs: 8000 });
    if (after > before) break;
  }
  console.log(`input#${i}: mmbiz ${before} -> ${after} ${after > before ? "LIVE ✓" : "dead"}`);
  if (after > before) break;
}
process.exit(0);
