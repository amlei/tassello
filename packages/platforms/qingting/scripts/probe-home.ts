/* 探针：打开 admin.qingting.fm，看登录态重定向 + 抓页面里的 API 线索（标量出页面） */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/qingting`;
import { withPage, evaluateScalar } from "@tassello/cdp";

const r = await withPage("qingting-probe", { url: "https://admin.qingting.fm/content/channels", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await new Promise((res) => setTimeout(res, 4_000));
  return evaluateScalar(cdp, sid, `JSON.parse(JSON.stringify({
    url: location.href,
    title: document.title,
    cookies: document.cookie.slice(0, 300),
    bodyText: document.body ? document.body.innerText.slice(0, 1500) : "",
    localStorage: Object.fromEntries(Object.entries(localStorage).map(([k, v]) => [k, String(v).slice(0, 120)])),
  }))`, { timeoutMs: 15_000 });
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
