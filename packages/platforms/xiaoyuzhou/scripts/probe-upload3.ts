/* 探针 13：关掉欢迎弹层后再传音频，抓 console 异常与后续 API 调用
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou \
 *   bun packages/platforms/xiaoyuzhou/scripts/probe-upload3.ts <pid> <音频路径> */
import { withPage, evaluateScalar, type CdpConnection } from "@tassello/cdp";

const pid = process.argv[2] ?? "6aa0b3e56d64a2ee897188fd";
const audio = process.argv[3] ?? "/tmp/xyz-test.m4a";

await withPage("xiaoyuzhou-probe", { url: `https://podcaster.xiaoyuzhoufm.com/podcast/${pid}/episode/create`, keepOpen: false, activate: false }, async (cdp: CdpConnection, sid: string) => {
  const reqs = new Map<string, { method: string; url: string; body?: string; resp?: string }>();
  const errors: string[] = [];
  cdp.on("Network.requestWillBeSent", (p: unknown) => {
    const q = p as { requestId: string; request?: { url?: string; method?: string; postData?: string } };
    const u = q.request?.url ?? "";
    if (/(podcaster-api|upload\.qiniup|xyzcdn\.net\/v)/i.test(u) && !/sentry/.test(u)) {
      reqs.set(q.requestId, { method: q.request?.method ?? "", url: u.slice(0, 180), body: q.request?.postData?.slice(0, 800) });
    }
  });
  cdp.on("Network.loadingFailed", (p: unknown) => {
    const q = p as { requestId: string; errorText?: string };
    const r = reqs.get(q.requestId);
    if (r) errors.push(`FAILED ${r.method} ${r.url} ${q.errorText ?? ""}`);
  });
  cdp.on("Network.loadingFinished", (p: unknown) => {
    const q = p as { requestId: string };
    if (reqs.has(q.requestId)) {
      cdp.send("Network.getResponseBody", { requestId: q.requestId }, { sessionId: sid })
        .then((b: { body?: string }) => { const r = reqs.get(q.requestId); if (r) r.resp = String(b?.body ?? "").slice(0, 800); })
        .catch(() => {});
    }
  });
  cdp.on("Runtime.exceptionThrown", (p: unknown) => {
    const q = p as { exceptionDetails?: { text?: string; exception?: { description?: string } } };
    errors.push(`JS ${(q.exceptionDetails?.exception?.description ?? q.exceptionDetails?.text ?? "").slice(0, 300)}`);
  });
  await cdp.send("Network.enable", {}, { sessionId: sid });
  await cdp.send("Runtime.enable", {}, { sessionId: sid });

  await new Promise((r) => setTimeout(r, 8000));
  // 关欢迎弹层：「稍后再说」
  const dismissed = await evaluateScalar<boolean>(cdp, sid, `(() => { const b = Array.from(document.querySelectorAll("button")).find((x) => (x.innerText || "").trim() === "稍后再说"); if (b) { b.click(); return true; } return false; })()`, { timeoutMs: 10_000 });
  console.error("[probe] 欢迎弹层已关: " + dismissed);
  await new Promise((r) => setTimeout(r, 1500));

  await cdp.send("DOM.enable", {}, { sessionId: sid });
  const doc = (await cdp.send("DOM.getDocument", {}, { sessionId: sid })) as { root?: { nodeId?: number } };
  const q = (await cdp.send("DOM.querySelectorAll", { nodeId: doc.root?.nodeId, selector: "input[type=file]" }, { sessionId: sid })) as { nodeIds?: number[] };
  const inputs = q.nodeIds ?? [];
  console.error("[probe] file inputs 数量: " + inputs.length);
  await cdp.send("DOM.setFileInputFiles", { files: [audio], nodeId: inputs[0]! }, { sessionId: sid });
  console.error("[probe] 已塞入 input#0");

  for (let i = 0; i < 18; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const t = await evaluateScalar<string>(cdp, sid, `(() => ((document.body && document.body.innerText) || ""))()`, { timeoutMs: 10_000 });
    const head = t.slice(0, 260);
    console.error(`[probe t=${(i + 1) * 5}s] ${JSON.stringify(head)}`);
    if (/重新上传|上传完成|错误|失败/.test(t)) break;
  }
  const list = [...reqs.values()].filter((r) => r.method !== "OPTIONS" && r.url !== "https://podcaster-api.xiaoyuzhoufm.com/v1/profile/get");
  console.log(JSON.stringify({ apiCalls: list, errors }, null, 2));
});
process.exit(0);
