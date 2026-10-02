import { CdpConnection, evaluateScalar, findExistingChromeDebugPort, resolveChromeProfileDir } from "@tassello/cdp";
const port = await findExistingChromeDebugPort({ profileDir: resolveChromeProfileDir() });
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);
const targets = await cdp.send("Target.getTargets") as { targetInfos: any[] };
const pages = targets.targetInfos.filter((t) => t.type === "page" && t.url.includes("createType=8"));
const hit = pages[pages.length - 1];
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: hit.targetId, flatten: true }) as { sessionId: string };
const d = await evaluateScalar(cdp, sessionId, `JSON.parse(JSON.stringify({
  imgs: Array.from(document.querySelectorAll("img")).map((i) => ({ src: (i.src||"").slice(0, 90), w: i.offsetWidth })),
  counters: (document.body.innerText.match(/\\d+\\s*\\/\\s*20/) || [null])[0],
  versionText: ((document.querySelector("[class*=history], [class*=version]") || {}).textContent || "").replace(/\\s+/g," ").slice(0, 60),
}))`, { timeoutMs: 10000 });
console.log(JSON.stringify(d, null, 2));
process.exit(0);
