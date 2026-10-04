/* 探针 12：对着第 2 个 file input（资源库上传口）塞音频，全量记录 60s 内 API 请求与响应
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou \
 *   bun packages/platforms/xiaoyuzhou/scripts/probe-upload2.ts <pid> <音频路径> */
import { withPage, evaluateScalar, type CdpConnection } from "@tassello/cdp";

const pid = process.argv[2] ?? "6aa0b3e56d64a2ee897188fd";
const audio = process.argv[3] ?? "/tmp/xyz-test.m4a";

await withPage("xiaoyuzhou-probe", { url: `https://podcaster.xiaoyuzhoufm.com/podcast/${pid}/episode/create`, keepOpen: false, activate: false }, async (cdp: CdpConnection, sid: string) => {
  const reqs = new Map<string, { method: string; url: string; body?: string; resp?: string }>();
  cdp.on("Network.requestWillBeSent", (p: unknown) => {
    const q = p as { requestId: string; request?: { url?: string; method?: string; postData?: string } };
    const u = q.request?.url ?? "";
    if (/(podcaster-api|upload\.qiniup|upload\.xyzcdn|qo0\.me)/i.test(u) && !/sentry/.test(u)) {
      reqs.set(q.requestId, { method: q.request?.method ?? "", url: u.slice(0, 180), body: q.request?.postData?.slice(0, 500) });
    }
  });
  cdp.on("Network.loadingFinished", (p: unknown) => {
    const q = p as { requestId: string };
    if (reqs.has(q.requestId)) {
      cdp.send("Network.getResponseBody", { requestId: q.requestId }, { sessionId: sid })
        .then((b: { body?: string }) => { const r = reqs.get(q.requestId); if (r) r.resp = String(b?.body ?? "").slice(0, 400); })
        .catch(() => {});
    }
  });
  await cdp.send("Network.enable", {}, { sessionId: sid });

  await new Promise((r) => setTimeout(r, 8000));
  await cdp.send("DOM.enable", {}, { sessionId: sid });
  const doc = (await cdp.send("DOM.getDocument", {}, { sessionId: sid })) as { root?: { nodeId?: number } };
  const q = (await cdp.send("DOM.querySelectorAll", { nodeId: doc.root?.nodeId, selector: "input[type=file]" }, { sessionId: sid })) as { nodeIds?: number[] };
  const inputs = q.nodeIds ?? [];
  const target = inputs[2] ?? inputs[inputs.length - 1]!;
  await cdp.send("DOM.setFileInputFiles", { files: [audio], nodeId: target }, { sessionId: sid });
  console.error("[probe] 已塞入 input#" + (inputs.indexOf(target)));

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const t = await evaluateScalar<string>(cdp, sid, `(() => ((document.body && document.body.innerText) || ""))()`, { timeoutMs: 10_000 });
    console.error(`[probe t=${(i + 1) * 5}s] 片段: ${JSON.stringify(t.slice(0, 400))}`);
    if (/重新上传|上传完成|时长|上传中/.test(t)) {
      console.error("[probe] 检测到上传状态标记，等 10s 再收尾");
      await new Promise((r) => setTimeout(r, 10_000));
      break;
    }
  }
  const list = [...reqs.values()].filter((r) => r.method !== "OPTIONS");
  console.log(JSON.stringify({ apiCalls: list }, null, 2));
});
process.exit(0);
