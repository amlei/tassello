/* ct8 活页：真实鼠标点击添加区 → 轮询新 input → 喂文件 → 等 mmbiz */
import { CdpConnection, evaluateScalar, findExistingChromeDebugPort, resolveChromeProfileDir } from "@tassello/cdp";
const port = await findExistingChromeDebugPort({ profileDir: resolveChromeProfileDir() });
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);
const targets = await cdp.send("Target.getTargets") as { targetInfos: any[] };
const pages = targets.targetInfos.filter((t) => t.type === "page" && t.url.includes("createType=8"));
const hit = pages[pages.length - 1];
const sid2 = (await cdp.send("Target.attachToTarget", { targetId: hit.targetId, flatten: true }) as any).sessionId;

const before = await evaluateScalar<{ inputs: number; mmbiz: number }>(cdp, sid2, `JSON.parse(JSON.stringify({
  inputs: document.querySelectorAll("input[type=file]").length,
  mmbiz: document.querySelectorAll("img[src*='mmbiz']").length }))`, { timeoutMs: 10000 });
console.log("before:", JSON.stringify(before));

const rect = await evaluateScalar<{ x: number; y: number; w: number; h: number } | null>(cdp, sid2, `(async () => {
  const cands = Array.from(document.querySelectorAll("div, a, button, span, p"))
    .filter((e) => e.offsetHeight > 20 && e.offsetHeight < 400 && /选择或拖拽图片|添加图片|拖拽图片至此区域|\\+/.test((e.textContent || "").trim()))
    .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
  if (!cands.length) return null;
  const el = cands[0];
  el.scrollIntoView({ block: "center" });
  await new Promise((r) => setTimeout(r, 600));
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
})()`, { timeoutMs: 20000 });
console.log("rect:", JSON.stringify(rect));
if (rect && rect.w > 0) {
  const cx = Math.round(rect.x + rect.w / 2), cy = Math.round(rect.y + rect.h / 2);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx, y: cy }, { sessionId: sid2 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1 }, { sessionId: sid2 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "left", clickCount: 1 }, { sessionId: sid2 });
  await new Promise((r) => setTimeout(r, 2500));
  const mid = await evaluateScalar<number>(cdp, sid2, `document.querySelectorAll("input[type=file]").length`, { timeoutMs: 8000 });
  console.log("inputs-after-trusted-click:", mid);
  if (mid > before.inputs) {
    await cdp.send("DOM.enable", {}, { sessionId: sid2 });
    const doc = await cdp.send("DOM.getDocument", {}, { sessionId: sid2 }) as any;
    const q = await cdp.send("DOM.querySelectorAll", { nodeId: doc.root.nodeId, selector: "input[type=file]" }, { sessionId: sid2 }) as any;
    const nodes = q.nodeIds ?? [];
    await cdp.send("DOM.setFileInputFiles", { files: ["/tmp/opencode/img2.png"], nodeId: nodes[nodes.length - 1] }, { sessionId: sid2 });
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const m = await evaluateScalar<number>(cdp, sid2, `document.querySelectorAll("img[src*='mmbiz']").length`, { timeoutMs: 8000 });
      if (m > before.mmbiz) { console.log("mmbiz", before.mmbiz, "->", m, "✓"); break; }
      if (i === 19) console.log("mmbiz still", m);
    }
  }
}
process.exit(0);
