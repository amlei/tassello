/* 探针 14：真实点击「点击上传播客」区域 → 观察是否懒创建新的 file input → 对新 input 塞文件
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou \
 *   bun packages/platforms/xiaoyuzhou/scripts/probe-upload4.ts <pid> <音频路径> */
import { withPage, evaluateScalar, type CdpConnection } from "@tassello/cdp";

const pid = process.argv[2] ?? "6aa0b3e56d64a2ee897188fd";
const audio = process.argv[3] ?? "/tmp/xyz-test5.m4a";

await withPage("xiaoyuzhou-probe", { url: `https://podcaster.xiaoyuzhoufm.com/podcast/${pid}/episode/create`, keepOpen: false, activate: false }, async (cdp: CdpConnection, sid: string) => {
  const uploadUrls: string[] = [];
  cdp.on("Network.requestWillBeSent", (p: unknown) => {
    const q = p as { request?: { url?: string; method?: string } };
    const u = q.request?.url ?? "";
    if (/upload\.qiniup|hosted-resource|episode\/(create|draft)/i.test(u)) {
      uploadUrls.push(`${q.request?.method} ${u.slice(0, 160)}`);
    }
  });
  await cdp.send("Network.enable", {}, { sessionId: sid });

  await new Promise((r) => setTimeout(r, 8000));
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false }, { sessionId: sid });
  await cdp.send("DOM.enable", {}, { sessionId: sid });
  const countInputs = async () => {
    const doc = (await cdp.send("DOM.getDocument", {}, { sessionId: sid })) as { root?: { nodeId?: number } };
    const q = (await cdp.send("DOM.querySelectorAll", { nodeId: doc.root?.nodeId, selector: "input[type=file]" }, { sessionId: sid })) as { nodeIds?: number[] };
    return q.nodeIds ?? [];
  };
  let inputs = await countInputs();
  console.error("[probe] 点击前 file inputs: " + inputs.length);

  // 真实鼠标点击「点击上传播客」
  const pt = await evaluateScalar<[number, number] | null>(cdp, sid, `(() => {
    const el = Array.from(document.querySelectorAll("*")).find((e) => (e.textContent || "").trim() === "点击上传播客" && e.offsetParent !== null && e.children.length === 0);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
  })()`, { timeoutMs: 10_000 });
  console.error("[probe] 点击坐标: " + JSON.stringify(pt));
  if (!pt) throw new Error("未找到「点击上传播客」");
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt[0], y: pt[1] } as never, { sessionId: sid });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt[0], y: pt[1], button: "left", clickCount: 1, buttons: 1 } as never, { sessionId: sid });
  await new Promise((r) => setTimeout(r, 80));
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pt[0], y: pt[1], button: "left", clickCount: 1 } as never, { sessionId: sid });
  await new Promise((r) => setTimeout(r, 2500));

  const inputs2 = await countInputs();
  console.error("[probe] 点击后 file inputs: " + inputs2.length);
  const newInputs = inputs2.filter((id) => !inputs.includes(id));
  console.error("[probe] 新增 input: " + newInputs.length);
  const target = newInputs[0] ?? inputs2[inputs2.length - 1]!;
  // describe 新 input
  const n = await cdp.send("DOM.describeNode", { nodeId: target, depth: 1 }, { sessionId: sid }) as { node?: { attributes?: string[] } };
  console.error("[probe] 目标 input attrs: " + JSON.stringify(n.node?.attributes));
  await cdp.send("DOM.setFileInputFiles", { files: [audio], nodeId: target }, { sessionId: sid });
  console.error("[probe] 已塞入");

  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const t = await evaluateScalar<string>(cdp, sid, `(() => ((document.body && document.body.innerText) || ""))()`, { timeoutMs: 10_000 });
    console.error(`[probe t=${(i + 1) * 5}s] ${JSON.stringify(t.slice(0, 240))}`);
    if (/重新上传|时长|错误|失败|替换音频/.test(t)) break;
  }
  console.log(JSON.stringify({ uploadUrls: [...new Set(uploadUrls)] }, null, 2));
});
process.exit(0);
