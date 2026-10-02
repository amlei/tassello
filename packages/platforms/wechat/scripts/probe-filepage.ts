/* 探针：素材库视频页(filepage?type=2)的上传入口与已有列表 */
import { evaluateScalar, withPage } from "@tassello/cdp";
await withPage("wechat", { url: "https://mp.weixin.qq.com", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  for (let i = 0; i < 20; i++) {
    const st = await evaluateScalar<{ token: string | null }>(cdp, sid, `JSON.parse(JSON.stringify({ token: (location.search.match(/token=(\\d+)/) || [])[1] || null }))`, { timeoutMs: 5000 }).catch(() => null);
    if (st?.token) {
      await cdp.send("Page.navigate", { url: `https://mp.weixin.qq.com/cgi-bin/filepage?type=2&token=${st.token}&lang=zh_CN` }, { sessionId: sid });
      await new Promise((r) => setTimeout(r, 6000));
      const d = await evaluateScalar(cdp, sid, `JSON.parse(JSON.stringify({
        url: location.href.slice(0, 90),
        text: (document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 400),
        files: Array.from(document.querySelectorAll("input[type=file]")).map((f) => ({ accept: f.accept, multiple: !!f.multiple, visible: !!(f.offsetWidth||f.offsetHeight) })),
        iframes: Array.from(document.querySelectorAll("iframe")).map((f) => (f.src || "").slice(0, 90)),
        uploadEls: Array.from(document.querySelectorAll("[class*=upload], [id*=upload], a, button")).filter((e) => /上传/.test(e.textContent || "")).slice(0, 8).map((e) => ({ tag: e.tagName, cls: (e.className||"").toString().slice(0,50), id: e.id || null })),
      }))`, { timeoutMs: 15000 });
      console.log(JSON.stringify(d, null, 2));
      return;
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.error("no token");
});
