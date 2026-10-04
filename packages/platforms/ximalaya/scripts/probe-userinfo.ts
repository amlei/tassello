/* 探针 3：真接口响应 + /upload 页面资源（只读） */
import { evaluateScalar, withPage } from "@tassello/cdp";

const r = await withPage(
  "ximalaya",
  { url: "https://studio.ximalaya.com/", keepOpen: false, activate: false, mode: "headless" },
  async (cdp, sid) => {
    await new Promise((res) => setTimeout(res, 6000));
    const home = await evaluateScalar<any>(
      cdp,
      sid,
      `(async () => {
        const get = async (p) => {
          try {
            const r = await fetch(p, { credentials: "include", headers: { Accept: "application/json" } });
            const t = await r.text();
            return { status: r.status, ct: (r.headers.get("content-type")||""), body: t.slice(0, 1200) };
          } catch (e) { return { status: 0, body: String(e) }; }
        };
        return JSON.parse(JSON.stringify({
          userInfo: await get("/api/home/userInfo"),
          trackList: await get("/reform-upload/anchorWork/track/list?pageSize=5&keyword=&status=1&page=1&needTopic=true"),
        }));
      })()`,
      { timeoutMs: 30000 },
    );
    return home;
  },
);
console.log(JSON.stringify(r, null, 2));

// /upload 页面
const up = await withPage(
  "ximalaya",
  { url: "https://studio.ximalaya.com/upload", keepOpen: false, activate: false, mode: "headless" },
  async (cdp, sid) => {
    await new Promise((res) => setTimeout(res, 8000));
    return evaluateScalar<any>(
      cdp,
      sid,
      `(() => {
        const resources = performance.getEntriesByType("resource").map(e => e.name)
          .filter(u => /studio\\.ximalaya\\.com|anchor.*\\.ximalaya/.test(u) && !/\\.(js|css|png|jpg|webp|gif|woff|svg|ico)/.test(u));
        return JSON.parse(JSON.stringify({
          url: location.href, title: document.title,
          bodyText: ((document.body && document.body.innerText) || "").slice(0, 800),
          fileInputs: Array.from(document.querySelectorAll("input[type=file]")).map(i => ({ cls: String(i.className).slice(0,80), accept: i.accept })),
          resources: resources.slice(0, 40),
        }));
      })()`,
      { timeoutMs: 20000 },
    );
  },
);
console.log("UPLOAD:", JSON.stringify(up, null, 2));
process.exit(0);
