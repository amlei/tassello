/* @tassello/platform-lizhi —— 荔枝播客适配器（主播管理平台 nj.lizhi.fm）
 *
 * 通道结论（2026-10-02 真机探测，完整证据链见本包 NOTES.md）：
 * - 接口域：SPA 业务接口在 https://njnew.lizhi.fm（同站跨域，页面上下文 fetch 带 cookie 即可，
 *   无签名头——probe-headers.ts 抓包确认请求仅带默认头 + Referer）。
 * - 登录态：cookie `hash`（.lizhi.fm，host-only `PLAY_SESSION` 配套）。真机验证：hash 仍在且
 *   随请求发出（probe-cookies.ts blocked:[]），但服务端会话已过期 → 接口一律回
 *   `{"rcode":403,"msg":"没有权限访问"}`，SPA 弹回 https://nj.lizhi.fm/account/login。
 *   sync-profile 重同步后依旧 → 需人工登录（手机验证码/扫码，允许的例外）。
 * - verify：headless 打开 #/manage/sheet，重定向到 /account/login 即判 fail（真机已验证）；
 *   已登录时页面上下文 fetch getCurrentUserInfo + playsheet/list 解析账号与播单列表写入
 *   profile.channels。⚠️ 已登录分支尚未真机验证（阻塞于登录态），字段映射是防御式的，
 *   拿到登录态后跑 scripts/verify-smoke.ts 复核并按真实响应修正（不编造字段）。
 * - publish：荔枝没有已验证的“保存草稿”通道。用户选择播单后，打开批量上传至播单向导，
 *   把音频交给页面 uploader，然后保持在可见页面由用户选择播单/补全信息并完成发布。
 *   Runtime 永远不点击荔枝的发布/创建类按钮。
 */
import { z } from "zod";
import type { PlatformAdapter, AdapterCtx, PostDraft, PublishResult, StageReporter, VerifyResult } from "@tassello/platform-core";

type CdpConnection = CdpLike;
import { getPlatformMeta } from "@tassello/platform-core";
import { evaluateScalar, type Scalar } from "@tassello/cdp";

/* 荔枝主播管理平台（hash 路由 SPA）与登录页（真机验证：未登录访问后台会被弹到这里） */
export const LIZHI_MANAGE_URL = "https://nj.lizhi.fm/static/newsite/#/index";
export const LIZHI_LOGIN_URL = "https://nj.lizhi.fm/account/login";
/** 业务接口域（probe-headers.ts 抓包确认） */
export const LIZHI_API_BASE = "https://njnew.lizhi.fm";

/** 播单（荔枝的「频道」层：一个账号可有多个播单）。字段映射是防御式的：
 *  已登录态的真实响应体尚未验证（登录态阻塞），只映射拿到的字段，拿不到留空不编造 */
export const lizhiChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  coverUrl: z.string().nullable().optional(),
});
export type LizhiChannel = z.infer<typeof lizhiChannelSchema>;

export const lizhiProfileSchema = z.object({
  uid: z.string(),
  name: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  /** 账号 → 播单两级模型的播单列表（verify 时从 playsheet/list 刷新） */
  channels: z.array(lizhiChannelSchema).default([]),
});
export type LizhiProfile = z.infer<typeof lizhiProfileSchema>;

