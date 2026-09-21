/* @tassello/platform-wechat —— 公众号适配器：CDP 通道（mp 后台填充 + 人工确认） */
import { z } from "zod";
import type {
  PlatformAdapter,
  PostDraft,
  AdapterCtx,
  StageReporter,
} from "@tassello/platform-core";
import { getPlatformMeta } from "@tassello/platform-core";
import { evaluateScalar, withPage, type CdpConnection } from "@tassello/cdp";

export const wechatProfileSchema = z.object({
  ghId: z.string().optional(),
  nickname: z.string().nullable().optional(),
  uin: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  /** mp 后台会话 token（每次登录会变，verify 时刷新） */
  sessionToken: z.string().nullable().optional(),
});
export type WechatProfile = z.infer<typeof wechatProfileSchema>;

const MP_HOME = "https://mp.weixin.qq.com";

/** 头像 url 尾段 /64 → /0（wx.qlogo.cn 的尺寸后缀，0 = 原图） */
function normalizeAvatar(url: string): string {
  return url.replace(/\/\d+$/, "/0");
}

/** 等公众号后台就绪：出现扫码框 = 未登录；读到昵称或会话 token = 已登录就绪。
 *  已登录访问 mp 首页会再跳一跳（落到 /cgi-bin/home?...&token=xxx），刚 createTarget 时
 *  页面还是白的，直接读必然「未登录」——必须轮询等它落地。
 *  账号数据以 wx.commonData.data 为准（下划线键名：nick_name / head_img / user_name），
 *  DOM 选择器只做兜底；昵称要过滤 Vue 模板占位符（DOM 里会读到字面量「{{ nickName }}」）；
 *  wx.commonData 挂载慢于 URL，有 token 但昵称还是占位符时再给它几秒 */
const NICKNAME_PLACEHOLDER = /^\{\{[\s\S]*\}\}$/;

async function waitForMpReady(
  cdp: { send: <R = unknown>(method: string, params?: Record<string, unknown>, opts?: { sessionId?: string }) => Promise<R> },
  sessionId: string,
  timeoutMs = 30_000,
): Promise<{ loggedIn: boolean; nickname: string | null; avatarUrl: string | null; ghId: string | null; uin: string | null; token: string | null }> {
  const PROBE = `(() => {
    const cd = (window.wx && window.wx.commonData && window.wx.commonData.data) || {};
    const q = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
    const scan = !!document.querySelector(".login__type__container__scan, #scan_qrcode");
    const m = location.search.match(/token=(\\d+)/);
    const avatarImg = document.querySelector("img.weui-desktop-account__img, img.weui-desktop-account__thumb");
    return JSON.parse(JSON.stringify({
      onScan: scan,
      nickname: cd.nick_name || cd.nick_name_decode || q(".nickname") || q(".weui-desktop_name") || null,
      avatarUrl: cd.head_img || cd.head_url || (avatarImg ? avatarImg.getAttribute("src") : null) || null,
      ghId: (typeof cd.user_name === "string" && cd.user_name.indexOf("gh_") === 0) ? cd.user_name : null,
      uin: cd.uin ? String(cd.uin) : null,
      token: m ? m[1] : null,
    }));
  })()`;
  const start = Date.now();
  for (;;) {
    try {
      const s = await evaluateScalar<{
        onScan: boolean; nickname: string | null; avatarUrl: string | null;
        ghId: string | null; uin: string | null; token: string | null;
      }>(cdp, sessionId, PROBE, { timeoutMs: 5_000 });
      if (s.onScan) return { loggedIn: false, nickname: null, avatarUrl: null, ghId: null, uin: null, token: s.token ?? null };
      const nickname = s.nickname && !NICKNAME_PLACEHOLDER.test(s.nickname) ? s.nickname : null;
      // URL token 一出现就算落地；但昵称再等 wx.commonData 几秒，能拿到真名最好
      if (nickname || (s.token && Date.now() - start > 8_000)) {
        return {
          loggedIn: true,
          nickname,
          avatarUrl: s.avatarUrl ? normalizeAvatar(s.avatarUrl) : null,
          ghId: s.ghId ?? null,
          uin: s.uin ?? null,
          token: s.token ?? null,
        };
      }
    } catch {} // 跳转期间执行上下文会被销毁，吞掉重试
    if (Date.now() - start > timeoutMs) return { loggedIn: false, nickname: null, avatarUrl: null, ghId: null, uin: null, token: null };
    await new Promise((r) => setTimeout(r, 1200));
  }
}

