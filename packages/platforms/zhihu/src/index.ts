/* @tassello/platform-zhihu —— 知乎适配器：HTTP 接口通道（想法直发 + 专栏直发）
 *
 * 通道选型与真机结论（2026-10-02，详见 NOTES.md，可并入 docs/platforms.md §2）：
 * - verify：GET https://www.zhihu.com/api/v4/me（页面上下文 fetch，带 cookie，干净 JSON，无需签名）
 * - 想法（贴图）：POST https://www.zhihu.com/api/v4/content/publish（action=pin，接口直发，
 *   只需 cookie + _xsrf cookie 作 x-xsrftoken 头，x-zse-96/x-zst-81 签名头实测非强制）
 *   → 回执 https://www.zhihu.com/pin/<id>；删除 DELETE /api/v4/pins/<id>（同样裸 fetch 可用）
 * - 文章：zhuanlan 域三步直发 ——
 *     1) POST https://zhuanlan.zhihu.com/api/articles/drafts   {title, delta_time:0, can_reward:true} → {id}
 *     2) PATCH https://zhuanlan.zhihu.com/api/articles/<id>/draft {content, table_of_contents:false, ...}
 *     3) POST https://www.zhihu.com/api/v4/content/publish（action=article，data.draft.id=草稿id）
 *   → 回执 https://zhuanlan.zhihu.com/p/<id>；第 3 步失败则停留在草稿（needsManualConfirm）
 * - 老接口已死：POST /api/v4/pins（400 Missing argument content，真实端点已迁到 content/publish）、
 *   zhuanlan /api/posts/drafts（404，已迁到 /api/articles/drafts）
 * - 视频：创作平台视频为独立分片上传协议，本期未实现，publish 显式报错（能力缺口见 NOTES.md）
 *
 * 运行时走 @tassello/cdp 共享池（withPage("zhihu", ...)，应用专用 profile）；页面只用来提供
 * 带登录 cookie 的 fetch 上下文，不碰编辑器 DOM（接口失效回退 CDP UI 链路的探针见 scripts/）。
 */
import { z } from "zod";
import type { PlatformAdapter, PostDraft, AdapterCtx, StageReporter, PublishResult } from "@tassello/platform-core";
import { getPlatformMeta } from "@tassello/platform-core";
import { evaluateScalar, withPage } from "@tassello/cdp";

export const zhihuProfileSchema = z.object({
  uid: z.string(),
  name: z.string().nullable().optional(),
  headline: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  isOrg: z.boolean().nullable().optional(),
  urlToken: z.string().nullable().optional(),
});
export type ZhihuProfile = z.infer<typeof zhihuProfileSchema>;

export const ZHIHU_CREATOR_URL = "https://www.zhihu.com/creator";
/** zhuanlan 域页面（提供专栏接口的 fetch 上下文，避开跨域） */
export const ZHIHU_WRITE_URL = "https://zhuanlan.zhihu.com/write";
/** 想法回执链接前缀：https://www.zhihu.com/pin/<id> */
export const ZHIHU_PIN_URL = "https://www.zhihu.com/pin/";
/** 文章回执链接前缀：https://zhuanlan.zhihu.com/p/<id> */
export const ZHIHU_ARTICLE_URL = "https://zhuanlan.zhihu.com/p/";

/** 页面里统一的 fetch 封装前缀：取 _xsrf cookie 作 x-xsrftoken（写操作必需） */
const XSRF = `(document.cookie.match(/_xsrf=([^;]+)/) || [])[1] || ""`;

/** /api/v4/me 响应里用到的字段（snake_case，见 NOTES.md §2） */
type MeFields = {
  id?: number | string;
  name?: string;
  headline?: string;
  avatar_url?: string;
  is_org?: boolean;
  url_token?: string;
};

type PublishApiResp = { code?: number; message?: string; data?: { result?: string } };

/** 从 content/publish 的 result 字符串里抠 id（result 是转义过的 JSON 字符串） */
function extractId(resp: PublishApiResp): string | null {
  const raw = resp.data?.result;
  if (!raw) return null;
  const m = raw.match(/"id"\s*:\s*"(\d+)"/);
  return m?.[1] ?? null;
}

