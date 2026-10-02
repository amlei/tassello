import { CdpConnection, evaluateScalar, findExistingChromeDebugPort, resolveChromeProfileDir } from "@tassello/cdp";
const port = await findExistingChromeDebugPort({ profileDir: resolveChromeProfileDir() });
if (!port) { console.error("no chrome"); process.exit(1); }
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);
const targets = await cdp.send("Target.getTargets") as { targetInfos: any[] };
const pages = targets.targetInfos.filter((t) => t.type === "page" && t.url.includes("appmsg_edit"));
console.error("editor tabs:", pages.map((t) => t.url.match(/createType=(\d)/)?.[1]).join(","));
const want = process.argv[2];
const matches = pages.filter((t) => t.url.includes(`createType=${want}`));
const hit = matches[matches.length - 1]; // 取最新开的（旧 tab 是历史残留）
if (!hit) { console.error("no tab"); process.exit(1); }
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: hit.targetId, flatten: true }) as { sessionId: string };
const d = await evaluateScalar(cdp, sessionId, `JSON.parse(JSON.stringify({
  url: location.href.slice(70, 110),
  text: (document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 400),
  mmbiz: document.querySelectorAll("img[src*='mmbiz']").length,
  files: Array.from(document.querySelectorAll("input[type=file]")).map((f) => ({ accept: (f.accept||"").slice(0,40), files: f.files ? f.files.length : -1 })),
  dlg: ((document.querySelector(".audio_music_dialog_content") || {}).textContent || "").replace(/\\s+/g," ").slice(0, 250),
  dialogVisible: (() => { const d = document.querySelector(".weui-desktop-dialog__wrp"); return d ? d.offsetHeight : -1; })(),
}))`, { timeoutMs: 10000 });
console.log(JSON.stringify(d, null, 2));
process.exit(0);
