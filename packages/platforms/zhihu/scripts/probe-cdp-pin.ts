/* 探针（回退参考）：接口通道失效时，CDP 真实点击驱动创作平台「发想法」UI 链路。
 * 2026-10-02 真机验证可行：点「发想法」按钮 → 弹窗（标题 textarea + Draft.js 编辑器）
 * → 真实鼠标点编辑器 + Input.insertText → 点「发布」。独立 Chrome（端口 9342，probe-profiles/zhihu）。
 * 用法：bun packages/platforms/zhihu/scripts/probe-cdp-pin.ts
 */
import { CdpConnection, openPageSession, waitForChromeDebugPort, sleep, evaluateScalar } from "@tassello/cdp";
const ws = await waitForChromeDebugPort(9342, 10_000);
const cdp = await CdpConnection.connect(ws, 15_000);
const s = await openPageSession({ cdp, reusing: true, url: "https://www.zhihu.com/creator", matchTarget: () => false, enablePage: true, enableRuntime: true, enableNetwork: true });
const sid = s.sessionId;
await sleep(6_000);
const clickAt = async (x: number, y: number) => {
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 }, { sessionId: sid });
  await sleep(80);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 }, { sessionId: sid });
};
// 点「发想法」入口按钮（坐标需按实际窗口取，探针打印后人工确认）
const btn = await evaluateScalar<{ x: number; y: number } | null>(cdp, sid, `(() => {
  const b = Array.from(document.querySelectorAll("button")).find(x => /发想法/.test((x.textContent||"").trim()) && x.getBoundingClientRect().width > 0);
  if (!b) return null; const r = b.getBoundingClientRect();
  return JSON.parse(JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }));
})()`, { timeoutMs: 15_000 });
console.log("入口按钮:", btn);
if (!btn) process.exit(1);
await clickAt(btn.x, btn.y);
await sleep(4_000);
// 弹窗编辑器（真实点击 Draft 编辑器 → insertText；insertText 前必须已聚焦）
const ed = await evaluateScalar<{ x: number; y: number; w: number; h: number } | null>(cdp, sid, `(() => {
  const e = document.querySelector(".public-DraftEditor-content");
  if (!e) return null; const r = e.getBoundingClientRect();
  if (r.width < 50) return null;
  return JSON.parse(JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }));
})()`, { timeoutMs: 15_000 });
console.log("弹窗编辑器:", ed);
if (!ed) process.exit(1);
await clickAt(ed.x + ed.w / 2, ed.y + Math.min(20, ed.h / 2));
await sleep(600);
await cdp.send("Input.insertText", { text: "[tassello 探针] CDP 回退链路验证（未自动发布，请人工处理）" }, { sessionId: sid });
await sleep(2_000);
const state = await evaluateScalar<string>(cdp, sid, `(() => {
  const pub = Array.from(document.querySelectorAll("button")).find(b => (b.textContent||"").trim() === "发布" && b.getBoundingClientRect().width > 0);
  return JSON.stringify({ editorText: document.querySelector(".public-DraftEditor-content")?.textContent?.slice(0, 50), pubDisabled: pub?.disabled ?? null });
})()`, { timeoutMs: 15_000 });
console.log("state:", state);
console.log("（探针到此为止：不点发布，内容留在弹窗里，关掉标签页即可丢弃）");
process.exit(0);
