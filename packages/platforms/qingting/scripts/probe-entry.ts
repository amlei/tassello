/* 探针：全站扫「新建声音 / 上传节目」类入口（只看不点）。 */
process.env.TASSELLO_CHROME_PROFILE = process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/qingting`;
import { withPage, evaluateScalar } from "@tassello/cdp";
const r = await withPage("qingting-probe", { url: "https://admin.qingting.fm/", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await new Promise((res) => setTimeout(res, 6_000));
  return evaluateScalar(cdp, sid, `(() => JSON.stringify({
    url: location.href,
    hits: [...document.querySelectorAll("a, button, [class*=btn]")].map(e => ({ text: (e.innerText || "").trim(), href: e.getAttribute ? e.getAttribute("href") : null })).filter(x => x.text && /新建|上传|添加|创建/.test(x.text) && x.text.length < 20).slice(0, 30),
    nav: [...document.querySelectorAll("a")].map(a => ({ href: a.getAttribute("href"), text: (a.innerText || "").trim() })).filter(x => x.href && x.href.startsWith("/") && x.text && x.text.length < 12).slice(0, 40),
  }))()`, { timeoutMs: 20_000 });
});
console.log(r);
process.exit(0);
