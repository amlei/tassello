/* @tassello/platform-jike —— 即刻适配器：纯 HTTP 接口通道（api.ruguoapp.com，仅 x-jike-access-token 头）
 *
 * 通道选型（真机实测，2026-10-02）：即刻无官方开放发布 API；web 端（web.okjike.com）本身就是
 * 纯接口驱动——所有数据/写操作走 https://api.ruguoapp.com/1.0/*，鉴权只靠
 * `x-jike-access-token`（登录时发，存于页面 localStorage JK_ACCESS_TOKEN）+ `platform: web`
 * 两个头，不依赖 cookie、无前端签名/加密参数。Bun 直连实测发动态、发图、删动态均 200 →
 * 采用纯 HTTP 通道，verify 与 publish 都不需要浏览器（token 导入用 CDP 只在首次绑定时发生）。
 *
 * 实测接口清单（全部免 cookie）：
 *   GET  https://api.ruguoapp.com/1.0/users/profile[?username=]  当前用户/任意用户资料
 *   POST https://api.ruguoapp.com/1.0/originalPosts/create       发原帖
 *        { content, pictureKeys: string[], syncToPersonalUpdates: true } → { data: { id, ... } }
 *   POST https://api.ruguoapp.com/1.0/originalPosts/remove       删帖 { id }（探针清理用）
 *   GET  https://api.ruguoapp.com/1.0/originalPosts/get?id=      帖子详情
 *   GET  https://api.ruguoapp.com/1.0/upload/token?md5=<md5>     图片上传凭证 { uptoken }
 *   POST https://upload.qiniup.com/（FormData: file + token）     七牛直传 → { key, fileUrl }
 *   POST https://api.ruguoapp.com/app_auth_tokens.refresh        刷 token（头 x-jike-refresh-token，
 *        存于 localStorage JK_REFRESH_TOKEN；本包未真机验证，见 NOTES.md 遗留问题）
 *
 * 真机踩坑：
 * - 连续两次发动态会撞「动态发送频率过快」（400），间隔约 5-10s 即可重试成功 → publish 内置退避重试
 * - token 是 JWT 形态（668 字符），有效期长但会过期；过期/被踢时接口 401 {"success":false}
 * - 回执链接：https://web.okjike.com/originalPost/<id>
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { PlatformAdapter, PostDraft, AdapterCtx, StageReporter, PublishResult } from "@tassello/platform-core";
import type { CdpLike } from "@tassello/platform-core";

type CdpConnection = CdpLike;
import { getPlatformMeta } from "@tassello/platform-core";
import { evaluateScalar } from "@tassello/cdp";

export const JIKE_API_BASE = "https://api.ruguoapp.com";
export const JIKE_HOME_URL = "https://web.okjike.com/";
export const JIKE_POST_URL = "https://web.okjike.com/originalPost/";

/* ---------- profile：token 属机密，走 SecretBox，不进 profile ---------- */
export const jikeProfileSchema = z.object({
  uid: z.string(),
  username: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
});
export type JikeProfile = z.infer<typeof jikeProfileSchema>;

const secretRef = (acctId: string) => `jike:${acctId}:accessToken`;

/* ---------- HTTP 基座 ---------- */
function jikeHeaders(token: string, json = false): Record<string, string> {
  return {
    "x-jike-access-token": token,
    platform: "web",
    accept: "application/json",
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

type ApiFail = { success?: boolean; error?: string };

/** 带频率限制退避的 POST（即刻对连续发动态限速：400 "动态发送频率过快"，实测 5-10s 后重试可过） */
async function postWithRetry(token: string, path: string, body: unknown, attempts = 3): Promise<{ status: number; data: Record<string, unknown> }> {
  let last = { status: 0, data: {} as Record<string, unknown> };
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 6_000 * i));
    const r = await fetch(JIKE_API_BASE + path, {
      method: "POST",
      headers: jikeHeaders(token, true),
      body: JSON.stringify(body),
    });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    last = { status: r.status, data };
    const err = (data as ApiFail).error ?? "";
    if (r.ok && data.success !== false) return last;
    if (!/频率|rate/i.test(err)) break;
  }
  return last;
}