/* ---------- 适配器 ---------- */

export const wechatAdapter: PlatformAdapter<WechatProfile> = {
  meta: getPlatformMeta("wechat")!,

  account: {
    profileSchema: wechatProfileSchema,

    async verify(acct, ctx) {
      const profile = (acct.profile ?? {}) as WechatProfile;
      ctx.log("wechat.verify.start");
      /* headless 打开 mp 后台等它就绪（登录态下有跳转），再读会话信息 */
      try {
        const r = await withPage("wechat", { url: MP_HOME, keepOpen: false, activate: false, mode: "headless" }, (cdp, sid) =>
          waitForMpReady(cdp, sid),
        );
        if (!r.loggedIn) return { state: "fail", failReason: "公众号后台未登录，请在浏览器里扫码登录" };
        if (!r.nickname) {
          return { state: "fail", failReason: "公众号后台已登录但读不到昵称（页面结构可能变更）——回工作台再点一次「重新校验」试试" };
        }
        ctx.log("wechat.verify.ok", { ghId: r.ghId });
        return {
          state: "ok",
          profile: {
            ...profile,
            nickname: r.nickname,
            uin: r.uin,
            ghId: r.ghId ?? profile.ghId,
            avatarUrl: r.avatarUrl ?? profile.avatarUrl ?? null,
            sessionToken: r.token,
          },
          name: r.nickname,
          uid: r.ghId ?? profile.ghId ?? r.uin,
          avatarUrl: r.avatarUrl ?? profile.avatarUrl ?? null,
        };
      } catch (e) {
        return { state: "fail", failReason: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  async publish(post: PostDraft, acct, ctx: AdapterCtx, onStage: StageReporter) {
    /* ---------- 浏览器通道：打开编辑器填充，人工确认 ---------- */
    onStage({ stage: 0, progress: 50, message: "打开公众号后台" });
    const token = (acct.profile as WechatProfile).sessionToken;
    const homeUrl = token ? `${MP_HOME}/cgi-bin/home?t=home/index&lang=zh_CN&token=${token}` : MP_HOME;
    return withPage("wechat", { url: homeUrl, keepOpen: true, activate: true }, async (cdp, sid) => {
      await new Promise((r) => setTimeout(r, 2000));
      onStage({ stage: 1, progress: 60, message: "新建图文" });
      await evaluateScalar(
        cdp,
        sid,
        `(() => {
          const url = "${MP_HOME}/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77";
          window.location.href = url;
          return true;
        })()`,
      );
      await new Promise((r) => setTimeout(r, 3500));
      onStage({ stage: 2, progress: 60, message: "填充标题与正文" });
      const ok = await evaluateScalar<boolean>(
        cdp,
        sid,
        `(() => {
          const title = document.querySelector("textarea[placeholder], input[name=title], .title-input textarea");
          const body = document.querySelector(".ProseMirror[contenteditable], .edui-editor-body iframe");
          if (title) {
            title.focus();
            title.value = ${JSON.stringify(post.title || "")};
            title.dispatchEvent(new InputEvent("input", { bubbles: true }));
          }
          if (body && body.classList && body.classList.contains("ProseMirror")) {
            body.focus();
            body.innerHTML = ${JSON.stringify(post.bodyHtml || "")};
            body.dispatchEvent(new InputEvent("input", { bubbles: true }));
          }
          return !!(title || body);
        })()`,
      );
      if (!ok) throw new Error("未找到公众号编辑器输入框（可能未登录或页面结构变更）");
      onStage({ stage: 3, progress: 100, message: "请在浏览器里检查内容后自行保存/群发，然后回工作台标记完成" });
      return { url: null, needsManualConfirm: true };
    });
  },
};
