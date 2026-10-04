/* 探针 16：抓 create 页所有 JS bundle，检索 draft / episode create 相关 API 路径字符串
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou \
 *   bun packages/platforms/xiaoyuzhou/scripts/probe-bundle-grep.ts */
import { withPage, evaluateScalar } from "@tassello/cdp";

await withPage("xiaoyuzhou-probe", { url: "https://podcaster.xiaoyuzhoufm.com/podcast/6aa0b3e56d64a2ee897188fd/episode/create", keepOpen: false, activate: false }, async (cdp, sid) => {
  await new Promise((r) => setTimeout(r, 8000));
  const srcs = await evaluateScalar<string[]>(cdp, sid, `(() => {
    const set = new Set();
    for (const s of document.querySelectorAll("script[src]")) set.add(s.src);
    for (const e of performance.getEntriesByType("resource")) if (/\\.js(\\?|$)/.test(e.name)) set.add(e.name);
    return [...set];
  })()`, { timeoutMs: 10_000 });
  console.error("scripts: " + srcs.length);
  const hits: { src: string; matches: string[] }[] = [];
  for (const src of srcs) {
    const r = await evaluateScalar<{ status: number; text: string }>(cdp, sid, `(async () => {
      const r = await fetch(${JSON.stringify(src)});
      return { status: r.status, text: await r.text() };
    })()`, { timeoutMs: 60_000 }).catch(() => null);
    if (!r || r.status !== 200) continue;
    const ms = new Set<string>();
    const re = /[A-Za-z0-9\/\._\-]*(draft|草稿|episode\/[A-Za-z0-9\/\-_]+|hosted-resource\/[A-Za-z0-9\/\-_]+)[A-Za-z0-9\/\._\-]*/gi;
    for (const m of r.text.matchAll(re)) ms.add(m[0]);
    if (ms.size) hits.push({ src: src.slice(-50), matches: [...ms].slice(0, 120) });
  }
  console.log(JSON.stringify(hits, null, 1));
});
process.exit(0);
