import { CdpConnection, evaluateScalar, findExistingChromeDebugPort, resolveChromeProfileDir } from "@tassello/cdp";
const port = await findExistingChromeDebugPort({ profileDir: resolveChromeProfileDir() });
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);
const targets = await cdp.send("Target.getTargets") as { targetInfos: any[] };
const pages = targets.targetInfos.filter((t) => t.type === "page" && t.url.includes("createType=7"));
const hit = pages[pages.length - 1];
const sid2 = (await cdp.send("Target.attachToTarget", { targetId: hit.targetId, flatten: true }) as any).sessionId;
const d = await evaluateScalar(cdp, sid2, `(() => {
  const dlg = document.querySelector(".audio_music_dialog_content");
  const item = dlg ? dlg.querySelector(".audio_item_wrp") : null;
  return JSON.parse(JSON.stringify({
    dlgVisible: dlg ? dlg.offsetHeight : -1,
    itemHtml: item ? item.outerHTML.slice(0, 900) : null,
    checked: dlg ? dlg.querySelectorAll("input[type=checkbox]:checked").length : -1,
    footer: ((document.querySelector(".weui-desktop-dialog__ft") || {}).textContent || "").replace(/\\s+/g, " ").slice(0, 100),
  }));
})()`, { timeoutMs: 10000 });
console.log(JSON.stringify(d, null, 2));
process.exit(0);
