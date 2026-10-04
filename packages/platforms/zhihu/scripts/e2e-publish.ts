/* e2e：知乎发布全链路真机验证（想法 + 文章；内容带「[tassello 测试]」前缀，验证后自动删除）
 * 前提：9342 独立 Chrome（probe-profiles/zhihu）已登录知乎。
 * 用法：TASSELLO_CHROME_PROFILE=~/.local/share/tassello/probe-profiles/zhihu \
 *       bun packages/platforms/zhihu/scripts/e2e-publish.ts [pin|article]
 * 说明：适配器走 @tassello/cdp 共享池；设 TASSELLO_CHROME_PROFILE 指向探针 profile 且 9342 Chrome
 *       在跑时，池会读 DevToolsActivePort/ps 直接复用，不打新 Chrome。
 * 探针内容若残留可用 scripts/cleanup-e2e.ts pin:<id> article:<id> 手工清理。
 */
import { zhihuAdapter } from "../src/index";
import { evaluateScalar, withPage } from "@tassello/cdp";

const ctx = { secrets: { get: async () => null, set: async () => {} }, log: (e: string, p?: unknown) => console.log("[log]", e, p ?? "") };
const onStage = (s: { stage: number; progress: number; message?: string | null }) => console.log("[stage]", s.stage, s.progress, s.message ?? "");
const only = process.argv[2]; // "pin" | "article" | undefined
const acct = { id: "t", uid: null, profile: undefined as never };
const base = { id: "e2e", bodyHtml: "", durationSec: null, assets: [] as { id: string; kind: string; path: string }[] };

/* 探针内容清理：想法 DELETE /api/v4/pins/<id>；文章 DELETE /api/v4/articles/<id>（同发布通道裸 fetch） */
async function cleanup(kind: "pin" | "article", id: string): Promise<void> {
  const seg = kind === "pin" ? "pins" : "articles";
  const r = await withPage("zhihu", { url: "https://www.zhihu.com/creator", keepOpen: false, activate: false }, async (cdp, sid) => {
    // 必须等页面真正落在 zhihu.com：about:blank 上读 document.cookie 会 SecurityError
    for (let i = 0; i < 15; i++) {
      const ready = await evaluateScalar<boolean>(cdp, sid, `location.hostname === "www.zhihu.com" && document.readyState === "complete"`, { timeoutMs: 5_000 }).catch(() => false);
      if (ready) break;
      await new Promise((res) => setTimeout(res, 1_500));
    }
    return evaluateScalar<{ status: number }>(cdp, sid, `(async () => {
      const xsrf = (document.cookie.match(/_xsrf=([^;]+)/) || [])[1] || "";
      const r = await fetch("https://www.zhihu.com/api/v4/${seg}/${id}", {
        method: "DELETE", credentials: "include",
        headers: { "x-requested-with": "fetch", "x-xsrftoken": xsrf },
      });
      return JSON.parse(JSON.stringify({ status: r.status }));
    })()`, { timeoutMs: 20_000 });
  });
  console.log(`[cleanup] ${kind}:${id} → HTTP ${r.status}`);
}

if (only !== "article") {
  console.log("===== e2e：想法（纯文字，type=image）=====");
  const pinPost = { ...base, type: "image", title: "", body: "[tassello 测试] 想法接口通道 e2e，验证后自动删除。" };
  try {
    const r = await zhihuAdapter.publish(pinPost as never, acct as never, ctx, onStage);
    console.log("pin publish:", JSON.stringify(r));
    if (r.needsManualConfirm) throw new Error("想法不应停在人工确认");
    const pinId = r.receipt?.pinId ?? "";
    if (!r.url?.startsWith("https://www.zhihu.com/pin/") || !pinId) throw new Error("想法回执异常");
    await cleanup("pin", pinId);
    console.log("PIN_E2E_OK");
  } catch (e) {
    console.log("PIN_E2E_FAIL:", e instanceof Error ? e.message : e);
  }
}

if (only !== "pin") {
  console.log("===== e2e：文章（type=article）=====");
  const artPost = {
    ...base, type: "article",
    title: "[tassello 测试] 专栏接口通道 e2e",
    body: "第一段：tassello 知乎通道 e2e。\n第二段：验证后自动删除。",
  };
  try {
    const r = await zhihuAdapter.publish(artPost as never, acct as never, ctx, onStage);
    console.log("article publish:", JSON.stringify(r));
    if (r.needsManualConfirm) throw new Error(`文章直发失败，停在草稿：${r.url}`);
    const articleId = r.receipt?.articleId ?? "";
    if (!r.url?.startsWith("https://zhuanlan.zhihu.com/p/") || !articleId) throw new Error("文章回执异常");
    await cleanup("article", articleId);
    console.log("ARTICLE_E2E_OK");
  } catch (e) {
    console.log("ARTICLE_E2E_FAIL:", e instanceof Error ? e.message : e);
  }
}
process.exit(0);
