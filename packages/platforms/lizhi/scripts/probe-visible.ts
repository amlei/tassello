/* 探针 6：visible 模式复核（排除 headless UA 指纹拦截），同时 dump 页面最终落点。 */
process.env.TASSELLO_CHROME_PROFILE =
  process.env.TASSELLO_CHROME_PROFILE || `${process.env.HOME}/.local/share/tassello/probe-profiles/lizhi`;
import { evaluateScalar, withPage } from "@tassello/cdp";

const r = await withPage("lizhi", { url: "https://nj.lizhi.fm/static/newsite/#/manage/sheet", keepOpen: false, activate: false, mode: "visible" }, async (cdp, sid) => {
  await new Promise((res) => setTimeout(res, 8000));
  return evaluateScalar<unknown>(
    cdp,
    sid,
    `JSON.parse(JSON.stringify({ href: location.href, text: (document.body.innerText||"").slice(0, 600) }))`,
    { timeoutMs: 10000 },
  );
});
console.log(JSON.stringify(r, null, 2));
process.exit(0);