/* ---------- 登录态探测：verify / 首绑拿 token 都在这 ---------- */

export type JikeSession = { accessToken: string; uid: string; username: string | null; name: string | null; avatarUrl: string | null };

/** 纯 HTTP 校验 token 并拉用户资料（uid/名字/头像） */
export async function fetchSession(token: string): Promise<JikeSession | null> {
  const r = await fetch(`${JIKE_API_BASE}/1.0/users/profile`, { headers: jikeHeaders(token) });
  if (!r.ok) return null;
  const j = (await r.json()) as { user?: { id?: string; username?: string; screenName?: string; avatarImage?: { thumbnailUrl?: string } } };
  const u = j.user;
  if (!u?.id) return null;
  return { accessToken: token, uid: String(u.id), username: u.username ?? null, name: u.screenName ?? null, avatarUrl: u.avatarImage?.thumbnailUrl ?? null };
}

/**
 * 首绑/重绑：从应用共享 Chrome profile 的 web.okjike.com 页面读 localStorage 里的 token 并入库。
 * 即刻 API 鉴权不靠 cookie，共享 profile 里「已登录」的实际含义就是 localStorage 有 JK_ACCESS_TOKEN，
 * 而 verify/publish 走的是 SecretBox 里的 token——所以无 token / token 失效时必须来这里导一次，
 * 这是即刻唯一需要浏览器的地方（配合 profile 整目录导入，登录态随 Local Storage 迁移存活）。
 */
/** Obsidian 无账号体系：直接从当前浏览器 localStorage 读取即刻登录 token。 */
async function readTokenFromBrowser(ctx: AdapterCtx): Promise<string | null> {
  return await ctx.runPage("jike", { url: JIKE_HOME_URL, keepOpen: false, activate: false }, async (cdp, sid) => {
    const start = Date.now();
    for (;;) {
      try {
        const value = await evaluateScalar<string | null>(
          cdp,
          sid,
          `localStorage.getItem("JK_ACCESS_TOKEN")`,
          { timeoutMs: 10_000 },
        );
        if (value) return value;
      } catch {}
      if (Date.now() - start > 20_000) return null;
      await new Promise((resolve) => setTimeout(resolve, 1_200));
    }
  });
}

async function importTokenFromBrowser(ctx: AdapterCtx, acctId: string): Promise<string | null> {
  if (!ctx.secrets) throw new Error("即刻绑定需要 SecretBox");
  const r = await ctx.runPage(
    "jike",
    { url: JIKE_HOME_URL, keepOpen: false, activate: false },
    async (cdp, sid) => {
      // 页面早期读 localStorage 会偶发 SecurityError（NOTES.md 踩坑⑤），轮询重试
      const start = Date.now();
      for (;;) {
        try {
          const v = await evaluateScalar<{ at: string | null; rt: string | null }>(
            cdp,
            sid,
            `(() => {
              try {
                return JSON.parse(JSON.stringify({
                  at: window.localStorage.getItem("JK_ACCESS_TOKEN"),
                  rt: window.localStorage.getItem("JK_REFRESH_TOKEN"),
                }));
              } catch { return JSON.parse(JSON.stringify({ at: null, rt: null })); }
            })()`,
            { timeoutMs: 10_000 },
          );
          if (v.at || v.rt) return v;
        } catch {}
        if (Date.now() - start > 25_000) return { at: null, rt: null };
        await new Promise((res) => setTimeout(res, 1_200));
      }
    },
  );
  if (!r.at) r.at = await readTokenFromBrowser(ctx);
  if (r.at) await ctx.secrets.set(secretRef(acctId), r.at);
  if (r.rt) await ctx.secrets.set(`jike:${acctId}:refreshToken`, r.rt);
  ctx.log("jike.verify.tokenImported", { hasAccess: !!r.at, hasRefresh: !!r.rt });
  return r.at;
}

