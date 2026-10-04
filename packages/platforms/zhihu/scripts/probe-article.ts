/* 文章通道真机探针：zhuanlan.zhihu.com/write 页面上下文，纯接口三步链路
 * POST /api/articles/drafts 建草稿 → PATCH /api/articles/<id>/draft 写正文 → POST content/publish 发布
 * 发布后自动删除探针文章。免签名头实测（x-zse-96/x-zst-81 非必需）。
 * 运行：bun packages/platforms/zhihu/scripts/probe-article.ts（前提：9342 独立 Chrome 已登录知乎） */
import { CdpConnection, openPageSession, evaluateScalar } from "@tassello/cdp";
const ver = await fetch("http://127.0.0.1:9342/json/version").then((r) => r.json() as Promise<{ webSocketDebuggerUrl: string }>);
const cdp = await CdpConnection.connect(ver.webSocketDebuggerUrl, 10_000);
const page = await openPageSession({ cdp, reusing: true, url: "https://zhuanlan.zhihu.com/write", enableRuntime: true, enablePage: true });
await new Promise((r) => setTimeout(r, 6000));
const ev = <T>(expr: string) => evaluateScalar<T>(cdp, page.sessionId, expr, { timeoutMs: 30_000 });
const api = (url: string, method: string, body?: unknown) => `(async () => {
  try {
    const r = await fetch(${JSON.stringify(url)}, {
      method: ${JSON.stringify(method)}, credentials: "include",
      headers: Object.assign({ Accept: "application/json" }, ${body === undefined ? "{}" : '{"Content-Type": "application/json"}'}),
      body: ${body === undefined ? "undefined" : JSON.stringify(JSON.stringify(body))},
    });
    const t = await r.text();
    let data = null; try { data = JSON.parse(t); } catch {}
    return JSON.parse(JSON.stringify({ status: r.status, data, body: t.slice(0, 400) }));
  } catch (e) { return JSON.parse(JSON.stringify({ status: 0, data: null, body: String(e) })); }
})()`;

const TITLE = "[tassello 探针] 纯接口文章链路";
const HTML = "<p>tassello 纯接口文章链路探针，稍后删除。</p>";

const created = await ev<{ status: number; data: { id?: string } | null }>(api("https://zhuanlan.zhihu.com/api/articles/drafts", "POST", { title: TITLE, delta_time: 0, can_reward: true }));
const draftId = String(created.data?.id ?? "");
console.log("create:", created.status, "draftId:", draftId);

if (draftId) {
  const patched = await ev<{ status: number }>(api(`https://zhuanlan.zhihu.com/api/articles/${draftId}/draft`, "PATCH", { content: HTML, table_of_contents: false, delta_time: 1, can_reward: true }));
  console.log("patch:", patched.status);
  const pub = await ev<{ status: number; data: any }>(api("https://www.zhihu.com/api/v4/content/publish", "POST", {
    action: "article",
    data: {
      publish: { traceId: `${Date.now()},${crypto.randomUUID()}` },
      extra_info: { publisher: "pc", pc_business_params: JSON.stringify({ commentPermission: "anyone", disclaimer_type: "none", disclaimer_status: "close", table_of_contents_enabled: false, content: HTML, title: TITLE, commercial_report_info: { commercial_types: [] }, commercial_zhitask_bind_info: null, canReward: true }) },
      draft: { disabled: 1, id: draftId, isPublished: false },
      commentsPermission: { comment_permission: "anyone" },
      creationStatement: { disclaimer_type: "none", disclaimer_status: "close" },
      contentsTables: { table_of_contents_enabled: false },
      commercialReportInfo: { isReport: 0 },
      appreciate: { can_reward: true },
    },
  }));
  let articleId = "";
  try { articleId = String(JSON.parse(pub.data?.result ?? "")?.id ?? ""); } catch {}
  console.log("publish:", pub.status, "articleId:", articleId);
  // 清理探针文章（已发布文章用 v4 DELETE，200 即删成）
  const del = await ev<{ status: number }>(api(`https://www.zhihu.com/api/v4/articles/${articleId || draftId}`, "DELETE"));
  console.log("delete:", articleId || draftId, "→", del.status);
}
await cdp.send("Target.closeTarget", { targetId: page.targetId }).catch(() => {});
process.exit(0);
