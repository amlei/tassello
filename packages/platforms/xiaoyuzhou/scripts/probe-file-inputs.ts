/* 探针 11：逐个 file input 试传，找出音频上传的真实入口
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou \
 *   bun packages/platforms/xiaoyuzhou/scripts/probe-file-inputs.ts <pid> <音频路径> */
import { withPage, evaluateScalar, type CdpConnection } from "@tassello/cdp";

const pid = process.argv[2] ?? "6aa0b3e56d64a2ee897188fd";
const audio = process.argv[3] ?? "/tmp/xyz-test.m4a";

await withPage("xiaoyuzhou-probe", { url: `https://podcaster.xiaoyuzhoufm.com/podcast/${pid}/episode/create`, keepOpen: false, activate: false }, async (cdp: CdpConnection, sid: string) => {
  const uploadUrls: string[] = [];
  cdp.on("Network.requestWillBeSent", (p: unknown) => {
    const q = p as { request?: { url?: string; method?: string } };
    const u = q.request?.url ?? "";
    if (/upload|xyzcdn\.net\/v1|credential|token/i.test(u) && !/sentry|static\.|image\./.test(u)) {
      uploadUrls.push(`${q.request?.method} ${u.slice(0, 200)}`);
    }
  });
  await cdp.send("Network.enable", {}, { sessionId: sid });

  await new Promise((r) => setTimeout(r, 8000));
  await cdp.send("DOM.enable", {}, { sessionId: sid });
  const doc = (await cdp.send("DOM.getDocument", { depth: -1 }, { sessionId: sid })) as { root?: { nodeId?: number } };
  const q = (await cdp.send("DOM.querySelectorAll", { nodeId: doc.root?.nodeId, selector: "input[type=file]" }, { sessionId: sid })) as { nodeIds?: number[] };
  const inputs = q.nodeIds ?? [];
  const metas: { idx: number; html: string }[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const n = await cdp.send("DOM.describeNode", { nodeId: inputs[i]!, depth: 2 }, { sessionId: sid }) as { node?: { attributes?: string[]; nodeName?: string; parentNode?: { nodeName?: string; attributes?: string[] } } };
    metas.push({ idx: i, html: JSON.stringify({ attrs: n.node?.attributes, parent: n.node?.parentNode?.attributes }).slice(0, 400) });
  }
  console.error("[probe] file inputs:\n" + metas.map((m) => `${m.idx}: ${m.html}`).join("\n"));

  for (let i = 0; i < inputs.length; i++) {
    console.error(`[probe] --- 试第 ${i} 个 file input ---`);
    await cdp.send("DOM.setFileInputFiles", { files: [audio], nodeId: inputs[i]! }, { sessionId: sid });
    await new Promise((r) => setTimeout(r, 6000));
    const t = await evaluateScalar<string>(cdp, sid, `(() => ((document.body && document.body.innerText) || "").slice(0, 600))()`, { timeoutMs: 10_000 });
    console.error(`[probe] 页面文本: ${JSON.stringify(t.slice(0, 300))}\n[probe] 上传相关请求: ${JSON.stringify(uploadUrls)}`);
    if (uploadUrls.length) break;
  }
  console.log(JSON.stringify({ uploadUrls }, null, 2));
});
process.exit(0);
