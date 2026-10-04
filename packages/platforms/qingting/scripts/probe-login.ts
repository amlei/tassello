process.env.TASSELLO_CHROME_PROFILE = process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/qingting`;
import { withPage, evaluateScalar } from "@tassello/cdp";
const r = await withPage("qingting-probe", { url: "https://admin.qingting.fm/login", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await new Promise((res) => setTimeout(res, 4_000));
  return evaluateScalar(cdp, sid, `JSON.parse(JSON.stringify({
    url: location.href,
    tabs: [...document.querySelectorAll("[class*=tab],[class*=type],a,button,span,div")].map(e=>e.innerText&&e.innerText.trim()).filter(t=>t&&t.length<20&&/登录|扫码|短信|密码|注册/.test(t)).slice(0,20),
  }))`, { timeoutMs: 15_000 });
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
