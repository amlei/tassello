/* 探针：素材库各 tab 的 type 参数 + 视频 tab 的上传 input */
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
  const tabs = await evaluateScalar<{ href: string; text: string }[]>(cdp, sid, `JSON.parse(JSON.stringify(
    Array.from(document.querySelectorAll("a")).filter((a) => /filepage\?type=/.test(a.href || "")).map((a) => ({ href: (a.getAttribute("href")||"").slice(0, 60), text: (a.textContent||"").trim() })).slice(0, 8)
  ))`, { timeoutMs: 10000 });
  console.log("tabs:", JSON.stringify(tabs, null, 2));
  const vtab = tabs.find((t) => t.text === "视频");
  if (vtab) {
    const vurl = vtab.href.startsWith("http") ? vtab.href : `https://mp.weixin.qq.com${vtab.href}`;
    await cdp.send("Page.navigate", { url: vurl }, { sessionId: sid });
    await new Promise((r) => setTimeout(r, 7000));
    const d = await evaluateScalar(cdp, sid, `JSON.parse(JSON.stringify({
      files: Array.from(document.querySelectorAll("input[type=file]")).map((f) => ({ accept: f.accept, multiple: !!f.multiple, visible: !!(f.offsetWidth||f.offsetHeight), parentCls: (f.parentElement?.className||"").toString().slice(0, 60) })),
      pickers: Array.from(document.querySelectorAll("[class*=webuploader], [class*=upload]")).filter((e) => e.offsetHeight > 0).slice(0, 6).map((e) => ({ cls: (e.className||"").toString().slice(0, 60), text: (e.textContent||"").replace(/\\s+/g," ").slice(0, 30) })),
      text: (document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 250),
    }))`, { timeoutMs: 15000 });
    console.log("video tab:", JSON.stringify(d, null, 2));
  }
});
