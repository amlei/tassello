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
 * - publish：产品语义 = 只存草稿，绝不自动发布。但上传链路（上传音频 → 填标题/简介 →
 *   选播单 → 存草稿）的已登录 UI/接口零证据（登录态阻塞），不编造端点 → 本期显式报错
 *   （先例：蜻蜓FM / 知乎视频通道，见 docs/platforms.md）。已探到的唯一上传相关线索是
 *   njnew.lizhi.fm/voice/getHuaWeiCloudUploadToken（华为云上传 token，probe-headers 抓到，
 *   响应体未验证），续探入口 scripts/e2e-publish.ts。
 */
import { z } from "zod";
import type { PlatformAdapter, AdapterCtx, VerifyResult } from "@tassello/platform-core";

type CdpConnection = CdpLike;
import { getPlatformMeta } from "@tassello/platform-core";
import { evaluateScalar, type Scalar } from "@tassello/cdp";

/* 荔枝主播管理平台（hash 路由 SPA）与登录页（真机验证：未登录访问后台会被弹到这里） */
export const LIZHI_MANAGE_URL = "https://nj.lizhi.fm/static/newsite/#/manage/sheet";
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
      // hash 路由就位且渲染出内容（管理后台 body 文本较长，真机已登录表现待复核）
      if (r.href.includes("#/manage") && r.textLen > 100) return { loggedIn: true, href: r.href };
      if (r.href.includes("#/manage")) sawManage = true;
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
  try { const j = JSON.parse(u.body); if (j.rcode === 200) out.user = j.data ?? j.userInfo ?? null; } catch {}
  const p = await get("https://njnew.lizhi.fm/playsheet/list?type=0&keyword=");
  out.playsheetRaw = p.body.slice(0, 8000);
  try { const j = JSON.parse(p.body); if (j.rcode === 200) out.playsheets = j.data ?? j.list ?? null; } catch {}
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
        const avatarUrl = pickStr(api.user, ["headurl", "avatarUrl", "headUrl", "avatar", "logo"]) || null;
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

  async publish() {
    // 产品语义：荔枝发布 = 只存草稿（上传音频 → 标题/简介 → 选播单 → 存草稿箱，needsManualConfirm，
    // 绝不点「发布」）。真机阻塞：登录态过期（服务端会话失效，人工验证码/扫码登录），已登录的
    // 上传链路 UI/接口零证据，不编造端点 → 显式报错（先例：蜻蜓FM、知乎视频通道）。
    // 唯一已探线索：njnew.lizhi.fm/voice/getHuaWeiCloudUploadToken（华为云上传 token，probe-headers 抓到，响应体未验证）。
    // 续探入口：scripts/sync-profile.ts → scripts/probe-*.ts → scripts/e2e-publish.ts（见本包 NOTES.md §5）。
    throw new Error(
      "荔枝播客发布通道本期未实现：登录态已过期（需人工验证码/扫码重新登录），存草稿链路未完成真机探测（见平台包 NOTES.md 阻塞记录）",
    );
  },
};
