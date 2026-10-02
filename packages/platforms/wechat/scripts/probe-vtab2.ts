/* 探针：素材库页内点「视频」tab → dump 上传 input */
import { evaluateScalar, withPage } from "@tassello/cdp";
await withPage("wechat", { url: "https://mp.weixin.qq.com", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  let token: string | null = null;
  for (let i = 0; i < 20; i++) {
    const st = await evaluateScalar<{ token: string | null }>(cdp, sid, `JSON.parse(JSON.stringify({ token: (location.search.match(/token=(\\d+)/) || [])[1] || null }))`, { timeoutMs: 5000 }).catch(() => null);
    if (st?.token) { token = st.token; break; }
    await new Promise((r) => setTimeout(r, 1200));
  }
  if (!token) { console.error("no token"); return; }
  await cdp.send("Page.navigate", { url: `https://mp.weixin.qq.com/cgi-bin/filepage?type=2&token=${token}&lang=zh_CN` }, { sessionId: sid });
  await new Promise((r) => setTimeout(r, 6000));
  const d = await evaluateScalar(cdp, sid, `(async () => {
    const tabs = Array.from(document.querySelectorAll("a, li, span, div")).filter((e) => e.offsetHeight > 0 && (e.textContent || "").trim() === "视频");
    if (tabs.length) { tabs[0].click(); await new Promise((r) => setTimeout(r, 4000)); }
    return { clicked: tabs.length, url: location.href.slice(0, 80) };
  })()`, { timeoutMs: 20000 });
  console.log("click:", JSON.stringify(d));
  const d2 = await evaluateScalar(cdp, sid, `JSON.parse(JSON.stringify({
    files: Array.from(document.querySelectorAll("input[type=file]")).map((f) => ({ accept: f.accept, multiple: !!f.multiple, visible: !!(f.offsetWidth||f.offsetHeight), parentCls: (f.parentElement?.className||"").toString().slice(0, 70) })),
    pickers: Array.from(document.querySelectorAll("[class*=webuploader], [class*=upload]")).filter((e) => e.offsetHeight > 0).slice(0, 8).map((e) => ({ cls: (e.className||"").toString().slice(0, 70), text: (e.textContent||"").replace(/\\s+/g," ").slice(0, 30) })),
    text: (document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 300),
  }))`, { timeoutMs: 15000 });
  console.log(JSON.stringify(d2, null, 2));
});
