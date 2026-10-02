/* 附到指定 URL 片段的已有标签页，dump 概要（调试用） */
import { CdpConnection, openPageSession, evaluateScalar } from "@tassello/cdp";
const match = process.argv[2] ?? "createType";
const port = await (await import("@tassello/cdp")).findExistingChromeDebugPort({ profileDir: (await import("@tassello/cdp")).resolveChromeProfileDir() });
if (!port) { console.error("no chrome"); process.exit(1); }
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);
const targets = await cdp.send("Target.getTargets") as { targetInfos: { targetId: string; url: string; title: string; type?: string }[] };
const hit = targets.targetInfos.find((t) => t.url.includes(match) && t.type === "page");
if (!hit) { console.error("no tab for", match); process.exit(1); }
console.error("tab:", hit.title, hit.url.slice(0, 100));
const s = await openPageSession({ cdp, reusing: false, matchTarget: () => false, url: "about:blank", enablePage: true, enableRuntime: true, activateTarget: false });
// 上面会开新页，改为直接 attach 已有 target
await cdp.send("Target.closeTarget", { targetId: s.targetId }).catch(() => {});
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: hit.targetId, flatten: true }) as { sessionId: string };
const d = await evaluateScalar(cdp, sessionId, `JSON.parse(JSON.stringify({
  url: location.href.slice(0, 110),
  text: (document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 500),
  files: Array.from(document.querySelectorAll("input[type=file]")).map((f) => ({ accept: f.accept, files: f.files ? f.files.length : -1 })),
  mmbizImgs: document.querySelectorAll("img[src*='mmbiz']").length,
  titleVal: document.querySelector("textarea#title")?.value || null,
}))`, { timeoutMs: 10000 });
console.log(JSON.stringify(d, null, 2));
process.exit(0);
