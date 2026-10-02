/* 探针：直接打开各 createType 编辑器，dump 编辑器结构（标题/正文/文件入口/按钮/文本摘要） */
import { evaluateScalar, withPage } from "@tassello/cdp";

const TOKEN = "853457057";
const targets: [string, string][] = [
  ["article-ct0", `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token=${TOKEN}&lang=zh_CN`],
  ["image-ct8", `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=8&token=${TOKEN}&lang=zh_CN`],
  ["video-ct5", `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=5&token=${TOKEN}&lang=zh_CN`],
  ["podcast-ct7", `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=7&token=${TOKEN}&lang=zh_CN`],
];
const only = process.argv[2];

type EditorDump = {
  url: string; ready: boolean; titleTa: boolean; prosemirror: number;
  fileInputs: { accept: string; id: string | null; name: string | null; cls: string; multiple: boolean; visible: boolean }[];
  contenteditables: { cls: string; ph: string; h: number }[];
  textareas: { id: string | null; ph: string; cls: string }[];
  buttons: string[];
  text: string;
};

const DUMP = `(() => {
  const files = Array.from(document.querySelectorAll("input[type=file]")).map((f) => ({
    accept: f.accept || "", id: f.id || null, name: f.name || null,
    cls: (f.className || "").toString().slice(0, 60), multiple: !!f.multiple,
    visible: !!(f.offsetWidth || f.offsetHeight),
  }));
  const btns = Array.from(document.querySelectorAll("button, .weui-desktop-btn, [role=button], a.weui-desktop-link"))
    .map((b) => (b.textContent || "").trim().replace(/\\s+/g, " ")).filter((t) => t && t.length <= 12);
  const ces = Array.from(document.querySelectorAll("[contenteditable='true']")).map((e) => ({
    cls: (e.className || "").toString().slice(0, 60), ph: e.getAttribute("data-placeholder") || e.getAttribute("aria-label") || "", h: e.offsetHeight,
  }));
  const tas = Array.from(document.querySelectorAll("textarea")).map((t) => ({
    id: t.id || null, ph: t.placeholder || "", cls: (t.className || "").toString().slice(0, 50),
  }));
  return JSON.parse(JSON.stringify({
    url: location.href.slice(0, 130),
    ready: !!(document.querySelector(".weui-desktop-dialog, .appmsg") || document.body.innerText.length > 100),
    titleTa: !!document.querySelector("textarea#title"),
    prosemirror: document.querySelectorAll(".ProseMirror").length,
    fileInputs: files,
    contenteditables: ces,
    textareas: tas,
    buttons: Array.from(new Set(btns)).slice(0, 50),
    text: (document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 700),
  }));
})()`;

for (const [name, url] of targets) {
  if (only && name.indexOf(only) < 0) continue;
  console.error(`[probe] ${name} 开始`);
  try {
    const s = await withPage("wechat", { url, keepOpen: false, activate: false, mode: "headless" }, async (cdp, sid) => {
      for (let i = 0; i < 25; i++) {
        try {
          const d = await evaluateScalar<EditorDump>(cdp, sid, DUMP, { timeoutMs: 8000 });
          if (d.ready) return d;
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }
      return "TIMEOUT";
    });
    console.log(`\n===== ${name} =====`);
    console.log(JSON.stringify(s, null, 2));
  } catch (e) {
    console.log(`\n===== ${name} ===== ERROR ${e instanceof Error ? e.message : String(e)}`);
  }
}
