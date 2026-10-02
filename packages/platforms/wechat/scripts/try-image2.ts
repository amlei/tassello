/* 在活着的 ct8 tab 上验证：点添加区 → 新 input 出现 → setFileInputFiles → 第二张图落地 */
import { CdpConnection, evaluateScalar, findExistingChromeDebugPort, resolveChromeProfileDir } from "@tassello/cdp";
const port = await findExistingChromeDebugPort({ profileDir: resolveChromeProfileDir() });
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);
const targets = await cdp.send("Target.getTargets") as { targetInfos: any[] };
const pages = targets.targetInfos.filter((t) => t.type === "page" && t.url.includes("createType=8"));
const hit = pages[pages.length - 1];
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: hit.targetId, flatten: true }) as { sessionId: string };

const before = await evaluateScalar<{ inputs: number; mmbiz: number }>(cdp, sessionId, `JSON.parse(JSON.stringify({
  inputs: document.querySelectorAll("input[type=file]").length,
  mmbiz: document.querySelectorAll("img[src*='mmbiz']").length }))`, { timeoutMs: 10000 });
console.log("before:", JSON.stringify(before));

// 1) 点添加区（合成 click 足以触发 mp 建新 input；不需要真弹 chooser）
const clicked = await evaluateScalar<boolean>(cdp, sessionId, `(async () => {
  const cands = Array.from(document.querySelectorAll("div, a, button, span, p"))
    .filter((e) => e.offsetHeight > 24 && /选择或拖拽图片|添加图片|拖拽图片至此区域/.test((e.textContent || "").trim()))
    .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
  if (!cands.length) return false;
  cands[0].click();
  await new Promise((r) => setTimeout(r, 1200));
  return true;
})()`, { timeoutMs: 15000 });
const mid = await evaluateScalar<number>(cdp, sessionId, `document.querySelectorAll("input[type=file]").length`, { timeoutMs: 8000 });
console.log("clicked:", clicked, "inputs-after-click:", mid);

// 2) 把文件喂给最新（最后一个）bmp input
await cdp.send("DOM.enable", {}, { sessionId });
const doc = await cdp.send("DOM.getDocument", {}, { sessionId }) as any;
const q = await cdp.send("DOM.querySelectorAll", { nodeId: doc.root.nodeId, selector: "input[type=file]" }, { sessionId }) as any;
const nodes = q.nodeIds ?? [];
const pick = await evaluateScalar<number>(cdp, sessionId, `(() => {
  const files = Array.from(document.querySelectorAll("input[type=file]"));
  let hit = -1;
  files.forEach((f, i) => { if ((f.accept || "").indexOf("bmp") >= 0) hit = i; });
  return hit;
})()`, { timeoutMs: 8000 });
console.log("pick(last bmp):", pick, "of", nodes.length);
await cdp.send("DOM.setFileInputFiles", { files: ["/tmp/opencode/img2.png"], nodeId: nodes[pick] }, { sessionId });

// 3) 等第二张 mmbiz 出现
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const st = await evaluateScalar<{ mmbiz: number }>(cdp, sessionId, `JSON.parse(JSON.stringify({ mmbiz: document.querySelectorAll("img[src*='mmbiz']").length }))`, { timeoutMs: 8000 });
  if (st.mmbiz >= 2) { console.log("mmbiz=2 ✓ after", (i + 1) * 3, "s"); break; }
  if (i === 29) console.log("mmbiz still", st.mmbiz);
}
process.exit(0);
