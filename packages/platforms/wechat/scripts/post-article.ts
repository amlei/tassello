/**
 * post-article —— 把一篇本地 HTML 文章发到公众号编辑器（停在编辑页，人工「保存为草稿/发表」）
 *
 * 复用 platform-wechat 的验证过的流程（appmsg_edit_v2 编辑器 + filetransfer 换图 + 合成 paste），
 * 差异：适配 gzh-design 风格的 HTML——正文里的本地 <img src="相对路径"> 逐张上传换成 mmbiz CDN，
 * 保留全部内联样式（不退化成裸 <p><img>）。
 *
 * 用法：
 *   bun scripts/post-article.ts --title "标题" --html /path/to/article.html [--digest "摘要"] [--root /图片根目录]
 *
 * 前置：~/.local/share/tassello/chrome-profile 里已登录 mp.weixin.qq.com；
 *       无调试端口时脚本会自己拉起可见 Chrome（tassello profile）。
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateScalar, withPage } from "@tassello/cdp";

const MP_HOME = "https://mp.weixin.qq.com";
const EDITOR_URL = (createType: number, token?: string | null) =>
  `${MP_HOME}/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=${createType}${token ? `&token=${token}` : ""}&lang=zh_CN`;

type Cdp = { send: <R = unknown>(method: string, params?: Record<string, unknown>, opts?: { sessionId?: string }) => Promise<R> };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const htmlPath = path.resolve(arg("html") ?? "");
const title = (arg("title") ?? "未命名").slice(0, 64);
const root = path.resolve(arg("root") ?? path.dirname(htmlPath));
if (!fs.existsSync(htmlPath)) {
  console.error(`HTML 不存在：${htmlPath}`);
  process.exit(1);
}
let html = fs.readFileSync(htmlPath, "utf8");

/* ---------- 与 platform-wechat 一致的页内工具 ---------- */

