/**
 * add-cover v2 —— 给已保存的公众号文章草稿补封面（精确匹配，停在编辑页）
 *
 * 流程：filetransfer(scene=8) 上传封面 → 拿到唯一 cdn 路径 → 打开「选择图片」图库 →
 *       按唯一串找到对应图块 → 选中 → 下一步 → 裁剪确认 → 保存。
 * （v1 的「喂文件+选第一块」有竞态：上传未完成时选中的是库里上一张最新图）
 *
 * 用法：bun scripts/add-cover.ts --appmsgid <id> --cover <png> [--token <t>] [--itemidx 1]
 */
import { CdpConnection, findChromeExecutable, findExistingChromeDebugPort, launchChrome, resolveChromeProfileDir, waitForChromeDebugPort } from "@tassello/cdp";
import fs from "node:fs";
import path from "node:path";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const appmsgid = arg("appmsgid");
const coverPath = path.resolve(arg("cover") ?? "");
const itemidx = arg("itemidx") ?? "1";
let token = arg("token") ?? null;
if (!appmsgid || !fs.existsSync(coverPath)) {
  console.error("用法：bun scripts/add-cover.ts --appmsgid <id> --cover <png> [--token <t>] [--itemidx 1]");
  process.exit(1);
}

/* 1. Chrome */
const profileDir = resolveChromeProfileDir();
let port = await findExistingChromeDebugPort({ profileDir }) ?? 0;
if (!port) {
  const chromePath = findChromeExecutable({
    candidates: { darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"], win32: [], default: ["/usr/bin/google-chrome"] },
  })!;
  port = 9333;
  launchChrome({ chromePath, profileDir, port, extraArgs: ["--remote-allow-origins=*", "--window-size=1440,900"] });
  await waitForChromeDebugPort(port, 30_000);
}
const ws = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((j: any) => j.webSocketDebuggerUrl);
const cdp = await CdpConnection.connect(ws, 10_000);

const ev = async <T = any>(expr: string, timeoutMs = 10_000): Promise<T> => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, { sessionId, timeoutMs } as any) as any;
  return r?.result?.value as T;
};
let sessionId = "";

/* 2. token */
if (!token) {
  const targets = (await cdp.send("Target.getTargets") as any).targetInfos.filter((t: any) => t.type === "page" && t.url.includes("mp.weixin.qq.com"));
  for (const t of targets) {
    const s = (await cdp.send("Target.attachToTarget", { targetId: t.targetId, flatten: true }) as any).sessionId;
    const r = await cdp.send("Runtime.evaluate", { expression: `(location.search.match(/token=(\\d+)/)||[])[1]||""` }, { sessionId: s }) as any;
    if (r.result?.value) { token = r.result.value; break; }
  }
}
if (!token) { console.error("拿不到 mp token（未登录？）"); process.exit(2); }
console.log("token:", token);

