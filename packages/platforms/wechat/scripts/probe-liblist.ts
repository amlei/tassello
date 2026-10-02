/* 探针：ct5/ct7 弹窗「素材库」列表项结构（找刚才 filetransfer 传的素材） */
import { evaluateScalar, withPage } from "@tassello/cdp";

async function gotoEditor(cdp: any, sid: string, ct: number) {
  for (let i = 0; i < 25; i++) {
    const st = await evaluateScalar<{ token: string | null; onEditor: boolean; ready: boolean }>(
      cdp, sid,
      `JSON.parse(JSON.stringify({
        token: (location.search.match(/token=(\\d+)/) || [])[1] || null,
        onEditor: location.href.indexOf("appmsg_edit") >= 0,
        ready: !!document.querySelector("textarea#title"),
      }))`, { timeoutMs: 6000 }).catch(() => null);
    if (st?.onEditor && st.ready) return true;
    if (st?.token && !st.onEditor) {
      await cdp.send("Page.navigate", { url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=${ct}&token=${st.token}&lang=zh_CN` }, { sessionId: sid }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("editor not ready");
}

console.log("===== audio 素材库列表 =====");
await withPage("wechat", { url: "https://mp.weixin.qq.com", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await gotoEditor(cdp, sid, 7);
  await evaluateScalar(cdp, sid, `(async () => {
    const a = document.querySelector("a.audio_cover_empty.js_replace_media, .js_replace_media");
    if (a) { a.click(); await new Promise((r) => setTimeout(r, 3000)); }
    return true;
  })()`, { timeoutMs: 20000 });
  const d = await evaluateScalar(cdp, sid, `JSON.parse(JSON.stringify({
    items: Array.from(document.querySelectorAll(".audio_music_dialog_content li, .audio_music_dialog_content .weui-desktop-media__item, .audio_music_dialog_content [class*=item]")).slice(0, 6).map((e) => ({ cls: (e.className||"").toString().slice(0, 70), text: (e.textContent||"").replace(/\\s+/g," ").slice(0, 80) })),
  }))`, { timeoutMs: 15000 });
  console.log(JSON.stringify(d, null, 2));
});

console.log("===== video 素材库列表 =====");
await withPage("wechat", { url: "https://mp.weixin.qq.com", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await gotoEditor(cdp, sid, 5);
  const d = await evaluateScalar(cdp, sid, `JSON.parse(JSON.stringify({
    items: Array.from(document.querySelectorAll(".video-select-dialog li, .more-video__list li")).slice(0, 6).map((e) => ({ cls: (e.className||"").toString().slice(0, 70), text: (e.textContent||"").replace(/\\s+/g," ").slice(0, 80) })),
  }))`, { timeoutMs: 15000 });
  console.log(JSON.stringify(d, null, 2));
});
