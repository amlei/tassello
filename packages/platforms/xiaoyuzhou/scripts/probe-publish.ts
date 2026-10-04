/* 探针 5：找「新建单集」入口 URL + 录制发布链路接口（上传/创建）
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/xiaoyuzhou bun packages/platforms/xiaoyuzhou/scripts/probe-publish.ts */
import { withPage, evaluateScalar } from "@tassello/cdp";

const r = await withPage("xiaoyuzhou-probe", { url: "https://podcaster.xiaoyuzhoufm.com/podcast", keepOpen: false, activate: false }, async (cdp, sid) => {
  await new Promise((res) => setTimeout(res, 8000));
  const links = await evaluateScalar<{ href: string; text: string }[]>(
    cdp,
    sid,
    `(() => Array.from(document.querySelectorAll("a")).map((a) => ({ href: a.href, text: (a.innerText || "").trim().slice(0, 40) })).filter((x) => x.href.includes("podcaster")))()`,
    { timeoutMs: 15_000 },
  );
  // 页面上的按钮（创建节目/新建单集可能是非 <a> 元素）
  const buttons = await evaluateScalar<string[]>(
    cdp,
    sid,
    `(() => Array.from(document.querySelectorAll("button, [role=button]")).map((b) => (b.innerText || "").trim()).filter(Boolean).slice(0, 30))()`,
    { timeoutMs: 15_000 },
  );
  return { links, buttons };
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
