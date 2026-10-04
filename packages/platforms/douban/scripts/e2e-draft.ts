/* e2e：豆瓣存草稿全链路 — 纯文字 / 画廊贴图 / 图文混排（创建 → 链接恢复校验 → 删除） */
import { doubanAdapter } from "../src/index";
import { evaluateScalar, withPage } from "@tassello/cdp";
const ctx = { secrets: { get: async () => null, set: async () => {} }, log: (e: string, p?: unknown) => console.log("[log]", e, p ?? "") };
const onStage = (s: { stage: number; progress: number; message?: string | null }) => console.log("[stage]", s.stage, s.progress, s.message ?? "");
const acct = { id: "t", uid: null, profile: { uid: "215871379", name: "啊莱", ck: null, avatarUrl: null } };

const basePost = { bodyHtml: "", durationSec: null, type: "article" };
const img = { id: "i1", kind: "image", path: "/tmp/dbn-test.png" };

async function checkRestore(url: string) {
  return withPage("douban", { url, keepOpen: false, activate: false, mode: "visible" }, async (cdp, sid) => {
    await new Promise((res) => setTimeout(res, 10000));
    return evaluateScalar<any>(cdp, sid, `(() => {
      const scope = document.querySelector(".DRE-personal-topic-editor") || document;
      const title = scope.querySelector(".DRE-topic-editor-title-inputor");
      const body = Array.from(scope.querySelectorAll("[contenteditable=true]")).filter(e => /DRE-root/.test(e.className)).pop();
      return JSON.parse(JSON.stringify({ title: title ? title.value : null, text: body ? (body.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 50) : null, imgs: body ? body.querySelectorAll("img").length : -1 }));
    })()`, { timeoutMs: 15000 });
  });
}

async function cleanup(ids: string[]) {
  await withPage("douban", { url: "https://www.douban.com/", keepOpen: false, activate: false, mode: "visible" }, async (cdp, sid) => {
    await new Promise((res) => setTimeout(res, 5000));
    await evaluateScalar<boolean>(cdp, sid, `(async () => {
      for (const id of ${JSON.stringify(ids)}) {
        await fetch("https://m.douban.com/rexxar/api/v2/dwarf/drafts?id=" + id, { method: "DELETE", credentials: "include" });
      }
      return true;
    })()`, { timeoutMs: 30000 });
  });
}

/* 1) 纯文字 */
let r = await doubanAdapter.publish({ ...basePost, id: "e2e1", title: "tassello e2e 文字草稿", body: "第一段。\n第二段。", assets: [] } as never, acct as never, ctx, onStage);
console.log("text:", r.url);
let v = await checkRestore(r.url!);
console.log("  restore:", JSON.stringify(v));
const cleanupText: string | undefined = r.receipt?.draftId; if (!cleanupText) throw new Error("no receipt");
await cleanup([cleanupText]);

/* 2) 画廊贴图（正文空） */
r = await doubanAdapter.publish({ ...basePost, id: "e2e2", title: "tassello e2e 画廊草稿", body: "", assets: [img, { ...img, id: "i2" }] } as never, acct as never, ctx, onStage);
console.log("gallery:", r.url);
v = await checkRestore(r.url!);
console.log("  restore:", JSON.stringify(v));
const cleanupGallery: string | undefined = r.receipt?.draftId; if (!cleanupGallery) throw new Error("no receipt");
await cleanup([cleanupGallery]);

/* 3) 图文混排（占位行） */
r = await doubanAdapter.publish({ ...basePost, id: "e2e3", title: "tassello e2e 混排草稿", body: "开头一段。\n[图1]\n结尾一段。", assets: [img] } as never, acct as never, ctx, onStage);
console.log("mixed:", r.url);
v = await checkRestore(r.url!);
console.log("  restore:", JSON.stringify(v));
const cleanupMixed: string | undefined = r.receipt?.draftId; if (!cleanupMixed) throw new Error("no receipt");
await cleanup([cleanupMixed]);

process.exit(0);
