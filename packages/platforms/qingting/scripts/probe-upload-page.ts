/* 探针：首页点「上传节目」，看上传表单（file input、专辑选择、标题简介控件）。绝不点保存/提交。 */
process.env.TASSELLO_CHROME_PROFILE = process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/qingting`;
import { withPage, evaluateScalar } from "@tassello/cdp";
const r = await withPage("qingting-probe", { url: "https://admin.qingting.fm/", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await new Promise((res) => setTimeout(res, 6_000));
  const clicked = await evaluateScalar(cdp, sid, `(() => {
    const els = [...document.querySelectorAll("button, a, [class*=btn]")].filter(e => (e.innerText || "").trim() === "上传节目" && e.offsetParent !== null);
    const el = els[els.length - 1];
    if (!el) return "notfound";
    el.click();
    return "clicked";
  })()`, { timeoutMs: 15_000 });
  await new Promise((res) => setTimeout(res, 5_000));
  return evaluateScalar(cdp, sid, `(() => JSON.stringify({
    clicked: ${JSON.stringify(clicked)},
    url: location.href,
    bodyText: (document.body?.innerText || "").slice(0, 3000),
    fileInputs: [...document.querySelectorAll("input[type=file]")].map(i => ({ accept: i.accept, cls: i.className, visible: !!i.offsetParent })),
    inputs: [...document.querySelectorAll("input, textarea")].map(i => ({ tag: i.tagName, type: i.type, ph: i.placeholder, cls: String(i.className).slice(0, 50) })).slice(0, 30),
    buttons: [...document.querySelectorAll("button")].map(b => (b.innerText || "").trim()).filter(t => t && t.length < 12).slice(0, 30),
  }))()`, { timeoutMs: 20_000 });
});
console.log(r);
process.exit(0);
