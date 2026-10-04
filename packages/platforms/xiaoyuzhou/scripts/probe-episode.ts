/* 探针 6：进入节目详情页，抓「新建单集」入口 + 该页的 API 链
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou bun packages/platforms/xiaoyuzhou/scripts/probe-episode.ts */
import { withPage, evaluateScalar } from "@tassello/cdp";

const pid = process.argv[2] ?? "6632421e4b7d3b5d3b9b519f";
const r = await withPage("xiaoyuzhou-probe", { url: `https://podcaster.xiaoyuzhoufm.com/podcast/${pid}`, keepOpen: false, activate: false }, async (cdp, sid) => {
  await new Promise((res) => setTimeout(res, 8000));
  const links = await evaluateScalar<{ href: string; text: string }[]>(
    cdp,
    sid,
    `(() => Array.from(document.querySelectorAll("a")).map((a) => ({ href: a.href, text: (a.innerText || "").trim().slice(0, 40) })).filter((x) => x.text))()`,
    { timeoutMs: 15_000 },
  );
  const buttons = await evaluateScalar<{ tag: string; cls: string; text: string }[]>(
    cdp,
    sid,
    `(() => Array.from(document.querySelectorAll("button, [role=button]")).map((b) => ({ tag: b.tagName, cls: String(b.className).slice(0, 60), text: (b.innerText || "").trim() })).filter((x) => x.text).slice(0, 30))()`,
    { timeoutMs: 15_000 },
  );
  return { links, buttons };
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
