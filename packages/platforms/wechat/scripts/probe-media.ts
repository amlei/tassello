/* 探针：ct5(视频)/ct7(播客) 编辑器的媒体上传组件深挖 */
import { evaluateScalar, withPage } from "@tassello/cdp";
const TOKEN = "853457057";
const targets: [string, string][] = [
  ["video-ct5", `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=5&token=${TOKEN}&lang=zh_CN`],
  ["podcast-ct7", `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=7&token=${TOKEN}&lang=zh_CN`],
];
const only = process.argv[2] ?? "";
type MediaDump = {
  url: string;
  iframes: { src: string; cls: string }[];
  zones: { tag: string; cls: string; text: string; h: number }[];
  files: { accept: string; multiple: boolean; visible: boolean }[];
  clickable: string[];
  text: string;
};
const DUMP = `(() => {
  const iframes = Array.from(document.querySelectorAll("iframe")).map((f) => ({ src: (f.src || "").slice(0, 100), cls: (f.className||"").slice(0,40) }));
  const zones = Array.from(document.querySelectorAll("[class*=upload], [class*=Upload], [class*=drag], [class*=video], [class*=audio], [class*=music], [class*=voice]"))
    .map((e) => ({ tag: e.tagName, cls: (e.className||"").toString().slice(0, 70), text: (e.textContent||"").trim().replace(/\\s+/g," ").slice(0, 40), h: e.offsetHeight }))
    .filter((x) => x.text || x.h > 0).slice(0, 25);
  const files = Array.from(document.querySelectorAll("input[type=file]")).map((f) => ({ accept: f.accept, multiple: !!f.multiple, visible: !!(f.offsetWidth||f.offsetHeight) }));
  const clickable = Array.from(document.querySelectorAll("button, [role=button], .weui-desktop-btn, .tool_bar a, .edui-btn, [class*=btn]"))
    .map((b) => (b.textContent||"").trim().replace(/\\s+/g," ")).filter((t) => t && t.length <= 10);
  return JSON.parse(JSON.stringify({ url: location.href.slice(80, 130), iframes, zones, files, clickable: Array.from(new Set(clickable)).slice(0, 40), text: (document.body.innerText||"").replace(/\\s+/g," ").slice(0, 800) }));
})()`;
for (const [name, url] of targets) {
  if (only && name.indexOf(only) < 0) continue;
  console.error(`[probe] ${name}`);
  try {
    const s = await withPage("wechat", { url, keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
      for (let i = 0; i < 20; i++) {
        try {
          const d = await evaluateScalar<MediaDump>(cdp, sid, DUMP, { timeoutMs: 8000 });
          if (d.text.length > 150) return d;
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }
      return null;
    });
    console.log(`\n===== ${name} =====\n` + JSON.stringify(s, null, 2));
  } catch (e) { console.log(`===== ${name} ERROR ${e}`); }
}
