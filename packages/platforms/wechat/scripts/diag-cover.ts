/* 诊断：观察「从图片库选择」对话框在喂文件后的变化（跑一次喂入 + 30s 轮询） */
import { CdpConnection, findExistingChromeDebugPort, resolveChromeProfileDir } from "@tassello/cdp";
import path from "node:path";

const port = await findExistingChromeDebugPort({ profileDir: resolveChromeProfileDir() });
if (!port) { console.error("no chrome"); process.exit(1); }
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);
const targets = (await cdp.send("Target.getTargets") as any).targetInfos.filter((t: any) => t.type === "page" && t.url.includes("appmsgid=100002526"));
if (!targets.length) { console.error("no editor tab"); process.exit(1); }
const sid = (await cdp.send("Target.attachToTarget", { targetId: targets[0]!.targetId, flatten: true }) as any).sessionId;
await cdp.send("DOM.enable", {}, { sessionId: sid });

const coverPath = "/Users/amlei/Data/files/自媒体/文章/图书/苍蝇效应/05-第4章-伴随之蝇/配图/cover-image/cover.png";

const dump = async (label: string) => {
  const r = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const dlg = Array.from(document.querySelectorAll(".weui-desktop-dialog__wrp, .weui-desktop-dialog")).filter((d) => d.offsetHeight > 0 && d.getBoundingClientRect().width > 300)[0];
      if (!dlg) return "NO_DIALOG";
      const imgs = Array.from(dlg.querySelectorAll("img")).map((i) => (i.src || "").slice(0, 70));
      const btns = Array.from(dlg.querySelectorAll("button, a.weui-desktop-btn, .weui-desktop-btn")).filter((b) => b.offsetHeight > 0).map((b) => (b.textContent || "").trim()).slice(0, 12);
      const tabs = Array.from(dlg.querySelectorAll("a, li, span, div")).filter((e) => e.offsetHeight > 0 && /^(上传|本地上传|图库|正文图片)$/.test((e.textContent || "").trim())).map((e) => (e.textContent || "").trim());
      const cls = String(dlg.className).slice(0, 80);
      return JSON.stringify({ cls, text: (dlg.textContent || "").replace(/\\s+/g, " ").slice(0, 200), imgs, btns, tabs });
    })()`,
    awaitPromise: true,
  }, { sessionId: sid }) as any;
  console.log(`[${label}]`, r?.result?.value);
};

const feed = async () => {
  await cdp.send("DOM.getDocument", {}, { sessionId: sid });
  const q = (await cdp.send("DOM.querySelectorAll", { nodeId: 1 ? (await cdp.send("DOM.getDocument", {}, { sessionId: sid }) as any).root.nodeId : 0, selector: "input[type=file]" }, { sessionId: sid })) as any;
  const pick = await cdp.send("Runtime.evaluate", {
    expression: `(() => { const files = Array.from(document.querySelectorAll("input[type=file]")); let bmp = -1; files.forEach((f, i) => { if ((f.accept||"").indexOf("bmp") >= 0) bmp = i; }); return bmp; })()`,
  }, { sessionId: sid }) as any;
  const idx = pick.result.value;
  if (idx < 0 || idx >= q.nodeIds.length) { console.log("no input idx", idx, q.nodeIds); return false; }
  await cdp.send("DOM.setFileInputFiles", { files: [coverPath], nodeId: q.nodeIds[idx] }, { sessionId: sid });
  console.log("fed input#", idx);
  return true;
};

// 确保对话框打开：点 js_imagedialog
await cdp.send("Runtime.evaluate", { expression: `document.querySelector("a.js_imagedialog")?.click(); "ok"` }, { sessionId: sid });
await new Promise((r) => setTimeout(r, 2000));
await dump("open");

if (await feed()) {
  for (const ms of [3000, 6000, 10000, 15000]) {
    await new Promise((r) => setTimeout(r, ms));
    await dump(`t+${ms}`);
  }
}
process.exit(0);
