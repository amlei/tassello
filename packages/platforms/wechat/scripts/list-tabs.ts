import { CdpConnection, findExistingChromeDebugPort, resolveChromeProfileDir } from "@tassello/cdp";
const port = await findExistingChromeDebugPort({ profileDir: resolveChromeProfileDir() });
if (!port) { console.error("no chrome"); process.exit(1); }
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);
const targets = await cdp.send("Target.getTargets") as { targetInfos: any[] };
for (const t of targets.targetInfos.filter((t) => t.type === "page")) {
  const m = String(t.url).match(/createType=(\d)/);
  console.log("ct" + (m ? m[1] : "?"), t.targetId.slice(-6), String(t.url).slice(0, 80), "|", t.title);
}
process.exit(0);
