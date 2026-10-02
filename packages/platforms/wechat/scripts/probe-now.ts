import { CdpConnection, findExistingChromeDebugPort, resolveChromeProfileDir } from "@tassello/cdp";
const port = await findExistingChromeDebugPort({ profileDir: resolveChromeProfileDir() });
if (!port) { console.error("no chrome"); process.exit(1); }
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);
const targets = (await cdp.send("Target.getTargets") as any).targetInfos.filter((t: any) => t.type === "page");
for (const t of targets) {
  const sid = (await cdp.send("Target.attachToTarget", { targetId: t.targetId, flatten: true }) as any).sessionId;
  const info = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify({url: location.href.slice(0,110), title: document.title.slice(0,40), hasTitle: !!document.querySelector("textarea#title"), hasPM: !!document.querySelector(".ProseMirror"), scan: !!document.querySelector(".login__type__container__scan, #scan_qrcode"), bodyLen: document.body ? document.body.innerText.length : 0, head: document.body ? document.body.innerText.slice(0,80).replace(/\\n/g,'/') : ""})`,
  }, { sessionId: sid }) as any;
  console.log(info.result.value);
}
process.exit(0);
