import { evaluateScalar, withPage } from "@tassello/cdp";
const JS = `(() => {
  const links = Array.from(document.querySelectorAll("a[href]"))
    .map((a) => ({ href: a.getAttribute("href") || "", text: (a.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 20) }))
    .filter((x) => x.text && x.href && x.href !== "#");
  const cards = Array.from(document.querySelectorAll("[class*=create], [class*=new-], .main-panel a, .weui-desktop-link"))
    .map((e) => ({ tag: e.tagName, cls: (e.className || "").toString().slice(0, 60), text: (e.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 16), href: e.getAttribute && (e.getAttribute("href") || "") }))
    .filter((x) => x.text);
  return JSON.parse(JSON.stringify({ links: links.slice(0, 40), cards: cards.slice(0, 30) }));
})()`;
await withPage("wechat", { url: "https://mp.weixin.qq.com", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await new Promise((r) => setTimeout(r, 6000));
  const r = await evaluateScalar(cdp, sid, JS, { timeoutMs: 10000 });
  console.log(JSON.stringify(r, null, 2));
});
