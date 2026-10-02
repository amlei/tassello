/* 探针：交互打开 视频「本地上传」/ 播客「添加音频」弹窗，抓文件入口 */
import { evaluateScalar, withPage } from "@tassello/cdp";
const TOKEN = "853457057";
const URL5 = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=5&token=${TOKEN}&lang=zh_CN`;
const URL7 = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=7&token=${TOKEN}&lang=zh_CN`;

const DUMP_INPUTS = `(() => {
  const files = Array.from(document.querySelectorAll("input[type=file]")).map((f) => ({
    accept: f.accept, multiple: !!f.multiple, id: f.id || null, name: f.name || null,
    visible: !!(f.offsetWidth || f.offsetHeight || f.closest("[style*='display: block']")),
    parentCls: (f.parentElement?.className || "").toString().slice(0, 60),
  }));
  const dialogs = Array.from(document.querySelectorAll(".weui-desktop-dialog, .video-select-dialog, [class*=dialog]"))
    .filter((d) => d.offsetHeight > 0)
    .map((d) => ({ cls: (d.className||"").toString().slice(0, 50), text: (d.textContent||"").replace(/\\s+/g," ").slice(0, 200) }));
  return JSON.parse(JSON.stringify({ url: location.href.slice(80, 120), files, dialogs }));
})()`;

async function dump(cdp: Parameters<typeof evaluateScalar>[0], sid: string) {
  return evaluateScalar(cdp, sid, DUMP_INPUTS, { timeoutMs: 10000 });
}

console.log("===== video-ct5: 点击「本地上传」=====");
await withPage("wechat", { url: URL5, keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await new Promise((r) => setTimeout(r, 8000));
  const r1 = await evaluateScalar<{ clicked: boolean; after: string }>(cdp, sid, `(async () => {
    const tabs = Array.from(document.querySelectorAll(".more-video__title, [class*=tab], .weui-desktop-tab, a, li, div"))
      .filter((e) => (e.textContent || "").trim() === "本地上传" && e.offsetHeight > 0);
    const tab = tabs[0];
    if (!tab) return { clicked: false, after: "no-tab" };
    tab.click();
    await new Promise((r) => setTimeout(r, 2500));
    return { clicked: true, after: "clicked" };
  })()`, { timeoutMs: 15000 });
  console.log(JSON.stringify(r1, null, 2));
  console.log(JSON.stringify(await dump(cdp, sid), null, 2));
});

console.log("===== podcast-ct7: 点击「添加音频」=====");
await withPage("wechat", { url: URL7, keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
  await new Promise((r) => setTimeout(r, 8000));
  const r1 = await evaluateScalar<{ clicked: boolean }>(cdp, sid, `(async () => {
    const a = document.querySelector("a.audio_cover_empty.js_replace_media, .js_replace_media");
    if (!a) return { clicked: false };
    a.click();
    await new Promise((r) => setTimeout(r, 2500));
    return { clicked: true };
  })()`, { timeoutMs: 15000 });
  console.log(JSON.stringify(r1, null, 2));
  console.log(JSON.stringify(await dump(cdp, sid), null, 2));
});
