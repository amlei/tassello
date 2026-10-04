/* 探针 4：专辑列表接口候选 + /upload 页面交互结构（只读） */
import { evaluateScalar, withPage } from "@tassello/cdp";

const r = await withPage(
  "ximalaya",
  { url: "https://studio.ximalaya.com/", keepOpen: false, activate: false, mode: "headless" },
  async (cdp, sid) => {
    await new Promise((res) => setTimeout(res, 5000));
    return evaluateScalar<any>(
      cdp,
      sid,
      `(async () => {
        const get = async (p) => {
          try {
            const r = await fetch(p, { credentials: "include", headers: { Accept: "application/json" } });
            const t = await r.text();
            const isJson = (r.headers.get("content-type")||"").includes("json");
            return { p, status: r.status, body: isJson ? t.slice(0, 900) : "(html)" };
          } catch (e) { return { p, status: 0, body: String(e) }; }
        };
        const paths = [
          "/reform-upload/anchorWork/album/list?page=1&pageSize=20",
          "/reform-upload/anchorWork/album/list?pageNo=1&pageSize=20",
          "/reform-upload/album/list?page=1&pageSize=20",
          "/reform-upload/anchorWork/album/my?page=1&pageSize=20",
          "/reform-upload/anchorWork/albums",
          "/anchor-work-web/api/v1/album/list?pageNo=1&pageSize=20",
        ];
        const out = [];
        for (const p of paths) out.push(await get(p));
        return JSON.parse(JSON.stringify(out));
      })()`,
      { timeoutMs: 45000 },
    );
  },
);
console.log(JSON.stringify(r, null, 2));

// upload 页面：等久一点，dump 按钮/上传入口
const up = await withPage(
  "ximalaya",
  { url: "https://studio.ximalaya.com/upload", keepOpen: false, activate: false, mode: "headless" },
  async (cdp, sid) => {
    await new Promise((res) => setTimeout(res, 15000));
    return evaluateScalar<any>(
      cdp,
      sid,
      `(() => {
        const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        return JSON.parse(JSON.stringify({
          url: location.href,
          fileInputs: Array.from(document.querySelectorAll("input[type=file]")).map(i => ({ cls: String(i.className).slice(0,80), accept: i.accept, visible: vis(i) })),
          buttons: Array.from(document.querySelectorAll("button, [class*=btn], [class*=upload]")).filter(vis).map(b => ({ tag: b.tagName, cls: String(b.className).slice(0,60), t: (b.textContent||"").trim().slice(0,30) })).slice(0, 30),
          dropzones: Array.from(document.querySelectorAll("[class*=drop],[class*=drag],[class*=picker]")).filter(vis).map(d => String(d.className).slice(0,80)).slice(0,10),
        }));
      })()`,
      { timeoutMs: 25000 },
    );
  },
);
console.log("UPLOAD:", JSON.stringify(up, null, 2));
process.exit(0);