async function waitForJs(cdp: Cdp, sessionId: string, js: string, timeoutMs: number, label: string, intervalMs = 1500) {
  const start = Date.now();
  for (;;) {
    try {
      if (await evaluateScalar<boolean>(cdp, sessionId, js, { timeoutMs: 8000 })) return;
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error(`等待${label}超时（页面结构可能变更）`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** 两段导航：先落 mp 首页拿 token（无 token 的编辑器 URL 会直接“登录超时”），再进编辑器 */
async function openEditor(cdp: Cdp, sessionId: string): Promise<string> {
  // 第 0 步：若当前 tab 已是就绪编辑器（重跑场景），直接用
  const probe = (timeoutMs: number) =>
    evaluateScalar<{ onScan: boolean; token: string | null; onEditor: boolean; titleReady: boolean }>(
      cdp,
      sessionId,
      `JSON.parse(JSON.stringify({
        onScan: !!document.querySelector(".login__type__container__scan, #scan_qrcode"),
        token: (location.search.match(/token=(\\d+)/) || [])[1] || null,
        onEditor: location.href.indexOf("appmsg_edit") >= 0,
        titleReady: !!document.querySelector("textarea#title") && !!document.querySelector(".ProseMirror"),
      }))`,
      { timeoutMs },
    ).catch(() => null);

  let st = await probe(6000);
  if (st?.onScan) throw new Error("公众号后台未登录：请先在弹出的 Chrome 里扫码登录 tassello profile");
  if (st?.onEditor && st.titleReady) return st.token ?? "";

  // 第 1 步：回首页拿 token（已登录会 302 到 /cgi-bin/home?...&token=xxx）
  const start = Date.now();
  let token: string | null = null;
  await cdp.send("Page.navigate", { url: MP_HOME }, { sessionId });
  while (Date.now() - start < 30_000) {
    await new Promise((r) => setTimeout(r, 1500));
    st = await probe(6000).catch(() => null);
    if (st?.onScan) throw new Error("公众号后台未登录：请先在弹出的 Chrome 里扫码登录 tassello profile");
    if (st?.token) { token = st.token; break; }
  }
  if (!token) throw new Error("mp 首页未拿到会话 token（可能未登录）");

  // 第 2 步：带 token 进编辑器，等标题 + 正文编辑器就绪
  await cdp.send("Page.navigate", { url: EDITOR_URL(0, token) }, { sessionId });
  const deadline = Date.now() + 45_000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    st = await probe(6000).catch(() => null);
    if (st?.onEditor && st.titleReady) return st.token ?? token;
    if (Date.now() - start > 60_000 && !(await probe(6000).catch(() => null))?.onEditor)
      throw new Error("公众号编辑器加载超时（可能未登录或页面结构变更）");
    if (Date.now() - start > 90_000) throw new Error("公众号编辑器加载超时（可能未登录或页面结构变更）");
  }
}

/** 页内 filetransfer 上传（scene=8）→ cdn 地址；ticket 为空也可用 */
async function uploadImage(cdp: Cdp, sessionId: string, filePath: string): Promise<string> {
  const b64 = fs.readFileSync(filePath).toString("base64");
  const r = await evaluateScalar<{ ret?: number; errMsg?: string; cdn?: string | null; body?: string }>(
    cdp,
    sessionId,
    `(async () => {
      const b64 = ${JSON.stringify(b64)};
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const fd = new FormData();
      fd.append("file", new Blob([bytes], { type: "image/png" }), "img.png");
      const cd = (window.wx && window.wx.commonData && window.wx.commonData.data) || {};
      const seq = Date.now();
      const url = "/cgi-bin/filetransfer?action=upload_material&f=json&scene=8&writetype=doublewrite&groupid=1"
        + "&ticket_id=" + (cd.ticket_id || "") + "&ticket_token=" + (cd.ticket_token || "")
        + "&svr_time=" + Math.floor(seq / 1000) + "&lang=zh_CN&seq=" + seq;
      const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
      const j = await res.json().catch(() => null);
      const base = j && j.base_resp;
      if (!base) return { body: (await res.text().catch(() => ""))?.slice(0, 200) };
      return { ret: base.ret, errMsg: base.err_msg, cdn: j.cdn_url || (j.content && j.content.url) || null };
    })()`,
    { timeoutMs: 120_000 },
  );
  if (r.ret !== 0 || !r.cdn) throw new Error(`图片上传失败（${r.errMsg || r.body || "无响应"}）：${filePath}`);
  return r.cdn;
}

async function fillTextarea(cdp: Cdp, sessionId: string, selector: string, value: string): Promise<boolean> {
  return evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const ta = document.querySelector(${JSON.stringify(selector)});
      if (!ta) return false;
      const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      ta.focus();
      if (desc && desc.set) desc.set.call(ta, ${JSON.stringify(value)});
      else ta.value = ${JSON.stringify(value)};
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
    { timeoutMs: 10_000 },
  );
}

async function pasteIntoProseMirror(cdp: Cdp, sessionId: string, pickJs: string, html: string, plain: string): Promise<boolean> {
  return evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(async () => {
      const pick = ${pickJs};
      const el = pick(Array.from(document.querySelectorAll(".ProseMirror")));
      if (!el) return false;
      el.focus();
      const dt = new DataTransfer();
      dt.setData("text/html", ${JSON.stringify(html)});
      dt.setData("text/plain", ${JSON.stringify(plain)});
      const ev = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
      el.dispatchEvent(ev);
      await new Promise((r) => setTimeout(r, 400));
      return true;
    })()`,
    { timeoutMs: 15_000 },
  );
}

/* ---------- 主流程 ---------- */

// 1. 收集本地图片引用（相对 root 解析）
const localSrcs = [...html.matchAll(/<img[^>]*src="(?!https?:|data:)([^"]+)"/g)].map((m) => m[1]!);
const uniq = [...new Set(localSrcs)];
const files = uniq.map((src) => path.resolve(root, src.split("?")[0]!));
for (const f of files) {
  if (!fs.existsSync(f)) {
    console.error(`图片不存在：${f}（root=${root}）`);
    process.exit(1);
  }
}
const plainText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const digest = arg("digest") ?? plainText.slice(0, 120);
const saveDraft = process.argv.includes("--save-draft");

await withPage("wechat", { url: EDITOR_URL(0, null), keepOpen: true, activate: true, mode: "visible" }, async (cdp, sid) => {
  const token = await openEditor(cdp, sid);
  console.log(`[wechat] 编辑器就绪 token=${token ?? "?"}`);

  // 2. 逐张上传本地图 → CDN，回填正文
  for (let i = 0; i < uniq.length; i++) {
    const src = uniq[i]!;
    const cdn = await uploadImage(cdp, sid, files[i]!);
    html = html.split(src).join(cdn);
    console.log(`[img ${i + 1}/${uniq.length}] ${path.basename(files[i]!)} → ${cdn.slice(0, 60)}…`);
  }

  // 3. 标题（textarea 提交字段 + 标题 ProseMirror 双写）
  if (!(await fillTextarea(cdp, sid, "textarea#title", title))) {
    throw new Error("未找到公众号标题输入框（页面结构可能变更）");
  }
  await evaluateScalar(
    cdp,
    sid,
    `(() => {
      const pm = Array.from(document.querySelectorAll(".ProseMirror")).find((e) => (e.offsetHeight > 0 && e.offsetHeight < 60));
      if (pm && !pm.textContent.trim()) {
        const dt = new DataTransfer();
        dt.setData("text/plain", ${JSON.stringify(title)});
        pm.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
      }
      return true;
    })()`,
    { timeoutMs: 10_000 },
  );
  if (digest) await fillTextarea(cdp, sid, "textarea#js_description", digest);
  console.log("[wechat] 标题与摘要已填");

  // 4. 正文：非标题区里最高的 ProseMirror
  const pasted = await pasteIntoProseMirror(
    cdp,
    sid,
    `(roots) => roots.filter((e) => e.offsetHeight > 80).sort((a, b) => b.offsetHeight - a.offsetHeight)[0] || null`,
    html,
    plainText,
  );
  if (!pasted) throw new Error("未找到公众号正文编辑区（页面结构可能变更）");

  // 5. 等编辑器真吃下内容
  await waitForJs(
    cdp,
    sid,
    `(() => {
      const pms = Array.from(document.querySelectorAll(".ProseMirror")).filter((e) => e.offsetHeight > 40);
      const body = pms.find((e) => e.querySelector("p, img, h1, h2, h3, blockquote, ul, ol, section"));
      return !!body && (body.textContent.replace(/\\s+/g, "").length > 0 || body.querySelectorAll("img").length >= 1);
    })()`,
    20_000,
    "正文填充校验",
  );
  console.log("[wechat] 正文已粘贴");

  // 5.5 可选：自动「保存为草稿」并取回 appmsgid（草稿编辑 URL）
  if (saveDraft) {
    const clicked = await evaluateScalar<boolean>(
      cdp,
      sid,
      `(() => {
        const btn = Array.from(document.querySelectorAll("button, a, .weui-desktop-btn")).filter((b) => b.offsetHeight > 0 && (b.textContent || "").trim() === "保存为草稿")[0];
        if (!btn) return false;
        btn.click();
        return true;
      })()`,
      { timeoutMs: 10_000 },
    );
    if (!clicked) throw new Error("未找到「保存为草稿」按钮（页面结构可能变更）");
    let appmsgid: string | null = null;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const st = await evaluateScalar<{ appmsgid: string | null; errTip: string | null }>(
        cdp,
        sid,
        `JSON.parse(JSON.stringify({
          appmsgid: (location.search.match(/appmsgid=(\\d+)/) || [])[1] || null,
          errTip: (document.querySelector(".weui-desktop-dialog__wrp") && document.body.innerText.includes("错误")) ? document.body.innerText.slice(0, 120) : null,
        }))`,
        { timeoutMs: 8000 },
      ).catch(() => null);
      if (st?.appmsgid) { appmsgid = st.appmsgid; break; }
    }
    if (!appmsgid) throw new Error("已点击保存但未取到 appmsgid（请到草稿箱确认）");
    const token = (await evaluateScalar<string>(cdp, sid, `(location.search.match(/token=(\\d+)/)||[])[1]||""`, { timeoutMs: 8000 })) || "";
    console.log(`SAVED_DRAFT appmsgid=${appmsgid}`);
    console.log(`DRAFT_URL https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&appmsgid=${appmsgid}&itemId=1&token=${token}&lang=zh_CN`);
  } else {
    console.log("[wechat] 请在 Chrome 窗口里检查后「保存为草稿」或「发表」");
  }
});
console.log("DONE（编辑页已保留）");