/* 3. 打开草稿编辑器，等封面区就绪 */
const targets = (await cdp.send("Target.getTargets") as any).targetInfos.filter(
  (t: any) => t.type === "page" && t.url.includes("appmsg_edit") && t.url.includes(`appmsgid=${appmsgid}`),
);
let targetId: string;
if (targets.length) {
  targetId = targets[0]!.targetId;
} else {
  const url = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&appmsgid=${appmsgid}&itemId=${itemidx}&token=${token}&lang=zh_CN`;
  const created = (await cdp.send("Target.createTarget", { url }) as any);
  targetId = created.targetId;
}
sessionId = (await cdp.send("Target.attachToTarget", { targetId, flatten: true }) as any).sessionId;
await cdp.send("Page.enable", {}, { sessionId });
await cdp.send("Target.activateTarget", { targetId });

const mkUrl = (t: string) => `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&appmsgid=${appmsgid}&itemId=${itemidx}&token=${t}&lang=zh_CN`;
const coverReady = async () => ev(`!!document.querySelector("#js_cover_area")`, 8000).catch(() => false);
let navigated = false;
for (let i = 0; i < 20 && !(await coverReady()); i++) {
  await sleep(2000);
  if (i === 8 && !navigated) {
    navigated = true;
    const st = await ev(`JSON.stringify({ token: (location.search.match(/token=(\\d+)/) || [])[1] || null })`, 8000).catch(() => null);
    await cdp.send("Page.navigate", { url: mkUrl(st ? JSON.parse(st).token || token : token) }, { sessionId });
  }
}
if (!(await coverReady())) throw new Error("编辑器封面区未就绪");

/* 4. filetransfer 上传封面 → 唯一 cdn 标识 */
const b64 = fs.readFileSync(coverPath).toString("base64");
const up = await ev(`(async () => {
  const b64 = ${JSON.stringify(b64)};
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type: "image/png" }), "cover.png");
  const cd = (window.wx && window.wx.commonData && window.wx.commonData.data) || {};
  const seq = Date.now();
  const url = "/cgi-bin/filetransfer?action=upload_material&f=json&scene=8&writetype=doublewrite&groupid=1"
    + "&ticket_id=" + (cd.ticket_id || "") + "&ticket_token=" + (cd.ticket_token || "")
    + "&svr_time=" + Math.floor(seq / 1000) + "&lang=zh_CN&seq=" + seq;
  const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
  return await res.json().catch(() => null);
})()`, 120_000);
const cdn: string = up?.cdn_url || up?.content?.url || "";
if (!cdn) throw new Error("封面素材上传失败: " + JSON.stringify(up).slice(0, 200));
// 取 cdn 路径里的唯一文件段（如 mmbiz_jpg/yoibPC.../xxx）
const m = cdn.match(/mmbiz_[a-z]+\/([^/?]+)/);
const uniqueId = m ? m[1]! : cdn.slice(0, 80);
console.log("[upload] cdn:", cdn.slice(0, 80));
console.log("[upload] uniqueId:", uniqueId);

/* 5. 打开图库对话框 */
await ev(`document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); "ok"`);
await sleep(800);
const pickerOpen = () => ev(`(() => {
  const d = Array.from(document.querySelectorAll(".weui-desktop-dialog__wrp")).filter((x) => x.offsetHeight > 0 && (x.innerHTML.includes("从图片库选择") || x.innerHTML.includes("选择图片")));
  return d.length > 0;
})()`);
if (!(await pickerOpen())) {
  const clicked = await ev(`(() => {
    const btn = document.querySelector("a.js_imagedialog") || document.querySelector(".js_imagedialog");
    const area = document.querySelector("#js_cover_area") || document.querySelector(".js_cover_btn_area");
    const el = btn || area;
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.click();
    return true;
  })()`);
  if (!clicked) throw new Error("没找到封面入口");
}
for (let i = 0; i < 10 && !(await pickerOpen()); i++) await sleep(1500);
if (!(await pickerOpen())) throw new Error("图片库对话框未打开");
await sleep(2000);

/* 6. 找到刚上传那张（背景 URL 含唯一串），点选 → 下一步 */
const findAndSelect = async (): Promise<string> => ev(`(() => {
  const dlg = Array.from(document.querySelectorAll(".weui-desktop-dialog__wrp")).filter((d) => d.offsetHeight > 0)[0];
  if (!dlg) return JSON.stringify({ ok: false, why: "no dialog" });
  const uid = ${JSON.stringify(uniqueId)};
  const all = Array.from(dlg.querySelectorAll("*"));
  const tiles = all.filter((e) => {
    const bi = getComputedStyle(e).backgroundImage;
    return bi && bi.indexOf("mmbiz") >= 0 && e.offsetHeight > 15 && e.offsetHeight < 400;
  });
  const hit = tiles.find((e) => getComputedStyle(e).backgroundImage.indexOf(uid) >= 0)
    || tiles.find((e) => { const img = e.querySelector("img"); return img && img.src.indexOf(uid) >= 0; })
    || all.filter((e) => e.tagName === "IMG" && e.src.indexOf(uid) >= 0 && e.offsetHeight > 15)[0];
  if (!hit) return JSON.stringify({ ok: false, why: "not found", tiles: tiles.length });
  const target = (hit.querySelector("img") ? hit : hit);
  target.scrollIntoView({ block: "center" });
  target.click();
  return JSON.stringify({ ok: true });
})()`, 20_000);

let sel: any = null;
for (let i = 0; i < 12; i++) {
  await sleep(2500);
  sel = await findAndSelect();
  const parsed = JSON.parse(sel as any);
  if (parsed.ok) break;
  // 未找到时尝试点左侧「我的图片 / 最近使用」分类刷新列表
  if (i === 2 || i === 6) {
    await ev(`(() => {
      const dlg = Array.from(document.querySelectorAll(".weui-desktop-dialog__wrp")).filter((d) => d.offsetHeight > 0)[0];
      if (!dlg) return false;
      const tab = Array.from(dlg.querySelectorAll("a, li, strong")).filter((e) => e.offsetHeight > 0 && /^(我的图片|最近使用)$/.test((e.textContent || "").trim()))[0];
      if (tab) tab.click();
      return true;
    })()`);
  }
}
if (!sel || !JSON.parse(sel as any).ok) throw new Error("图库中未找到刚上传的封面: " + sel);
console.log("[select] 已选中刚上传的封面");
await sleep(1500);
await ev(`(() => {
  const dlg = Array.from(document.querySelectorAll(".weui-desktop-dialog__wrp")).filter((d) => d.offsetHeight > 0)[0];
  const btns = Array.from(dlg.querySelectorAll("button, .weui-desktop-btn")).filter((b) => b.offsetHeight > 0);
  const next = btns.find((b) => (b.textContent || "").trim() === "下一步");
  if (next) next.click();
  return true;
})()`);
await sleep(3000);

/* 7. 裁剪 → 确认；轮询封面生效 */
const deadline = Date.now() + 120_000;
let done = false;
while (Date.now() < deadline) {
  await sleep(2500);
  const st = await ev(`(() => {
    const dlg = Array.from(document.querySelectorAll(".weui-desktop-dialog__wrp")).filter((d) => d.offsetHeight > 0 && d.innerHTML.includes("编辑封面"))[0];
    if (dlg) {
      const btn = Array.from(dlg.querySelectorAll("button, .weui-desktop-btn")).filter((b) => b.offsetHeight > 0 && /^(确认|确定|完 成|完成)$/.test((b.textContent || "").trim()))[0];
      if (btn) { btn.click(); return JSON.stringify({ clicked: "确认" }); }
    }
    const area = document.querySelector("#js_cover_area");
    const bg = area ? Array.from(area.querySelectorAll("*")).find((e) => (getComputedStyle(e).backgroundImage || "").indexOf(${JSON.stringify(uniqueId.slice(0, 40))}) >= 0) : null;
    const img = area && area.querySelector("img");
    return JSON.stringify({ cover: !!(bg || img), exact: !!bg });
  })()`);
  const s = JSON.parse(st);
  if (s.clicked) console.log("[crop]", s.clicked);
  if (s.cover) {
    console.log("[cover] 封面已设置为刚上传的图（精确匹配）");
    done = true;
    break;
  }
}
if (!done) throw new Error("未检测到封面生效");

/* 8. 保存草稿 */
const saved = await ev(`(async () => {
  const btn = Array.from(document.querySelectorAll("button, a, .weui-desktop-btn")).filter((b) => b.offsetHeight > 0 && (b.textContent || "").trim() === "保存为草稿")[0];
  if (!btn) return false;
  btn.click();
  await new Promise((r) => setTimeout(r, 3000));
  return true;
})()`, 20_000);
console.log(saved ? "草稿已保存" : "未找到保存按钮（请手动保存）");
console.log("DONE");
process.exit(0);
