/* 09 补正文：上传 3 图 → 替换 → 粘贴 → 校验 → 保存 */
import { CdpConnection, findExistingChromeDebugPort, resolveChromeProfileDir } from "@tassello/cdp";
import fs from "node:fs";
const port = await findExistingChromeDebugPort({ profileDir: resolveChromeProfileDir() })!;
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);
const targets = (await cdp.send("Target.getTargets") as any).targetInfos.filter((t: any) => t.type === "page" && t.url.includes("appmsgid=100002586"));
const sid = (await cdp.send("Target.attachToTarget", { targetId: targets[0]!.targetId, flatten: true }) as any).sessionId;

const ev = async <T = any>(expr: string, timeoutMs = 15_000): Promise<T> => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, { sessionId: sid, timeoutMs } as any) as any;
  return r?.result?.value as T;
};

const DIR = "/Users/amlei/Data/files/自媒体/文章/图书/苍蝇效应/09-结语-苍蝇与人性/配图/illustrations";
const IMGS = ["01-scene-ethics-balance.png", "02-scene-climate-flies.png", "03-infographic-four-percent.png"];

// 1. 上传
const cdns: string[] = [];
for (const f of IMGS) {
  const b64 = fs.readFileSync(`${DIR}/${f}`).toString("base64");
  const r = await ev(`(async () => {
    const b64 = ${JSON.stringify(b64)};
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fd = new FormData();
    fd.append("file", new Blob([bytes], { type: "image/png" }), ${JSON.stringify(f)});
    const cd = (window.wx && window.wx.commonData && window.wx.commonData.data) || {};
    const seq = Date.now();
    const url = "/cgi-bin/filetransfer?action=upload_material&f=json&scene=8&writetype=doublewrite&groupid=1"
      + "&ticket_id=" + (cd.ticket_id || "") + "&ticket_token=" + (cd.ticket_token || "")
      + "&svr_time=" + Math.floor(seq / 1000) + "&lang=zh_CN&seq=" + seq;
    const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
    return await res.json().catch(() => null);
  })()`, 120_000);
  const cdn = r?.cdn_url || r?.content?.url || "";
  if (!cdn) throw new Error("上传失败: " + f + " " + JSON.stringify(r).slice(0, 120));
  cdns.push(cdn);
  console.log("uploaded", f, "→", cdn.slice(0, 70));
}

// 2. 替换正文图片地址
let html = fs.readFileSync("/Users/amlei/Data/files/自媒体/文章/图书/苍蝇效应/09-结语-苍蝇与人性/09-结语-苍蝇与人性_排版_留白禅意风(zen-whitespace).html", "utf8");
for (let i = 0; i < IMGS.length; i++) html = html.split(`配图/illustrations/${IMGS[i]}`).join(cdns[i]);
const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// 3. 粘贴正文
const pasted = await ev(`(async () => {
  const roots = Array.from(document.querySelectorAll(".ProseMirror")).filter((e) => e.offsetHeight > 80);
  const el = roots.sort((a, b) => b.offsetHeight - a.offsetHeight)[0] || null;
  if (!el) return false;
  el.focus();
  const dt = new DataTransfer();
  dt.setData("text/html", ${JSON.stringify(html)});
  dt.setData("text/plain", ${JSON.stringify(plain.slice(0, 5000))});
  const e = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
  el.dispatchEvent(e);
  await new Promise((r) => setTimeout(r, 800));
  return true;
})()`, 30_000);
console.log("pasted:", pasted);
await sleep(3000);

// 4. 严格校验：有 mmbiz 图 + 没有占位符
const check = await ev(`(() => {
  const pms = Array.from(document.querySelectorAll(".ProseMirror")).filter((e) => e.offsetHeight > 40);
  const body = pms.sort((a, b) => b.offsetHeight - a.offsetHeight)[0];
  return JSON.stringify({
    imgs: body ? body.querySelectorAll("img").length : -1,
    mmbiz: body ? Array.from(body.querySelectorAll("img")).filter((i) => i.src.includes("mmbiz")).length : -1,
    placeholder: body ? body.textContent.includes("从这里开始写正文") : true,
    textLen: body ? body.textContent.replace(/\\s+/g, "").length : 0,
  });
})()`);
console.log("check:", check);
const c = JSON.parse(check as any);
if (!c.mmbiz || c.mmbiz < 3 || c.placeholder) throw new Error("正文校验未通过: " + check);

// 5. 保存
const saved = await ev(`(async () => {
  const btn = Array.from(document.querySelectorAll("button, a, .weui-desktop-btn")).filter((b) => b.offsetHeight > 0 && (b.textContent || "").trim() === "保存为草稿")[0];
  if (!btn) return false;
  btn.click();
  await new Promise((r) => setTimeout(r, 4000));
  return true;
})()`, 20_000);
console.log(saved ? "草稿已保存" : "未找到保存按钮");

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
process.exit(0);
