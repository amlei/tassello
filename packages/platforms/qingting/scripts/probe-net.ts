/* 探针：等 SPA 渲染完，看 DOM 内容 + performance 里出现过的请求 URL */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/qingting`;
import { withPage, evaluateScalar } from "@tassello/cdp";

const r = await withPage("qingting-probe", { url: "https://admin.qingting.fm/content/channels", keepOpen: false, activate: false, mode: "visible" }, async (cdp, sid) => {
  for (let i = 0; i < 6; i++) {
    await new Promise((res) => setTimeout(res, 3_000));
    const t = await evaluateScalar(cdp, sid, `document.body ? document.body.innerText.length : 0`);
    if (Number(t) > 0) break;
  }
  return evaluateScalar(cdp, sid, `JSON.parse(JSON.stringify({
    url: location.href,
    title: document.title,
    bodyText: document.body ? document.body.innerText.slice(0, 2500) : "",
    reqs: performance.getEntriesByType("resource").map(e => e.name).filter(u => !/\\.(js|css|png|jpg|svg|woff|ico)/.test(u)).slice(0, 60),
  }))`, { timeoutMs: 20_000 });
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
