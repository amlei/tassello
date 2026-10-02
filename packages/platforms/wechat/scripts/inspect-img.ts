import { CdpConnection, openPageSession, evaluateScalar, findExistingChromeDebugPort, resolveChromeProfileDir } from "@tassello/cdp";
const port = await findExistingChromeDebugPort({ profileDir: resolveChromeProfileDir() });
if (!port) { console.error("no chrome"); process.exit(1); }
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);
const targets = await cdp.send("Target.getTargets") as { targetInfos: { targetId: string; url: string; title: string; type?: string }[] };
const hit = targets.targetInfos.find((t) => t.url.includes(process.argv[2] ?? "createType=8") && t.type === "page");
if (!hit) { console.error("no tab"); process.exit(1); }
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: hit.targetId, flatten: true }) as { sessionId: string };
const d = await evaluateScalar(cdp, sessionId, `JSON.parse(JSON.stringify({
  imgs: Array.from(document.querySelectorAll("img")).map((i) => ({ src: (i.src||"").slice(0, 80), cls: (i.className||"").slice(0,40), w: i.offsetWidth })).filter((x) => x.src.indexOf("mmbiz") >= 0 || x.cls.indexOf("thumb") >= 0 || x.w > 30),
  counter: (document.body.innerText.match(/\\d+\\/20/) || [null])[0],
  descText: (Array.from(document.querySelectorAll(".ProseMirror")).map((e) => e.textContent.slice(0, 30))),
}))`, { timeoutMs: 10000 });
console.log(JSON.stringify(d, null, 2));
process.exit(0);
