/* 探针：真机验证公众号后台四种内容形态（article/image/video/audio）的发布入口与编辑器结构。
   只读探测：仅导航与读取 DOM 摘要，不输入、不提交。输出 JSON 到 stdout。
   运行：bun packages/platforms/wechat/scripts/probe.ts [名称过滤] */
import { evaluateScalar, withPage } from "@tassello/cdp";

type Summary = {
  url: string;
  title: string;
  loggedIn: boolean;
  onScan: boolean;
  token: string | null;
  fields: {
    titleTextarea: boolean;
    prosemirror: number;
    ueditor: boolean;
    fileInputs: { accept: string; id: string | null; cls: string; multiple: boolean }[];
    buttons: string[];
    text: string;
  };
};

const DUMP = `(() => {
  const scan = !!document.querySelector(".login__type__container__scan, #scan_qrcode");
  const m = location.search.match(/token=(\\d+)/);
  const files = Array.from(document.querySelectorAll("input[type=file]")).map((f) => ({
    accept: f.accept || "",
    id: f.id || null,
    cls: (f.className || "").slice(0, 80),
    multiple: !!f.multiple,
  })).slice(0, 12);
  const buttons = Array.from(document.querySelectorAll("button, a.weui-desktop-btn, .weui-desktop-btn, [role=button]"))
    .map((b) => (b.textContent || "").trim().replace(/\\s+/g, " "))
    .filter((t) => t && t.length <= 14);
  return JSON.parse(JSON.stringify({
    url: location.href.slice(0, 140),
    title: document.title,
    loggedIn: !scan && !!(window.wx && window.wx.commonData && window.wx.commonData.data),
    onScan: scan,
    token: m ? m[1] : null,
    fields: {
      titleTextarea: !!document.querySelector("textarea#title, textarea[placeholder*='标题'], textarea[placeholder*='标题']"),
      prosemirror: document.querySelectorAll(".ProseMirror").length,
      ueditor: !!document.querySelector("#ueditor_0, .edui-editor-body"),
      fileInputs: files,
      buttons: Array.from(new Set(buttons)).slice(0, 40),
      text: (document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 600),
    },
  }));
})()`;

/** 等页面落地：跳转期间执行上下文会被销毁，吞掉重试 */
async function settle(cdp: Parameters<typeof evaluateScalar>[0], sid: string, timeoutMs = 30_000): Promise<Summary | null> {
  const start = Date.now();
  for (;;) {
    try {
      const s = await evaluateScalar<Summary>(cdp, sid, DUMP, { timeoutMs: 6_000 });
      if (s.token || s.onScan || s.fields.prosemirror > 0 || s.fields.fileInputs.length > 0) return s;
      if (Date.now() - start > 8000) return s;
    } catch {}
    if (Date.now() - start > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, 1200));
  }
}

async function probe(name: string, url: string): Promise<void> {
  console.error(`[probe] ${name} 开始`);
  try {
    const s = await withPage("wechat", { url, keepOpen: false, activate: false, mode: "headless" }, (cdp, sid) => {
      console.error(`[probe] ${name} 页面已开`);
      return settle(cdp, sid);
    });
    console.log(`\n===== ${name} =====`);
    console.log(JSON.stringify(s, null, 2));
    console.error(`[probe] ${name} 完成`);
  } catch (e) {
    console.log(`\n===== ${name} ===== ERROR: ${e instanceof Error ? e.message : String(e)}`);
    console.error(`[probe] ${name} 失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.error("[probe] 脚本已启动");
const filter = process.argv[2] ?? "";
const candidates: [string, string][] = [
  ["home", "https://mp.weixin.qq.com"],
  ["article-old", "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77&lang=zh_CN"],
  ["article-v2", "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&lang=zh_CN"],
  ["image-msg-v2", "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&lang=zh_CN"],
  ["filepage-2", "https://mp.weixin.qq.com/cgi-bin/filepage?type=2&lang=zh_CN"],
  ["filepage-3", "https://mp.weixin.qq.com/cgi-bin/filepage?type=3&lang=zh_CN"],
  ["filepage-1", "https://mp.weixin.qq.com/cgi-bin/filepage?type=1&lang=zh_CN"],
];

for (const [name, url] of candidates) {
  if (filter && name.indexOf(filter) < 0) continue;
  await probe(name, url);
}
