import { CdpConnection, findExistingChromeDebugPort, resolveChromeProfileDir } from "@tassello/cdp";
const port = await findExistingChromeDebugPort({ profileDir: resolveChromeProfileDir() })!;
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);
const targets = (await cdp.send("Target.getTargets") as any).targetInfos.filter((t: any) => t.type === "page" && t.url.includes("appmsgid=100002586"));
console.log("tabs:", targets.length);
const sid = (await cdp.send("Target.attachToTarget", { targetId: targets[0]!.targetId, flatten: true }) as any).sessionId;
const r = await cdp.send("Runtime.evaluate", {
  expression: `(() => {
    const pms = Array.from(document.querySelectorAll(".ProseMirror")).filter((e) => e.offsetHeight > 40);
    const body = pms.sort((a, b) => b.offsetHeight - a.offsetHeight)[0];
    return JSON.stringify({
      pmCount: pms.length,
      bodyLen: body ? body.offsetHeight : -1,
      text: body ? body.textContent.replace(/\\s+/g, "").slice(0, 40) : null,
      imgs: body ? body.querySelectorAll("img").length : -1,
    });
  })()`,
}, { sessionId: sid }) as any;
console.log(r.result.value);
process.exit(0);
