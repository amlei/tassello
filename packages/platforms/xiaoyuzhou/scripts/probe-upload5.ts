/* 探针 15：打开上传播客面板后，按 accept 特征找音频 file input 塞文件，观察上传完成后的 DOM/API
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou \
 *   bun packages/platforms/xiaoyuzhou/scripts/probe-upload5.ts <pid> <音频路径> */
import { withPage, evaluateScalar, type CdpConnection } from "@tassello/cdp";

const pid = process.argv[2] ?? "6aa0b3e56d64a2ee897188fd";
const audio = process.argv[3] ?? "/tmp/xyz-test5.m4a";

await withPage("xiaoyuzhou-probe", { url: `https://podcaster.xiaoyuzhoufm.com/podcast/${pid}/episode/create`, keepOpen: false, activate: false }, async (cdp: CdpConnection, sid: string) => {
  const reqs = new Map<string, { method: string; url: string; body?: string; resp?: string }>();
  cdp.on("Network.requestWillBeSent", (p: unknown) => {
    const q = p as { requestId: string; request?: { url?: string; method?: string; postData?: string } };
    const u = q.request?.url ?? "";
    if (/(podcaster-api|upload\.qiniup)/i.test(u) && !/sentry/.test(u)) {
      reqs.set(q.requestId, { method: q.request?.method ?? "", url: u.slice(0, 180), body: q.request?.postData?.slice(0, 600) });
    }
  });
  cdp.on("Network.loadingFinished", (p: unknown) => {
    const q = p as { requestId: string };
    if (reqs.has(q.requestId)) {
      cdp.send("Network.getResponseBody", { requestId: q.requestId }, { sessionId: sid })
        .then((b: { body?: string }) => { const r = reqs.get(q.requestId); if (r) r.resp = String(b?.body ?? "").slice(0, 600); })
        .catch(() => {});
    }
  });
  await cdp.send("Network.enable", {}, { sessionId: sid });

  await new Promise((r) => setTimeout(r, 8000));
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false }, { sessionId: sid });
  await cdp.send("DOM.enable", {}, { sessionId: sid });
  // 真实点击「点击上传播客」
  const pt = await evaluateScalar<[number, number] | null>(cdp, sid, `(() => {
    const el = Array.from(document.querySelectorAll("*")).find((e) => (e.textContent || "").trim() === "点击上传播客" && e.offsetParent !== null && e.children.length === 0);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
  })()`, { timeoutMs: 10_000 });
  if (!pt) throw new Error("未找到「点击上传播客」");
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt[0], y: pt[1] } as never, { sessionId: sid });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt[0], y: pt[1], button: "left", clickCount: 1, buttons: 1 } as never, { sessionId: sid });
  await new Promise((r) => setTimeout(r, 80));
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pt[0], y: pt[1], button: "left", clickCount: 1 } as never, { sessionId: sid });
  await new Promise((r) => setTimeout(r, 2500));

  // 枚举 file inputs（带父容器特征），找音频口：面板里 "WAV / MP3 / M4A" 文案附近的 input
  const cands = await evaluateScalar<{ i: number; accept: string; near: string }[]>(cdp, sid, `(() => {
    return Array.from(document.querySelectorAll("input[type=file]")).map((el, i) => {
      let p = el; let near = "";
      for (let k = 0; k < 6 && p; k++) { p = p.parentElement; if (!p) break; const t = (p.innerText || ""); if (t && t.length < 300) { near = t.replace(/\\n/g, "|").slice(0, 200); break; } }
      return { i, accept: el.getAttribute("accept") || "", near };
    });
  })()`, { timeoutMs: 10_000 });
  console.error("[probe] file inputs: " + JSON.stringify(cands, null, 1));
  const audioIdx = cands.find((c) => /audio/i.test(c.accept)) ?? cands.find((c) => /WAV|M4A|拖拽/i.test(c.near) && !/image/i.test(c.accept));
  if (!audioIdx) throw new Error("未定位音频 file input：" + JSON.stringify(cands));
  console.error("[probe] 选定 input#" + audioIdx.i + " accept=" + audioIdx.accept);

  const doc = (await cdp.send("DOM.getDocument", {}, { sessionId: sid })) as { root?: { nodeId?: number } };
  const q = (await cdp.send("DOM.querySelectorAll", { nodeId: doc.root?.nodeId, selector: "input[type=file]" }, { sessionId: sid })) as { nodeIds?: number[] };
  await cdp.send("DOM.setFileInputFiles", { files: [audio], nodeId: q.nodeIds![audioIdx.i]! }, { sessionId: sid });
  console.error("[probe] 已塞入音频，等上传…");

  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const t = await evaluateScalar<string>(cdp, sid, `(() => ((document.body && document.body.innerText) || ""))()`, { timeoutMs: 10_000 });
    console.error(`[probe t=${(i + 1) * 5}s] ${JSON.stringify(t.slice(0, 300))}`);
    if (/重新上传|替换|错误|失败/.test(t)) break;
  }
  const list = [...reqs.values()].filter((r) => r.method !== "OPTIONS");
  console.log(JSON.stringify({ apiCalls: list }, null, 2));
});
process.exit(0);
