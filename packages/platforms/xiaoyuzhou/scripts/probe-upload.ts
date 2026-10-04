/* 探针 9：真机上传播客音频（file input + DOM.setFileInputFiles），记录上传链路 API 与上传完成后的 DOM 变化
 * 只填标题不上传发布。用法：
 *   TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou \
 *   bun packages/platforms/xiaoyuzhou/scripts/probe-upload.ts <pid> <音频路径> */
import { withPage, evaluateScalar, type CdpConnection } from "@tassello/cdp";

const pid = process.argv[2] ?? "6632421e4b7d3b5d3b9b519f";
const audio = process.argv[3] ?? "/tmp/xyz-test.m4a";

await withPage("xiaoyuzhou-probe", { url: `https://podcaster.xiaoyuzhoufm.com/podcast/${pid}/episode/create`, keepOpen: false, activate: false }, async (cdp: CdpConnection, sid: string) => {
  const apiReqs: string[] = [];
  const respBodies = new Map<string, string>();
  cdp.on("Network.requestWillBeSent", (p: unknown) => {
    const q = p as { requestId: string; request?: { url?: string; method?: string } };
    const u = q.request?.url ?? "";
    if (/podcaster-api|xyzcdn|upload|qiniu|cos|oss/i.test(u) && !/sentry/.test(u)) {
      apiReqs.push(`${q.request?.method} ${u.slice(0, 180)}`);
      respBodies.set(q.requestId, "");
    }
  });
  cdp.on("Network.loadingFinished", (p: unknown) => {
    const q = p as { requestId: string };
    if (respBodies.has(q.requestId)) {
      cdp.send("Network.getResponseBody", { requestId: q.requestId }, { sessionId: sid })
        .then((b: { body?: string }) => respBodies.set(q.requestId, String(b?.body ?? "").slice(0, 500)))
        .catch(() => {});
    }
  });
  await cdp.send("Network.enable", {}, { sessionId: sid });

  await new Promise((res) => setTimeout(res, 8000));
  // 关引导弹层（存在才点）
  await evaluateScalar<boolean>(cdp, sid, `(() => { const b = Array.from(document.querySelectorAll("button")).find((x) => (x.innerText || "").trim() === "我知道了"); if (b) { b.click(); return true; } return false; })()`, { timeoutMs: 10_000 }).catch(() => false);

  // 第一个 file input = 播客音频
  await cdp.send("DOM.enable", {}, { sessionId: sid });
  const doc = (await cdp.send("DOM.getDocument", {}, { sessionId: sid })) as { root?: { nodeId?: number } };
  const q = (await cdp.send("DOM.querySelectorAll", { nodeId: doc.root?.nodeId, selector: "input[type=file]" }, { sessionId: sid })) as { nodeIds?: number[] };
  const inputs = q.nodeIds ?? [];
  if (!inputs.length) throw new Error("未找到上传入口");
  await cdp.send("DOM.setFileInputFiles", { files: [audio], nodeId: inputs[0] }, { sessionId: sid });
  console.error("[probe] 音频已塞入 file input，等上传…");

  // 轮询 60s 看上传进度与 DOM 变化
  for (let i = 0; i < 20; i++) {
    await new Promise((res) => setTimeout(res, 4000));
    const s = await evaluateScalar<Record<string, unknown>>(
      cdp,
      sid,
      `(() => JSON.parse(JSON.stringify({
        text: ((document.body && document.body.innerText) || "").slice(0, 800),
        buttons: Array.from(document.querySelectorAll("button")).map((b) => (b.innerText || "").trim()).filter(Boolean),
      })))()`,
      { timeoutMs: 10_000 },
    );
    console.error(`[probe t=${(i + 1) * 4}s]`, JSON.stringify(s));
    const t = JSON.stringify(s);
    if (t.includes("重新上传") || t.includes("上传完成") || (t.includes("创建") && !t.includes("点击上传播客"))) break;
  }
  console.log(JSON.stringify({ apiReqs: [...new Set(apiReqs)], bodies: [...respBodies.entries()].filter(([, v]) => v).map(([k, v]) => ({ id: k, body: v })) }, null, 2));
});
process.exit(0);