/* ---------- 适配器 ---------- */

export const jikeAdapter: PlatformAdapter<JikeProfile> = {
  meta: getPlatformMeta("jike")!,

  account: {
    profileSchema: jikeProfileSchema,

    async verify(acct, ctx) {
      if (!acct || !ctx.secrets) throw new Error("即刻需要绑定账号上下文");
      ctx.log("jike.verify.start", { uid: acct.uid });
      try {
        // 登录态 = access token（SecretBox）；没有就先从共享 profile 的页面导入（首绑自举）
        let token = await ctx.secrets.get(secretRef(acct.id));
        if (!token) {
          ctx.log("jike.verify.bootstrap");
          token = await importTokenFromBrowser(ctx, acct.id);
        }
        if (!token) {
          return { state: "fail", failReason: "尚未绑定即刻登录态：请在应用的浏览器 profile 里登录 web.okjike.com，再触发一次校验导入 token" };
        }
        let s = await fetchSession(token);
        // token 失效先试 refresh token 换新（接口形态参考 open-jike/jike-sdk，未真机验证）
        if (!s) {
          const rt = await ctx.secrets.get(`jike:${acct.id}:refreshToken`);
          if (rt) {
            const r = await fetch(`${JIKE_API_BASE}/app_auth_tokens.refresh`, {
              method: "POST",
              headers: { "x-jike-refresh-token": rt, platform: "web", "content-type": "application/json", accept: "application/json" },
              body: "{}",
            }).catch(() => null);
            const j = r ? ((await r.json().catch(() => ({}))) as Record<string, unknown>) : {};
            const at = (j.accessToken ?? j.token) as string | undefined;
            if (r?.ok && at) {
              token = at;
              await ctx.secrets.set(secretRef(acct.id), at);
              if (typeof j.refreshToken === "string") await ctx.secrets.set(`jike:${acct.id}:refreshToken`, j.refreshToken);
              s = await fetchSession(token);
            }
          }
        }
        // refresh 也救不回来：共享 profile 可能刚被重新导入/重新登录过，回浏览器重导一次
        if (!s) {
          ctx.log("jike.verify.rebind");
          token = await importTokenFromBrowser(ctx, acct.id);
          if (token) s = await fetchSession(token);
        }
        if (!s) return { state: "fail", failReason: "即刻登录态已失效：请在应用浏览器里重新登录 web.okjike.com 后再校验一次" };
        ctx.log("jike.verify.ok", { uid: s.uid });
        return {
          state: "ok",
          profile: { uid: s.uid, username: s.username, name: s.name, avatarUrl: s.avatarUrl },
          name: s.name,
          uid: s.uid,
          avatarUrl: s.avatarUrl,
        };
      } catch (e) {
        return { state: "fail", failReason: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  async publish(post: PostDraft, acct, ctx: AdapterCtx, onStage: StageReporter): Promise<PublishResult> {
    if (post.type === "image") {
      // 即刻贴图没有可恢复草稿；不调用 create，打开 visible composer 交给用户发送。
      ctx.log("jike.publish.image.manual", {});
      onStage({ stage: 0, progress: 100, message: "打开即刻动态编辑器；请填写并点发送" });
      await ctx.runPage("jike", { url: "https://web.okjike.com/", keepOpen: true, activate: true }, async () => null);
      return { url: "https://web.okjike.com/", needsManualConfirm: true, receipt: { kind: "composer" } };
    }

    let token: string | null = null;
    if (acct && ctx.secrets) {
      token = await ctx.secrets.get(secretRef(acct.id));
      if (!token) token = await importTokenFromBrowser(ctx, acct.id);
    } else {
      token = await readTokenFromBrowser(ctx);
    }
    if (!token) throw new Error("未找到即刻登录态；请先在当前 Chrome 登录 web.okjike.com");

    // 即刻原帖没有独立标题位：标题有值时并入正文首行
    const title = (post.title || "").trim();
    const body = (post.body || "").trim();
    const content = title && body ? `${title}\n${body}` : title || body;
    if (!content && !post.assets.some((a) => a.kind === "image" && a.path)) {
      throw new Error("即刻动态需要正文或图片至少一项");
    }
    if (post.durationSec != null || post.assets.some((a) => a.kind === "video")) {
      ctx.log("jike.publish.videoSkipped", { note: "视频上传链路未实现，视频素材被忽略（见 NOTES.md 遗留问题）" });
    }

    // 图片：平台素材指纹 → 七牛直传 → pictureKeys；相同账号 + 相同字节直接复用 key。
    const pictureKeys: string[] = [];
    const cachedPictureKeys: string[] = [];
    const images = post.assets.filter((a) => a.kind === "image" && a.path);
    if (images.length) {
      onStage({ stage: 1, progress: 20, message: `准备 ${images.length} 张图片` });
      const accountId = acct?.id || "shared";
      const query = (img: typeof images[number]) => ({ accountId, assetPath: img.path, kind: "image", scope: "picture" });
      for (const img of images) {
        const cached = ctx.assets ? await ctx.assets.find(query(img)) : null;
        const cachedKey = typeof cached?.payload?.key === "string" ? cached.payload.key : null;
        if (cached && cachedKey) {
          pictureKeys.push(cachedKey);
          cachedPictureKeys.push(cachedKey);
          ctx.log("jike.image.cache-hit", { assetId: img.id, key: cachedKey });
          continue;
        }

        const buf = await readFile(img.path);
        const md5 = createHash("md5").update(buf).digest("hex");
        const tr = await fetch(`${JIKE_API_BASE}/1.0/upload/token?md5=${md5}`, { headers: jikeHeaders(token) });
        const tj = (await tr.json().catch(() => ({}))) as { uptoken?: string };
        if (!tr.ok || !tj.uptoken) throw new Error(`即刻图片凭证获取失败（HTTP ${tr.status}）`);
        const fd = new FormData();
        fd.append("file", new Blob([new Uint8Array(buf)], { type: "image/png" }), img.id);
        fd.append("token", tj.uptoken);
        const q = await fetch("https://upload.qiniup.com/", { method: "POST", body: fd });
        const qj = (await q.json().catch(() => ({}))) as { key?: string; success?: boolean };
        if (!q.ok || !qj.key) throw new Error(`即刻图片上传失败（HTTP ${q.status}）`);
        pictureKeys.push(qj.key);
        await ctx.assets?.save(query(img), { id: qj.key, payload: { key: qj.key } });
        ctx.log("jike.image.uploaded", { assetId: img.id, key: qj.key });
      }
      // 只要有新上传就等七牛回调落库；全量缓存复用可直接 create。
      if (pictureKeys.length > cachedPictureKeys.length) {
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }

    onStage({ stage: 2, progress: 60, message: "发送即刻动态" });
    const r = await postWithRetry(token, "/1.0/originalPosts/create", {
      content,
      pictureKeys,
      syncToPersonalUpdates: true,
    });
    const id = (r.data as { data?: { id?: string } }).data?.id;
    if (!r.status || r.status >= 400 || !id) {
      const err = ((r.data as ApiFail).error || `HTTP ${r.status}`) as string;
      ctx.log("jike.publish.fail", { status: r.status, err });
      await Promise.all(images.map((img) => ctx.assets?.forget({
        accountId: acct?.id || "shared", assetPath: img.path, kind: "image", scope: "picture",
      }).catch(() => {})));
      throw new Error(`即刻动态发送失败：${err}`);
    }
    const url = JIKE_POST_URL + id;
    ctx.log("jike.publish.ok", { id, url });
    onStage({ stage: 3, progress: 100, message: `已发布：${url}` });
    return { url, needsManualConfirm: false, receipt: { postId: id } };
  },
};
