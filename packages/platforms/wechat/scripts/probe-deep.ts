/* 探针：首页取 token → 编辑器 → 视频「本地上传」/ 音频「上传音频」面板结构 */
import { evaluateScalar, withPage } from "@tassello/cdp";

async function gotoEditor(cdp: any, sid: string, createType: number) {
  for (let i = 0; i < 30; i++) {
    const st = await evaluateScalar<{ token: string | null; onEditor: boolean; ready: boolean }>(
      cdp, sid,
      `JSON.parse(JSON.stringify({
        token: (location.search.match(/token=(\\d+)/) || [])[1] || null,
        onEditor: location.href.indexOf("appmsg_edit") >= 0,
        ready: !!document.querySelector("textarea#title"),
      }))`, { timeoutMs: 6000 }).catch(() => null);
    if (st?.onEditor && st.ready) return st.token ?? "";
    if (st?.token && !st.onEditor) {
      await cdp.send("Page.navigate", { url: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=${createType}&token=${st.token}&lang=zh_CN` }, { sessionId: sid }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("editor not ready");
}

console.log("===== video: 本地上传面板 =====");
await withPage("wechat", { url: "https://mp.weixin.qq.com", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await gotoEditor(cdp, sid, 5);
  await evaluateScalar(cdp, sid, `(async () => {
    const tabs = Array.from(document.querySelectorAll("a, li, div, span")).filter((e) => e.offsetHeight > 0 && (e.textContent || "").trim() === "本地上传");
    if (tabs.length) tabs[0].click();
    await new Promise((r) => setTimeout(r, 2000));
    return true;
  })()`, { timeoutMs: 15000 });
  const d = await evaluateScalar(cdp, sid, `JSON.parse(JSON.stringify({
    libHtml: (document.querySelector(".more-video__lib") || document.querySelector(".more-video__wrp") || {}).outerHTML?.slice(0, 1500) || null,
    allInputs: Array.from(document.querySelectorAll("input")).filter((i) => i.type !== "text" && i.type !== "hidden").map((i) => ({ type: i.type, accept: i.accept || "", cls: (i.className||"").slice(0,40) })),
  }))`, { timeoutMs: 15000 });
  console.log(JSON.stringify(d, null, 2));
});

console.log("===== audio: 上传音频面板 =====");
await withPage("wechat", { url: "https://mp.weixin.qq.com", keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await gotoEditor(cdp, sid, 7);
  await evaluateScalar(cdp, sid, `(async () => {
    const a = document.querySelector("a.audio_cover_empty.js_replace_media, .js_replace_media");
    if (a) a.click();
    await new Promise((r) => setTimeout(r, 2000));
    const tabs = Array.from(document.querySelectorAll(".weui-desktop-tab, a, li, span, div")).filter((e) => e.offsetHeight > 0 && (e.textContent || "").trim() === "上传音频");
    if (tabs.length) tabs[0].click();
    await new Promise((r) => setTimeout(r, 2000));
    return true;
  })()`, { timeoutMs: 20000 });
  const d = await evaluateScalar(cdp, sid, `JSON.parse(JSON.stringify({
    panelHtml: (document.querySelector(".audio_music_dialog_content") || {}).outerHTML?.slice(0, 1800) || null,
    allInputs: Array.from(document.querySelectorAll("input")).filter((i) => i.type !== "text" && i.type !== "hidden").map((i) => ({ type: i.type, accept: i.accept || "", cls: (i.className||"").slice(0,40) })),
    btnTexts: Array.from(document.querySelectorAll("button, .weui-desktop-btn")).filter((b) => b.offsetHeight > 0).map((b) => (b.textContent||"").trim()).filter(Boolean).slice(0, 20),
  }))`, { timeoutMs: 15000 });
  console.log(JSON.stringify(d, null, 2));
});