/** 等页面就绪且已登录（/api/v4/me 200） */
async function waitForLogin(
  cdp: Parameters<typeof evaluateScalar>[0],
  sessionId: string,
  timeoutMs = 30_000,
): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    try {
      const r = await evaluateScalar<{ status: number }>(
        cdp,
        sessionId,
        `(async () => {
          try {
            const r = await fetch("https://www.zhihu.com/api/v4/me", { credentials: "include", headers: { Accept: "application/json" } });
            return JSON.parse(JSON.stringify({ status: r.status }));
          } catch { return JSON.parse(JSON.stringify({ status: 0 })); }
        })()`,
        { timeoutMs: 15_000 },
      );
      if (r.status === 200) return true;
    } catch {}
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((res) => setTimeout(res, 1_500));
  }
}

/** 正文 → 段落 HTML（与编辑器产物一致：<p> 一段一个） */
function toHtml(text: string): string {
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `<p>${s}</p>`)
    .join("");
}

/** 正文 → 纯文本（算 textLength） */
function toText(text: string): string {
  return text.replace(/\n+/g, "").trim();
}

export const zhihuAdapter: PlatformAdapter<ZhihuProfile> = {
  meta: getPlatformMeta("zhihu")!,

  account: {
    profileSchema: zhihuProfileSchema,

    async verify(_acct, ctx) {
      ctx.log("zhihu.verify.start");
      try {
        const r = await withPage("zhihu", { url: ZHIHU_CREATOR_URL, keepOpen: false, activate: false }, async (cdp, sid) => {
          if (!(await waitForLogin(cdp, sid))) return { status: 0, data: null };
          return evaluateScalar<{ status: number; data: MeFields | null; err?: string }>(
            cdp,
            sid,
            `(async () => {
              try {
                const r = await fetch("https://www.zhihu.com/api/v4/me", { credentials: "include", headers: { Accept: "application/json" } });
                let data = null;
                try { data = await r.json(); } catch {}
                return JSON.parse(JSON.stringify({ status: r.status, data }));
              } catch (e) {
                return JSON.parse(JSON.stringify({ status: 0, data: null, err: String(e) }));
              }
            })()`,
            { timeoutMs: 20_000 },
          );
        });
        const me = r.data as MeFields | null;
        if (r.status !== 200 || !me?.id) {
          return { state: "fail", failReason: "知乎登录态已失效，请重新登录" };
        }
        ctx.log("zhihu.verify.ok", { uid: String(me.id) });
        return {
          state: "ok",
          profile: {
            uid: String(me.id),
            name: me.name ?? null,
            headline: me.headline ?? null,
            avatarUrl: me.avatar_url ?? null,
            isOrg: me.is_org ?? null,
            urlToken: me.url_token ?? null,
          },
          name: me.name ?? null,
          uid: String(me.id),
          avatarUrl: me.avatar_url ?? null,
        };
      } catch (e) {
        return { state: "fail", failReason: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  async publish(post: PostDraft, _acct, ctx: AdapterCtx, onStage: StageReporter): Promise<PublishResult> {
    if (post.type === "video") {
      throw new Error("知乎视频发布本期未实现：创作平台视频为独立分片上传协议（能力缺口见平台包 NOTES.md），请到 https://www.zhihu.com/creator 手动上传");
    }
    if (post.type === "image") return publishPin(post, ctx, onStage);
    return publishArticle(post, ctx, onStage);
  },
};

/* ---------- 想法（贴图）：POST /api/v4/content/publish（action=pin）接口直发 ---------- */

async function publishPin(post: PostDraft, ctx: AdapterCtx, onStage: StageReporter): Promise<PublishResult> {
  if (post.assets.some((a) => a.kind === "image" && a.path)) {
    // 图片想法要先走知乎 vupload 图片上传链路拿图片 token，本期未实现（见 NOTES.md 遗留问题）
    throw new Error("知乎想法通道本期只支持纯文字（图片想法需 vupload 上传链路，见平台包 NOTES.md 遗留问题）");
  }
  const title = (post.title || "").trim();
  const body = (post.body || "").trim();
  if (!title && !body) throw new Error("知乎想法需要正文内容");
  const plain = toText(title ? `${title}\n${body}` : body);
  if (plain.length > 3000) throw new Error(`知乎想法正文过长（${plain.length} > 3000 字）`);
  const html = toHtml(title ? `${title}\n${body}` : body);

  ctx.log("zhihu.publish.pin.start", { len: plain.length });
  onStage({ stage: 1, progress: 40, message: "调用知乎想法接口" });

  const r = await withPage("zhihu", { url: ZHIHU_CREATOR_URL, keepOpen: false, activate: false }, async (cdp, sid) => {
    if (!(await waitForLogin(cdp, sid))) throw new Error("知乎登录态已失效，请重新登录");
    return evaluateScalar<{ status: number; data: PublishApiResp | null; err?: string }>(
      cdp,
      sid,
      `(async () => {
        try {
          const html = ${JSON.stringify(html)};
          const payload = { action: "pin", data: {
            publish: { traceId: String(Date.now()) + "," + crypto.randomUUID() },
            commentsPermission: { comment_permission: "all" },
            extra_info: { view_permission: "all", publisher: "pc" },
            draft: { disabled: 1 },
            hybrid: { html, textLength: html.replace(/<[^>]+>/g, "").length },
          } };
          const r = await fetch("https://www.zhihu.com/api/v4/content/publish", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json", "x-requested-with": "fetch", "x-xsrftoken": ${XSRF} },
            body: JSON.stringify(payload),
          });
          const t = await r.text();
          let data = null;
          try { data = JSON.parse(t); } catch {}
          return JSON.parse(JSON.stringify({ status: r.status, data }));
        } catch (e) {
          return JSON.parse(JSON.stringify({ status: 0, data: null, err: String(e) }));
        }
      })()`,
      { timeoutMs: 30_000 },
    );
  });

  const pinId = extractId(r.data ?? {});
  if (r.status !== 200 || (r.data as PublishApiResp | null)?.code !== 0 || !pinId) {
    const msg = (r.data as PublishApiResp | null)?.message || r.err || JSON.stringify(r.data).slice(0, 200);
    ctx.log("zhihu.publish.pin.fail", { status: r.status, msg });
    throw new Error(`知乎想法发布失败（HTTP ${r.status}）：${msg}`);
  }
  const url = ZHIHU_PIN_URL + pinId;
  ctx.log("zhihu.publish.pin.ok", { pinId, url });
  onStage({ stage: 3, progress: 100, message: `想法已发布：${url}` });
  return { url, needsManualConfirm: false, receipt: { pinId } };
}

/* ---------- 文章：zhuanlan 草稿接口 + content/publish（action=article）直发 ---------- */

async function publishArticle(post: PostDraft, ctx: AdapterCtx, onStage: StageReporter): Promise<PublishResult> {
  const title = (post.title || "").trim();
  if (!title) throw new Error("知乎文章需要标题");
  const html = (post.bodyHtml || "").trim() || toHtml(post.body || "");
  if (!html.replace(/<[^>]+>/g, "").trim()) throw new Error("知乎文章需要正文内容");

  ctx.log("zhihu.publish.article.start", { titleLen: title.length });
  onStage({ stage: 0, progress: 30, message: "创建知乎专栏草稿" });

  const r = await withPage("zhihu", { url: ZHIHU_WRITE_URL, keepOpen: false, activate: false }, async (cdp, sid) => {
    if (!(await waitForLogin(cdp, sid))) throw new Error("知乎登录态已失效，请重新登录");

    // 1. 建草稿（zhuanlan 域，裸 fetch + xsrf）
    const created = await evaluateScalar<{ status: number; body: string; err?: string }>(
      cdp,
      sid,
      `(async () => {
        try {
          const r = await fetch("https://zhuanlan.zhihu.com/api/articles/drafts", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json", "x-requested-with": "fetch", "x-xsrftoken": ${XSRF} },
            body: JSON.stringify({ title: ${JSON.stringify(title)}, delta_time: 0, can_reward: true }),
          });
          return JSON.parse(JSON.stringify({ status: r.status, body: (await r.text()).slice(0, 2000) }));
        } catch (e) {
          return JSON.parse(JSON.stringify({ status: 0, body: "", err: String(e) }));
        }
      })()`,
      { timeoutMs: 30_000 },
    );
    const draftId = String((created.body.match(/"id"\s*:\s*"(\d+)"/) || [])[1] || "");
    if (created.status !== 200 || !draftId) {
      return { draftId: "", articleId: "", msg: `建草稿失败（HTTP ${created.status}）：${created.err || created.body.slice(0, 200)}` };
    }
    ctx.log("zhihu.publish.article.draft", { draftId });

    // 2. 存正文（PATCH draft）
    const patched = await evaluateScalar<{ status: number }>(
      cdp,
      sid,
      `(async () => {
        const r = await fetch("https://zhuanlan.zhihu.com/api/articles/${draftId}/draft", {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json", "x-requested-with": "fetch", "x-xsrftoken": ${XSRF} },
          body: JSON.stringify({ content: ${JSON.stringify(html)}, table_of_contents: false, delta_time: 1, can_reward: true }),
        });
        return JSON.parse(JSON.stringify({ status: r.status }));
      })()`,
      { timeoutMs: 30_000 },
    );
    if (patched.status !== 200) {
      return { draftId, articleId: "", msg: `草稿正文保存失败（HTTP ${patched.status}）` };
    }
    onStage({ stage: 1, progress: 70, message: "调用知乎发布接口" });

    // 3. 发布（www 域 content/publish，action=article；从 zhuanlan 页面 fetch 实测可跨域）
    const pub = await evaluateScalar<{ status: number; data: PublishApiResp | null; err?: string }>(
      cdp,
      sid,
      `(async () => {
        try {
          const payload = { action: "article", data: {
            publish: { traceId: String(Date.now()) + "," + crypto.randomUUID() },
            extra_info: { publisher: "pc", pc_business_params: JSON.stringify({
              commentPermission: "anyone", disclaimer_type: "none", disclaimer_status: "close",
              table_of_contents_enabled: false, content: ${JSON.stringify(html)}, title: ${JSON.stringify(title)},
              commercial_report_info: { commercial_types: [] }, commercial_zhitask_bind_info: null, canReward: true,
            }) },
            draft: { disabled: 1, id: "${draftId}", isPublished: false },
            commentsPermission: { comment_permission: "anyone" },
            creationStatement: { disclaimer_type: "none", disclaimer_status: "close" },
            contentsTables: { table_of_contents_enabled: false },
            commercialReportInfo: { isReport: 0 },
            appreciate: { can_reward: true, tagline: "真诚赞赏，手留余香" },
            hybridInfo: {},
            hybrid: { html: ${JSON.stringify(html)}, textLength: ${JSON.stringify(html.replace(/<[^>]+>/g, "").length)} },
            title: { title: ${JSON.stringify(title)} },
          } };
          const r = await fetch("https://www.zhihu.com/api/v4/content/publish", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json", "x-requested-with": "fetch", "x-xsrftoken": ${XSRF} },
            body: JSON.stringify(payload),
          });
          const t = await r.text();
          let data = null;
          try { data = JSON.parse(t); } catch {}
          return JSON.parse(JSON.stringify({ status: r.status, data }));
        } catch (e) {
          return JSON.parse(JSON.stringify({ status: 0, data: null, err: String(e) }));
        }
      })()`,
      { timeoutMs: 30_000 },
    );
    const articleId = extractId(pub.data ?? {}) || draftId;
    return { draftId, articleId, msg: pub.status === 200 && pub.data?.code === 0 ? "" : `发布失败（HTTP ${pub.status}）：${pub.data?.message || pub.err || ""}` };
  });

  if (r.draftId && !r.msg) {
    const url = ZHIHU_ARTICLE_URL + r.articleId;
    ctx.log("zhihu.publish.article.ok", { articleId: r.articleId, draftId: r.draftId, url });
    onStage({ stage: 3, progress: 100, message: `文章已发布：${url}` });
    return { url, needsManualConfirm: false, receipt: { articleId: r.articleId, draftId: r.draftId } };
  }
  // 发布失败但草稿已建成 → 只存草稿，回执给草稿编辑链接，人工点发布
  if (r.draftId) {
    const url = `${ZHIHU_ARTICLE_URL}${r.draftId}/edit`;
    ctx.log("zhihu.publish.article.draft-only", { draftId: r.draftId, msg: r.msg });
    onStage({ stage: 3, progress: 100, message: `文章已存草稿，请到知乎后台点发布：${url}（${r.msg}）` });
    return { url, needsManualConfirm: true, receipt: { draftId: r.draftId } };
  }
  ctx.log("zhihu.publish.article.fail", { msg: r.msg });
  throw new Error(`知乎文章发布失败：${r.msg}`);
}
