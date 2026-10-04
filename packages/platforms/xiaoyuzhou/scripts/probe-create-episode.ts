/* 探针 8：点「创建单集」，记录跳转 URL + 编辑器 DOM 结构 + 期间 API 请求
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou bun packages/platforms/xiaoyuzhou/scripts/probe-create-episode.ts <pid> */
import { withPage, evaluateScalar, type CdpConnection } from "@tassello/cdp";

const pid = process.argv[2] ?? "6632421e4b7d3b5d3b9b519f";

await withPage("xiaoyuzhou-probe", { url: `https://podcaster.xiaoyuzhoufm.com/podcast/${pid}/episode`, keepOpen: false, activate: false }, async (cdp: CdpConnection, sid: string) => {
  const apiReqs: string[] = [];
  cdp.on("Network.requestWillBeSent", (p: unknown) => {
    const q = p as { request?: { url?: string; method?: string } };
    const u = q.request?.url ?? "";
    if (u.includes("podcaster-api") || u.includes("upload") || /api/.test(u) && !/sentry|remembrall/.test(u)) {
      apiReqs.push(`${q.request?.method} ${u}`);
    }
  });
  await cdp.send("Network.enable", {}, { sessionId: sid });

  await new Promise((res) => setTimeout(res, 8000));
  const clicked = await evaluateScalar<boolean>(
    cdp,
    sid,
    `(() => { const b = Array.from(document.querySelectorAll("button")).find((x) => (x.innerText || "").trim() === "创建单集"); if (!b) return false; b.click(); return true; })()`,
    { timeoutMs: 15_000 },
  );
  await new Promise((res) => setTimeout(res, 10_000));

  const dom = await evaluateScalar<Record<string, unknown>>(
    cdp,
    sid,
    `(() => JSON.parse(JSON.stringify({
      url: location.href,
      buttons: Array.from(document.querySelectorAll("button")).map((b) => (b.innerText || "").trim()).filter(Boolean).slice(0, 40),
      inputs: Array.from(document.querySelectorAll("input")).map((i) => ({ type: i.type, placeholder: i.placeholder || null, cls: String(i.className).slice(0, 50) })),
      textareas: Array.from(document.querySelectorAll("textarea")).map((t) => ({ placeholder: t.placeholder || null })),
      editables: Array.from(document.querySelectorAll("[contenteditable='true']")).map((e) => ({ cls: String(e.className).slice(0, 60), placeholder: e.getAttribute("data-placeholder") })),
      fileInputs: document.querySelectorAll("input[type=file]").length,
      text: ((document.body && document.body.innerText) || "").slice(0, 1200),
    })))()`,
    { timeoutMs: 15_000 },
  );
  console.log(JSON.stringify({ clicked, apiReqs: [...new Set(apiReqs)], dom }, null, 2));
});
process.exit(0);
