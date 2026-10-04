/* 探针 17：在 bundle 里抽取指定关键字的上下文片段（请求体构造证据）
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou \
 *   bun packages/platforms/xiaoyuzhou/scripts/probe-bundle-ctx.ts <keyword> [moreKeywords…] */
import { withPage, evaluateScalar } from "@tassello/cdp";

const keywords = process.argv.slice(2).length ? process.argv.slice(2) : ["hosted/create-free", "hosted/publish", "草稿"];

await withPage("xiaoyuzhou-probe", { url: "https://podcaster.xiaoyuzhoufm.com/podcast/6aa0b3e56d64a2ee897188fd/episode/create", keepOpen: false, activate: false }, async (cdp, sid) => {
  await new Promise((r) => setTimeout(r, 8000));
  const srcs = await evaluateScalar<string[]>(cdp, sid, `(() => {
    const set = new Set();
    for (const s of document.querySelectorAll("script[src]")) set.add(s.src);
    for (const e of performance.getEntriesByType("resource")) if (/\\.js(\\?|$)/.test(e.name)) set.add(e.name);
    return [...set];
  })()`, { timeoutMs: 10_000 });
  const out: Record<string, string[]> = {};
  for (const src of srcs) {
    const r = await evaluateScalar<{ status: number; text: string }>(cdp, sid, `(async () => {
      const r = await fetch(${JSON.stringify(src)});
      return { status: r.status, text: await r.text() };
    })()`, { timeoutMs: 120_000 }).catch(() => null);
    if (!r || r.status !== 200) continue;
    for (const kw of keywords) {
      let idx = 0;
      for (;;) {
        const i = r.text.indexOf(kw, idx);
        if (i < 0) break;
        (out[kw] ??= []).push(`[${src.slice(-40)}@${i}] …${r.text.slice(Math.max(0, i - 300), i + 500)}…`);
        idx = i + kw.length;
        if (out[kw]!.length > 8) break;
      }
    }
  }
  console.log(JSON.stringify(out, null, 1));
});
process.exit(0);
