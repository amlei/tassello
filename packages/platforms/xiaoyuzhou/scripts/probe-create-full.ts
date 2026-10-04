/* 探针 10：单集创建全链路探测——上传音频 → 填标题 → 找「存草稿」按钮 → 点掉
 * 记录每步的 DOM 结构与 podcaster-api 请求（含响应体片段），作为适配器实现证据。
 * 红线：最多到存草稿，绝不点发布。
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou \
 *   bun packages/platforms/xiaoyuzhou/scripts/probe-create-full.ts <pid> <音频路径> */
import { withPage, evaluateScalar, type CdpConnection } from "@tassello/cdp";

const pid = process.argv[2] ?? "6aa0b3e56d64a2ee897188fd";
const audio = process.argv[3] ?? "/tmp/xyz-test.m4a";

await withPage("xiaoyuzhou-probe", { url: `https://podcaster.xiaoyuzhoufm.com/podcast/${pid}/episode/create`, keepOpen: false, activate: false }, async (cdp: CdpConnection, sid: string) => {
  const reqs = new Map<string, { method: string; url: string; body?: string; status?: number; resp?: string }>();
  cdp.on("Network.requestWillBeSent", (p: unknown) => {
    const q = p as { requestId: string; request?: { url?: string; method?: string; postData?: string } };
    const u = q.request?.url ?? "";
    if (/podcaster-api|xyzcdn/i.test(u) && !/sentry/.test(u)) {
      reqs.set(q.requestId, { method: q.request?.method ?? "", url: u.slice(0, 160), body: q.request?.postData?.slice(0, 400) });
    }
  });
  cdp.on("Network.loadingFinished", (p: unknown) => {
    const q = p as { requestId: string };
    if (reqs.has(q.requestId)) {
      cdp.send("Network.getResponseBody", { requestId: q.requestId }, { sessionId: sid })
        .then((b: { body?: string }) => { const r = reqs.get(q.requestId); if (r) r.resp = String(b?.body ?? "").slice(0, 500); })
        .catch(() => {});
    }
  });
  await cdp.send("Network.enable", {}, { sessionId: sid });

  const dump = (tag: string) => `
    (() => JSON.parse(JSON.stringify({
      tag: ${JSON.stringify(tag)},
      url: location.href,
      buttons: Array.from(document.querySelectorAll("button")).map((b) => ({ text: (b.innerText || "").trim(), disabled: b.disabled })).filter((x) => x.text),
      inputs: Array.from(document.querySelectorAll("input")).map((i) => ({ type: i.type, placeholder: i.placeholder || null, value: (i.value || "").slice(0, 60), visible: !!i.offsetParent })),
      textareas: Array.from(document.querySelectorAll("textarea")).map((t) => ({ placeholder: t.placeholder || null, visible: !!t.offsetParent })),
      editables: Array.from(document.querySelectorAll("[contenteditable='true']")).map((e) => ({ cls: String(e.className).slice(0, 60), ph: e.getAttribute("data-placeholder") })),
      text: ((document.body && document.body.innerText) || "").slice(0, 1000),
    })))()`;

  await new Promise((r) => setTimeout(r, 8000));
  // 关引导弹层（存在才点）
  await evaluateScalar<boolean>(cdp, sid, `(() => { const b = Array.from(document.querySelectorAll("button")).find((x) => ["我知道了","知道了","下一步"].includes((x.innerText||"").trim())); if (b) { b.click(); return true; } return false; })()`, { timeoutMs: 10_000 }).catch(() => false);
  await new Promise((r) => setTimeout(r, 1000));

  const s0 = await evaluateScalar<Record<string, unknown>>(cdp, sid, dump("after-load"), { timeoutMs: 15_000 });
  console.error("[probe] === after load ===\n" + JSON.stringify(s0, null, 2));

  // 塞音频：第一个 file input
  await cdp.send("DOM.enable", {}, { sessionId: sid });
  const doc = (await cdp.send("DOM.getDocument", {}, { sessionId: sid })) as { root?: { nodeId?: number } };
  const q = (await cdp.send("DOM.querySelectorAll", { nodeId: doc.root?.nodeId, selector: "input[type=file]" }, { sessionId: sid })) as { nodeIds?: number[] };
  const inputs = q.nodeIds ?? [];
  if (!inputs.length) throw new Error("未找到 file input");
  await cdp.send("DOM.setFileInputFiles", { files: [audio], nodeId: inputs[0]! }, { sessionId: sid });
  console.error("[probe] 音频已塞入，等上传…");

  // 轮询上传完成：出现「重新上传」或按钮解禁
  let s1: Record<string, unknown> = {};
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    s1 = await evaluateScalar<Record<string, unknown>>(cdp, sid, dump(`t=${(i + 1) * 4}s`), { timeoutMs: 10_000 });
    const t = JSON.stringify(s1);
    if (t.includes("重新上传") || t.includes("上传完成")) break;
  }
  console.error("[probe] === after upload ===\n" + JSON.stringify(s1, null, 2));

  // 填标题（原生 setter）
  await evaluateScalar<boolean>(cdp, sid, `(() => {
    const el = document.querySelector("input") ;
    const cands = Array.from(document.querySelectorAll("input, textarea")).filter((e) => e.offsetParent !== null && e.type !== "file");
    const el2 = cands.find((e) => /标题|title/i.test(e.placeholder || "")) || cands[0];
    if (!el2) return false;
    const d = Object.getOwnPropertyDescriptor(el2.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value");
    el2.focus();
    if (d && d.set) d.set.call(el2, "tassello e2e 测试单集（勿发布）"); else el2.value = "tassello e2e 测试单集（勿发布）";
    el2.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`, { timeoutMs: 10_000 });
  console.error("[probe] 标题已填");

  // 找草稿类按钮并点击
  const draftBtn = await evaluateScalar<{ found: boolean; text: string | null; buttons: string[] }>(cdp, sid, `(() => {
    const buttons = Array.from(document.querySelectorAll("button")).map((b) => (b.innerText || "").trim()).filter(Boolean);
    const b = Array.from(document.querySelectorAll("button")).find((x) => /存草稿|保存草稿|存草稿箱/.test((x.innerText || "").trim()));
    if (!b) return { found: false, text: null, buttons };
    b.click();
    return { found: true, text: (b.innerText || "").trim(), buttons };
  })()`, { timeoutMs: 10_000 });
  console.error("[probe] 草稿按钮: " + JSON.stringify(draftBtn));

  await new Promise((r) => setTimeout(r, 8000));
  const s2 = await evaluateScalar<Record<string, unknown>>(cdp, sid, dump("after-draft-click"), { timeoutMs: 15_000 });
  console.error("[probe] === after draft click ===\n" + JSON.stringify(s2, null, 2));

  await new Promise((r) => setTimeout(r, 2000));
  const list = [...reqs.values()].map((r) => ({ ...r, status: r.status ?? null }));
  console.log(JSON.stringify({ apiCalls: list }, null, 2));
});
process.exit(0);