type CdpLike = { send: <R = unknown>(method: string, params?: Record<string, unknown>, opts?: { sessionId?: string }) => Promise<R> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 等 hash 路由 SPA 就绪：等 body 文本非空 + 路由落定（不再是登录页即认为已登录）。
 * 真机验证：未登录 ~2s 内 302/前端路由跳 /account/login。
 */
async function waitForManageReady(cdp: CdpLike, sessionId: string, timeoutMs = 25_000): Promise<{ loggedIn: boolean; href: string }> {
  const start = Date.now();
  let href = "";
  let sawManage = false;
  for (;;) {
    try {
      const r = await evaluateScalar<{ href: string; textLen: number }>(
        cdp,
        sessionId,
        `JSON.parse(JSON.stringify({ href: location.href, textLen: (document.body && document.body.innerText || "").length }))`,
        { timeoutMs: 8_000 },
      );
      href = r.href;
      // 登录页判定：路径落到 /account/login（真机验证的未登录落点）
      if (r.href.includes("/account/login")) return { loggedIn: false, href: r.href };
      // 新版创作者后台已登录时可能落在 #/index；旧管理路由也可能仍在使用。
      // 只要不是登录页且渲染出后台内容，就交由后续接口返回码最终判定。
      if (r.textLen > 100 && (r.href.includes("#/index") || r.href.includes("#/manage"))) {
        return { loggedIn: true, href: r.href };
      }
      if (r.href.includes("#/manage") || r.href.includes("#/index")) sawManage = true;
    } catch {
      // 页面被服务端重定向/弹回登录页时 target 会销毁（真机踩坑：Inspected target navigated or
      // closed）——等价于未登录，不再重试
      return { loggedIn: false, href };
    }
    if (Date.now() - start > timeoutMs) return { loggedIn: sawManage, href };
    await sleep(1_500);
  }
}

/** 页面上下文 fetch 荔枝接口（同站跨域，credentials:include 带 hash/PLAY_SESSION cookie） */
const FETCH_API_JS = `(async () => {
  const out = { user: null, userRaw: "", playsheets: null, playsheetRaw: "" };
  const get = async (url) => {
    try {
      const r = await fetch(url, { credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json" } });
      const t = await r.text();
      return { status: r.status, body: t };
    } catch (e) { return { status: 0, body: String(e) }; }
  };
  // 端点均来自真机抓包（probe-headers/probe-api，2026-10-02）：SPA 自身就在调这些接口。
  // 已登录响应体未验证：rcode!==200 或结构不符时原样带回原文，由调用方防御式解析。
  const u = await get("https://njnew.lizhi.fm/user/getCurrentUserInfo");
  out.userRaw = u.body.slice(0, 4000);
  try { const j = JSON.parse(u.body); if (j.rcode === 0 || j.rcode === 200) out.user = j.data ?? j.userInfo ?? null; } catch {}
  const p = await get("https://njnew.lizhi.fm/playsheet/list?type=0&keyword=");
  out.playsheetRaw = p.body.slice(0, 8000);
  try { const j = JSON.parse(p.body); if (j.rcode === 0 || j.rcode === 200) out.playsheets = j.data?.list ?? j.data ?? j.list ?? null; } catch {}
  return JSON.parse(JSON.stringify(out));
})()`;

type FetchApiResult = {
  user: Scalar | null;
  userRaw: string;
  playsheets: Scalar | null;
  playsheetRaw: string;
};

/** 已登录响应字段未验证 → 宽松候选字段名逐一尝试，只映射真实拿到的值 */
function pickStr(o: Scalar | null | undefined, keys: string[]): string {
  const obj = typeof o === "object" && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  return "";
}

function toChannels(raw: unknown): LizhiChannel[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray((raw as { list?: unknown[] })?.list) ? (raw as { list: unknown[] }).list : [];
  return arr
    .map((c) => {
      const o = (c ?? {}) as Scalar;
      const id = pickStr(o, ["id", "sheetId", "playsheetId", "pid"]);
      const name = pickStr(o, ["name", "title", "sheetName", "nickname"]);
      if (!id && !name) return null;
      const cover = pickStr(o, ["cover", "coverUrl", "img", "pic", "logo"]);
      return { id: id || name, name: name || id, coverUrl: cover || null } as LizhiChannel;
    })
    .filter((c): c is LizhiChannel => c !== null);
}

/** 等批量上传页就绪；荔枝 SPA 是懒加载路由，直接判关键文案/文件入口。 */
async function waitForBatchUploadReady(cdp: CdpLike, sessionId: string, timeoutMs = 30_000): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    try {
      const ready = await evaluateScalar<boolean>(
        cdp,
        sessionId,
        `(() => {
          const t = (document.body && document.body.innerText) || "";
          const input = Array.from(document.querySelectorAll("input[type=file]")).find((e) => /audio|mp3|m4a|wav/i.test(e.accept || ""));
          return (t.includes("上传声音") || t.includes("批量上传至播单")) && !!input;
        })()`,
        { timeoutMs: 8_000 },
      ).catch(() => false);
      if (ready) return true;
    } catch {}
    if (Date.now() - start > timeoutMs) return false;
    await sleep(1_000);
  }
}

/** 荔枝没有已验证的“保存草稿”通道：把音频交给 batchToSheet 上传向导后停住，
 *  让用户在可见页面里选择播单并完成最终发布。不点击任何「发布 / 保存 / 创建」。 */
