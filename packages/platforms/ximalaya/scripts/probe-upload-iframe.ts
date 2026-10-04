/* 探针 6：直接打开 iframe 的上传页（www 域），看上传组件结构（只读） */
import { evaluateScalar, withPage } from "@tassello/cdp";

const up = await withPage(
  "ximalaya",
  { url: "https://www.ximalaya.com/reform-upload/page/webCenter/upload", keepOpen: false, activate: false, mode: "headless" },
  async (cdp, sid) => {
    await new Promise((res) => setTimeout(res, 12000));
    return evaluateScalar<any>(
      cdp,
      sid,
      `(() => {
        const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        return JSON.parse(JSON.stringify({
          url: location.href, title: document.title,
          loggedInText: ((document.body && document.body.innerText) || "").slice(0, 1200),
          fileInputs: Array.from(document.querySelectorAll("input[type=file]")).map(i => ({ cls: String(i.className).slice(0,80), accept: i.accept, visible: vis(i) })),
          btns: Array.from(document.querySelectorAll("button, [class*=btn]")).filter(vis).map(b => ({ tag: b.tagName, cls: String(b.className).slice(0,60), t: (b.textContent||"").trim().slice(0,30) })).slice(0, 30),
          cookies: document.cookie.split(";").map(c => c.trim().split("=")[0]).filter(Boolean),
        }));
      })()`,
      { timeoutMs: 25000 },
    );
  },
);
console.log(JSON.stringify(up, null, 2));
process.exit(0);
