/* 探针 7：内容管理页找「新建单集」入口 → 打开编辑器页，抓 DOM 结构 + 发布链路 API
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou bun packages/platforms/xiaoyuzhou/scripts/probe-new-episode.ts <pid> */
import { withPage, evaluateScalar, type CdpConnection } from "@tassello/cdp";

const pid = process.argv[2] ?? "6632421e4b5d3b5d3b9b519f".slice(0, 24) ?? "";
const realPid = process.argv[2] ?? "6632421e4b7d3b5d3b9b519f";

const r = await withPage("xiaoyuzhou-probe", { url: `https://podcaster.xiaoyuzhoufm.com/podcast/${realPid}/episode`, keepOpen: false, activate: false }, async (cdp: CdpConnection, sid: string) => {
  await new Promise((res) => setTimeout(res, 8000));
  const entry = await evaluateScalar<{ buttons: { cls: string; text: string; html: string }[]; links: { href: string; text: string }[] }>(
    cdp,
    sid,
    `(() => ({
      buttons: Array.from(document.querySelectorAll("button, [role=button]")).map((b) => ({ cls: String(b.className).slice(0, 80), text: (b.innerText || "").trim(), html: b.outerHTML.slice(0, 200) })).filter((x) => x.text && /新建|创建|发布|单集|new/i.test(x.text)),
      links: Array.from(document.querySelectorAll("a")).map((a) => ({ href: a.href, text: (a.innerText || "").trim() })).filter((x) => /new|episode/i.test(x.href) && x.text),
    }))()`,
    { timeoutMs: 15_000 },
  );
  return entry;
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
