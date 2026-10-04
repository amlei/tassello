/* 探针 5：/upload 页面主体结构——iframe、主内容区、上传组件（只读） */
import { evaluateScalar, withPage } from "@tassello/cdp";

const up = await withPage(
  "ximalaya",
  { url: "https://studio.ximalaya.com/upload", keepOpen: false, activate: false, mode: "headless" },
  async (cdp, sid) => {
    await new Promise((res) => setTimeout(res, 12000));
    return evaluateScalar<any>(
      cdp,
      sid,
      `(() => {
        const iframes = Array.from(document.querySelectorAll("iframe")).map(f => ({ src: f.src, w: f.offsetWidth, h: f.offsetHeight }));
        const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        // 主内容区：侧栏之外最大的可见容器
        const main = document.querySelector("#root, #app, body");
        const html = main ? main.innerHTML.length : 0;
        // 全部可见元素的类名采样，找上传相关组件
        const sample = Array.from(document.querySelectorAll("div,section,span,p")).filter(vis)
          .map(e => String(e.className).slice(0, 50)).filter(c => /upload|track|sound|audio|file|select/i.test(c));
        const allText = ((document.body && document.body.innerText) || "").slice(0, 2500);
        return JSON.parse(JSON.stringify({ url: location.href, iframes, htmlLen: html, sample: [...new Set(sample)].slice(0, 30), allText }));
      })()`,
      { timeoutMs: 25000 },
    );
  },
);
console.log(JSON.stringify(up, null, 2));
process.exit(0);
