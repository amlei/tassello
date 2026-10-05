/* e2e：豆瓣富文本草稿全链路 — bodyHtml（标题/粗/斜/删/下划线/高亮/行内码/列表/引用/链接/图文混排）
 * → adapter.publish 存草稿 → 打开草稿链接校验编辑器恢复 → 删除草稿。
 * 真机验证映射见 docs/platforms.md §2.6 与 src/html-to-blocks.ts 注释。 */
import { writeFileSync } from "node:fs";
import { evaluateScalar, withPage } from "@tassello/cdp";
import { doubanAdapter } from "../src/index";

type RunFn = Parameters<typeof withPage>[2];
type RunCdp = Parameters<RunFn>[0];
const ctx = {
  runPage: <T,>(platformId: string, opts: Parameters<typeof withPage>[1], fn: (cdp: RunCdp, sessionId: string) => Promise<T>) => withPage<T>(platformId, opts, fn),
  secrets: { get: async () => null, set: async () => {} },
  log: (e: string, p?: unknown) => console.log("[log]", e, p ?? ""),
};
const onStage = (s: { stage: number; progress: number; message?: string | null }) => console.log("[stage]", s.stage, s.progress, s.message ?? "");
const acct = { id: "e2e", uid: null, profile: { uid: "e2e", name: null, ck: null, avatarUrl: null } };

/* 4x4 红点 png（真机要过编辑器校验，别用 1x1） */
const imgPath = "/tmp/dbn-e2e-rich.png";
writeFileSync(imgPath, Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR42mP8z8AAw0DGaYQGAwDkCAf9TKssogAAAABJRU5ErkJggg==", "base64"));

const bodyHtml = [
  "<h2>富文本探针标题</h2>",
  "<p>开头<strong>加粗</strong>、<em>斜体</em>、<u>下划线</u>、<s>删除线</s>、<mark>高亮</mark>、<code>行内码</code>混排。</p>",
  '<p>中间<a href="https://example.com/tassello">一个链接</a>。</p>',
  '<figure class="m-fig" data-asset="i1" data-alt="配图"></figure>',
  "<ul><li>无序一</li><li>无序二</li></ul>",
  "<ol><li>有序一</li></ol>",
  "<blockquote>引用一句。</blockquote>",
  "<p>结尾段落。</p>",
].join("");

const r = await doubanAdapter.publish({
  id: "e2e-rich", type: "article", title: "Tassello 富文本 e2e", body: "富文本探针", bodyHtml,
  durationSec: null, assets: [{ id: "i1", kind: "image", path: imgPath }],
} as never, acct as never, ctx as never, onStage);
console.log("publish:", JSON.stringify(r));
const draftId = (r.receipt as { draftId?: string } | null)?.draftId;
if (!r.url || !draftId) throw new Error("未拿到草稿链接");

type RichSummary = {
  seq: string[]; h3: number; strong: number; em: number; underline: number; strike: number;
  mark: number; code: number; links: number; imgs: number; ul: number; ol: number; blockquote: number;
};
const v = await withPage("douban", { url: r.url, keepOpen: false, activate: false }, async (cdp: RunCdp, sid: string): Promise<RichSummary> => {
  const start = Date.now();
  for (;;) {
    const out = await evaluateScalar<{ ready: boolean; summary?: RichSummary }>(cdp, sid, `(() => {
      const body = Array.from(document.querySelectorAll("[contenteditable=true]")).filter(e => /DRE-root/.test(e.className)).pop();
      if (!body) return { ready: false };
      const text = (body.textContent || "").replace(/\\s+/g, "");
      if (text.indexOf("富文本探针标题") < 0) return { ready: false };
      const cnt = (sel) => body.querySelectorAll(sel).length;
      const seq = Array.from(body.children).map((el) => el.tagName.toLowerCase()).slice(0, 14);
      return JSON.parse(JSON.stringify({ ready: true, summary: {
        seq,
        h3: cnt("h3"), strong: cnt("strong,b"), em: cnt("em,i"), underline: cnt(".DRE-underline"),
        strike: cnt(".DRE-strikethrough"), mark: cnt("mark"), code: cnt("code"),
        links: cnt("a[href]"), imgs: cnt("img"), ul: cnt("ul"), ol: cnt("ol"), blockquote: cnt("blockquote"),
      } }));
    })()`, { timeoutMs: 15000 }).catch((): { ready: boolean; summary?: RichSummary } => ({ ready: false }));
    if (out.ready && out.summary) return out.summary;
    if (Date.now() - start > 45000) throw new Error("编辑器 45s 内未恢复草稿");
    await new Promise((res) => setTimeout(res, 2500));
  }
});
console.log("restore:", JSON.stringify(v, null, 2));

const ok = v.h3 === 1 && v.mark >= 1 && v.imgs === 1 && v.blockquote === 1;
console.log(ok ? "RICH E2E PASS" : "RICH E2E FAIL");

/* 删除探针草稿，避免脏数据 */
await withPage("douban", { url: "https://www.douban.com/", keepOpen: false, activate: false }, async (cdp, sid) => {
  await new Promise((res) => setTimeout(res, 5000));
  await evaluateScalar(cdp, sid, `(async () => {
    await fetch("https://m.douban.com/rexxar/api/v2/dwarf/drafts?id=${draftId}", { method: "DELETE", credentials: "include" });
    return true;
  })()`, { timeoutMs: 30000 });
});
console.log("cleanup done:", draftId);
process.exit(ok ? 0 : 1);