async function openManualUpload(
  post: PostDraft,
  target: { id: string; name: string },
  ctx: AdapterCtx,
  onStage: StageReporter,
): Promise<PublishResult> {
  const audio = post.assets.find((a) => a.kind === "audio" && a.path);
  if (!audio) throw new Error("荔枝播客发布需要音频素材");

  const url = "https://nj.lizhi.fm/static/newsite/#/content/batchToSheet";
  onStage({ stage: 0, progress: 100, message: `打开荔枝批量上传至播单（${target.name}）` });
  await ctx.runPage("lizhi", { url, keepOpen: true, activate: true }, async (cdp, sid) => {
    if (!(await waitForBatchUploadReady(cdp, sid))) {
      throw new Error("荔枝上传向导未就绪（可能未登录或页面结构变更）");
    }
    const inputs = await evaluateScalar<{ accept: string }[]>(
      cdp,
      sid,
      `(() => Array.from(document.querySelectorAll("input[type=file]")).map((e) => ({ accept: e.getAttribute("accept") || "" })))()`,
      { timeoutMs: 10_000 },
    );
    const idx = inputs.findIndex((i) => /audio|mp3|m4a|wav|aac|flac|ogg|aiff|amr|wma/i.test(i.accept));
    if (idx < 0) throw new Error("未找到荔枝音频上传入口（页面结构可能变更）");
    await cdp.send("DOM.enable", {}, { sessionId: sid });
    const doc = (await cdp.send("DOM.getDocument", {}, { sessionId: sid })) as { root?: { nodeId?: number } };
    const q = (await cdp.send(
      "DOM.querySelectorAll",
      { nodeId: doc.root?.nodeId, selector: "input[type=file]" },
      { sessionId: sid },
    )) as { nodeIds?: number[] };
    const nodeId = q.nodeIds?.[idx];
    if (!nodeId) throw new Error("荔枝音频 file input 未渲染");
    await cdp.send("DOM.setFileInputFiles", { files: [audio.path!], nodeId }, { sessionId: sid });
    onStage({ stage: 1, progress: 100, message: "音频已交给荔枝上传向导；请选择播单并人工完成发布" });
  });
  return {
    url,
    needsManualConfirm: true,
    receipt: { channelId: target.id, channelName: target.name, note: "manual-upload-and-publish" },
  };
}

export const lizhiAdapter: PlatformAdapter<LizhiProfile> = {
  meta: { ...getPlatformMeta("lizhi")!, supports: ["audio"] },

  account: {
    profileSchema: lizhiProfileSchema,

    async verify(_acct, ctx): Promise<VerifyResult<LizhiProfile>> {
      ctx.log("lizhi.verify.start");
      try {
        const r = await ctx.runPage(
          "lizhi",
          { url: LIZHI_MANAGE_URL, keepOpen: false, activate: false },
          async (cdp, sid) => {
            const ready = await waitForManageReady(cdp, sid);
            if (!ready.loggedIn) return { loggedIn: false as const, api: null };
            try {
              const api = await evaluateScalar<FetchApiResult>(cdp, sid, FETCH_API_JS, { timeoutMs: 30_000 });
              return { loggedIn: true as const, api };
            } catch (e) {
              // fetch 过程中被弹回登录页（target 销毁）也归因为未登录
              ctx.log("lizhi.verify.session-lost", { error: String(e) });
              return { loggedIn: false as const, api: null };
            }
          },
        );

        if (!r.loggedIn) {
          ctx.log("lizhi.verify.fail", { reason: "not-logged-in" });
          return {
            state: "fail",
            failReason:
              "荔枝播客登录态已失效：服务端会话过期（接口回 403 没有权限访问，SPA 弹回 /account/login）。请先在日常 Chrome 登录荔枝主播管理平台（手机验证码/扫码，需人工操作），再重新导入 profile",
          };
        }

        const api = r.api!;
        // 接口回 rcode 403 即服务端会话失效（荔枝的未登录语义：HTTP 200 + rcode 403，真机验证）
        if (!api.user && api.userRaw.includes('"rcode":403')) {
          ctx.log("lizhi.verify.fail", { reason: "session-invalid-403" });
          return {
            state: "fail",
            failReason:
              "荔枝播客登录态已失效：服务端会话过期（接口回 403 没有权限访问）。请先在日常 Chrome 登录荔枝主播管理平台（手机验证码/扫码，需人工操作），再重新导入 profile",
          };
        }
        // 已登录响应字段未真机验证：解析不出账号标识时把原文带进 failReason 便于续探，不编造
        const uid = pickStr(api.user, ["uid", "userId", "id", "anchorId"]);
        const name = pickStr(api.user, ["nickname", "name", "userName", "anchorName"]) || null;
        const avatarUrl = pickStr(api.user, ["icon", "headurl", "avatarUrl", "headUrl", "avatar", "logo"]) || null;
        const channels = toChannels(api.playsheets);
        ctx.log("lizhi.verify.ok", { uid: uid || null, channelCount: channels.length });
        if (!uid && !name) {
          return {
            state: "fail",
            failReason: `荔枝接口已登录但解析不出账号标识（字段映射待真机修正）。getCurrentUserInfo 原文：${api.userRaw.slice(0, 300)}`,
          };
        }
        return {
          state: "ok",
          profile: {
            uid: uid || name!,
            name,
            avatarUrl,
            channels,
          },
          name,
          uid: uid || null,
          avatarUrl,
        };
      } catch (e) {
        return { state: "fail", failReason: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  async publish(post: PostDraft, _acct, ctx: AdapterCtx, onStage: StageReporter): Promise<PublishResult> {
    const target = post.targetChannel
      ?? null;
    if (!target) throw new Error("荔枝播客发布需要在发布弹层选择播单");
    return openManualUpload(post, target, ctx, onStage);
  },
};
