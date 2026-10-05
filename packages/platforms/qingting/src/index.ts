/* @tassello/platform-qingting —— 蜻蜓FM 适配器（主播公众平台 admin.qingting.fm）
 *
 * 通道结论（2026-10-02 登录态真机探测，完整证据链见本包 NOTES.md §1）：
 * - 无公开主播开放 API；业务接口是 admin 页面自调的私有 REST（papi.qingting.fm / papi-go.qingting.fm），
 *   请求需 user_id + user_token（页面从登录态拼进 query，页面上下文 fetch 可直接带 cookie 调通）。
 *   发布链路（上传 + 发布提交）无法脱离页面上下文 → 按规则回退 CDP。
 * - verify：headless 打开 /content/channels，重定向 /login 即 fail；
 *   已登录则页面上下文 fetch `podcasters/{uid}/info` + `channels_for_page`（真机 200 验证），
 *   写回 profile.channels（真机证据字段：id/title/category/cover/source/channel_type/read_only）。
 * - publish（产品语义 = 只存草稿，绝不自动发布）：上传节目页 /content/upload_program?channel_id=<id>
 *   （URL 参数直选专辑，真机验证）。DOM.setFileInputFiles 塞音频（file input 初始化即存在，
 *   accept: .MP3,.WAV,.WMA,.AAC,.FLAC,.AIFF,.OGG,.M4A,.MP2,.AMR）→ 页面自走
 *   upload.qtfm.cn/api/v1/token → 华为 OBS(appuploader.obs.cn-east-3) 表单上传 →
 *   逐节目表单（节目名称/节目导语/定时上线）→ 填好标题与导语后 **停在「发 布」按钮之前**，
 *   needsManualConfirm: true，提交/上线由用户在保持打开的页面里完成。绝不点「发 布」。
 *   （真机确认：蜻蜓上传页没有「存草稿」按钮，未点发布前内容只在页面本地态 + OBS 碎片，
 *   故标签页保持打开，等用户确认——先例：小红书长文草稿。）
 * - ⚠️ RSS 认领专辑（source="rss", read_only=true，如「青春列车」）在专辑管理页无「新建声音」入口，
 *   但上传节目页仍可选中该专辑（channel_type=99 在上传白名单 filter "1,95,97,99" 内，真机验证）。
 * - 铁律：页面求值只用 evaluateScalar，只允许标量/纯结构出页面（先 JSON.stringify 再返回）。
 */
import { z } from "zod";
import type {
  PlatformAdapter,
  AdapterCtx,
  AdapterAccount,
  VerifyResult,
  PostDraft,
  StageReporter,
  PublishResult,
} from "@tassello/platform-core";

type CdpConnection = CdpLike;
import { getPlatformMeta } from "@tassello/platform-core";
import { evaluateScalar, type Scalar } from "@tassello/cdp";

/** 蜻蜓主播公众平台「专辑管理」页（账号 → 专辑两级模型里的频道层） */
export const QINGTING_ADMIN_URL = "https://admin.qingting.fm/content/channels";
/** 未登录时统一重定向到扫码登录页（真机已验证） */
export const QINGTING_LOGIN_URL = "https://admin.qingting.fm/login";
/** 上传节目页：channel_id=<专辑id> 可直接预选目标专辑（真机验证） */
export const qingtingUploadUrl = (channelId: string): string =>
  `https://admin.qingting.fm/content/upload_program?channel_id=${encodeURIComponent(channelId)}`;

/** 频道（专辑）profile 片段 —— 字段全部来自 channels_for_page 真机响应 */
export const qingtingChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 专辑分类（如「播客」），接口字段 category */
  kind: z.string().nullable().optional(),
  /** 专辑封面 URL，接口字段 cover */
  coverUrl: z.string().nullable().optional(),
  /** 来源：self=自建 / rss=认领 RSS 节目，接口字段 source */
  source: z.string().nullable().optional(),
  /** 接口字段 channel_type（"99"=播客认领 等） */
  channelType: z.string().nullable().optional(),
});
export type QingtingChannel = z.infer<typeof qingtingChannelSchema>;

export const qingtingProfileSchema = z.object({
  uid: z.string(),
  name: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  /** 主播号下的专辑列表（「账号→频道两级」模型的核心字段） */
  channels: z.array(qingtingChannelSchema).default([]),
});
export type QingtingProfile = z.infer<typeof qingtingProfileSchema>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type CdpLike = { send: <R = unknown>(method: string, params?: Record<string, unknown>, opts?: { sessionId?: string }) => Promise<R> };

/* ---------- verify：真实接口（papi.qingting.fm，页面上下文 fetch） ---------- */

/** 页面里：从 performance 资源记录取页面自己拼的 user_id/user_token，再 fetch 账号+专辑接口。
 *  只回传 JSON.stringify 过的纯结构（evaluateScalar 铁律）。 */
const VERIFY_JS = `(async () => {
  const out = { loggedIn: false };
  try {
    // 登录后 channels 页自动请求过业务接口，user_id/user_token 就拼在 query 里
    const entry = performance.getEntriesByType("resource").map(e => e.name)
      .find(u => u.includes("papi.qingting.fm") && u.includes("user_token="));
    if (!entry) return { ...out, reason: "no-authed-request" };
    const u = new URL(entry);
    const uid = u.searchParams.get("user_id");
    const tok = u.searchParams.get("user_token");
    const dev = u.searchParams.get("device_id") || "";
    if (!uid || !tok) return { ...out, reason: "no-uid-token" };
    const common = "device_type=unknown&client_type=pod_web&wv=unknown&ut=1";
    const f = async (url) => {
      const r = await fetch(url, { credentials: "include" });
      return r.json();
    };
    const info = await f("https://papi.qingting.fm/papi/podcasters/" + uid + "/info?filter=" + encodeURIComponent(JSON.stringify({ details: 1 })) + "&" + common + "&user_id=" + uid + "&device_id=" + dev + "&user_token=" + tok);
    if (!info || info.errcode !== 0 || !info.data) return { ...out, reason: "info-err:" + ((info && info.errcode) ?? "null") };
    const ch = await f("https://papi.qingting.fm/papi/podcasters/" + uid + "/channels_for_page?order=" + encodeURIComponent("create_time desc") + "&page=1&pagesize=100&filter=" + encodeURIComponent(JSON.stringify({ channel_type: "" })) + "&device_type=unknown&client_type=pod_web&wv=unknown&pt=ChannelManagement&user_id=" + uid + "&device_id=" + dev + "&user_token=" + tok);
    if (!ch || ch.errcode !== 0 || !ch.data) return { ...out, reason: "channels-err:" + ((ch && ch.errcode) ?? "null") };
    return {
      loggedIn: true,
      uid: String(info.data.id || uid),
      name: info.data.nick_name || null,
      avatarUrl: info.data.avatar || null,
      channels: (ch.data.items || []).map((c) => ({
        id: String(c.id),
        name: String(c.title ?? ""),
        kind: c.category ?? null,
        coverUrl: c.cover ?? null,
        source: c.source ?? null,
        channelType: c.channel_type != null ? String(c.channel_type) : null,
      })),
    };
  } catch (e) {
    return { ...out, reason: String(e) };
  }
})()`;

type VerifyJsResult = {
  loggedIn: boolean;
  reason?: string;
  uid?: string;
  name?: string | null;
  avatarUrl?: string | null;
  channels?: QingtingChannel[];
};

/** 等已登录业务接口可调（页面先发过一次带 token 的请求才能复用其凭据） */
async function waitForAuthedApi(cdp: CdpLike, sessionId: string, timeoutMs = 30_000): Promise<VerifyJsResult> {
  const start = Date.now();
  for (;;) {
    try {
      const r = await evaluateScalar<VerifyJsResult>(cdp, sessionId, VERIFY_JS, { timeoutMs: 15_000 });
      if (r.loggedIn) return r;
      // 未登录（重定向到 /login 页面上不会有带 token 的请求）→ 提前判定
      const url = await evaluateScalar<string>(cdp, sessionId, "location.href", { timeoutMs: 8_000 });
      if (String(url).includes("/login")) return { loggedIn: false, reason: "redirect-login" };
    } catch {}
    if (Date.now() - start > timeoutMs) return { loggedIn: false, reason: "timeout" };
    await sleep(1_500);
  }
}

/* ---------- publish：上传节目页（草稿语义，停在「发 布」前） ---------- */

/** 把本地音频塞进上传入口（file input 初始化即存在，真机验证 accept 含 .M4A） */
async function attachAudio(cdp: CdpConnection, sessionId: string, filePath: string): Promise<void> {
  await cdp.send("DOM.enable", {}, { sessionId });
  const doc = (await cdp.send("DOM.getDocument", {}, { sessionId })) as { root?: { nodeId?: number } };
  const q = (await cdp.send(
    "DOM.querySelectorAll",
    { nodeId: doc.root?.nodeId, selector: "input[type=file][accept*='M'], input[type=file][accept*='m']" },
    { sessionId },
  )) as { nodeIds?: number[] };
  const nodeId = q.nodeIds?.[0];
  if (!nodeId) throw new Error("未找到蜻蜓上传节目页的音频入口（页面结构可能变更）");
  await cdp.send("DOM.setFileInputFiles", { files: [filePath], nodeId }, { sessionId });
}

/** 等音频传完、逐节目表单出现：节目条目（含文件名）就绪且页面无上传中进度文案 */
async function waitForProgramReady(
  cdp: CdpLike,
  sessionId: string,
  fileName: string,
  timeoutMs: number,
  onTick?: (msg: string) => void,
): Promise<boolean> {
  const base = fileName.replace(/\.[^.]+$/, "");
  const start = Date.now();
  for (;;) {
    try {
      const ready = await evaluateScalar<boolean>(
        cdp,
        sessionId,
        `(() => {
          const t = (document.body && document.body.innerText) || "";
          const hasItem = t.indexOf("节目名称") >= 0 && t.indexOf(${JSON.stringify(base)}) >= 0;
          const uploading = /上传中|上传进度|\\d+(\\.\\d+)?%/.test(t);
          return hasItem && !uploading;
        })()`,
        { timeoutMs: 10_000 },
      );
      if (ready) return true;
      if (onTick) onTick("音频上传中…");
    } catch {}
    if (Date.now() - start > timeoutMs) return false;
    await sleep(2_000);
  }
}

/** 点最内层可见文本按钮（「确 认」「发 布」等，文本带全角空格） */
async function clickTextBtn(cdp: CdpLike, sessionId: string, text: string): Promise<boolean> {
  return evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const els = [...document.querySelectorAll("button, a, [role=button], [class*=btn]")].filter(e => (e.textContent || "").trim() === ${JSON.stringify(text)} && e.offsetParent !== null && e.children.length <= 2);
      const el = els[els.length - 1];
      if (!el) return false;
      el.click();
      return true;
    })()`,
    { timeoutMs: 10_000 },
  );
}

/**
 * 编辑已上传条目的节目信息：行右侧第一个 qt-clickable-div 图标打开编辑表单
 * （真机 DOM：input[placeholder="请输入节目名"] + 节目简介 textarea(≤200字) + 节目导语 textarea(≤50字)），
 * 原生 setter 填充后点「确 认」保存条目编辑（仅更新待发布条目的页面态，不提交上线）。
 */
async function editProgramInfo(cdp: CdpLike, sessionId: string, title: string, body: string): Promise<void> {
  const pt = await evaluateScalar<[number, number] | null>(
    cdp,
    sessionId,
    `(() => {
      const btns = [...document.querySelectorAll(".qt-clickable-div")].filter(b => (b.getBoundingClientRect().width || 0) > 0);
      const btn = btns[0];
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`,
    { timeoutMs: 10_000 },
  );
  if (!pt) throw new Error("未找到节目条目的编辑入口（页面结构可能变更）");
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt[0], y: pt[1] } as never, { sessionId });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt[0], y: pt[1], button: "left", clickCount: 1, buttons: 1 } as never, { sessionId });
  await sleep(80);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pt[0], y: pt[1], button: "left", clickCount: 1 } as never, { sessionId });
  // 等编辑表单出现
  let formOk = false;
  for (let i = 0; i < 10; i++) {
    await sleep(1_000);
    formOk = await evaluateScalar<boolean>(
      cdp,
      sessionId,
      `!!document.querySelector('input[placeholder="请输入节目名"]')`,
      { timeoutMs: 8_000 },
    ).catch(() => false);
    if (formOk) break;
  }
  if (!formOk) throw new Error("节目信息编辑表单未出现（页面结构可能变更）");

  // 节目名称（input，原生 setter）
  await evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const el = document.querySelector('input[placeholder="请输入节目名"]');
      if (!el) return false;
      const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      el.focus();
      if (d && d.set) d.set.call(el, ${JSON.stringify(title)}); else el.value = ${JSON.stringify(title)};
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
    { timeoutMs: 10_000 },
  );
  // 节目简介（textarea ≤200字）
  if (body) {
    await evaluateScalar<boolean>(
      cdp,
      sessionId,
      `(() => {
        const el = document.querySelector('textarea[placeholder*="精彩简练"]');
        if (!el) return false;
        const d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        el.focus();
        if (d && d.set) d.set.call(el, ${JSON.stringify(body.slice(0, 200))}); else el.value = ${JSON.stringify(body.slice(0, 200))};
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`,
      { timeoutMs: 10_000 },
    );
    // 节目导语（textarea ≤50字，听头条推荐前置导语）
    await evaluateScalar<boolean>(
      cdp,
      sessionId,
      `(() => {
        const el = document.querySelector('textarea[placeholder*="听头条"]');
        if (!el) return false;
        const d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
        el.focus();
        if (d && d.set) d.set.call(el, ${JSON.stringify(body.slice(0, 50))}); else el.value = ${JSON.stringify(body.slice(0, 50))};
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`,
      { timeoutMs: 10_000 },
    );
  }
  await sleep(500);
  // 「确 认」只保存条目编辑（更新待发布条目的页面态），不是发布提交
  const confirmed = await clickTextBtn(cdp, sessionId, "确 认");
  if (!confirmed) throw new Error("未找到节目编辑表单的「确 认」按钮（页面结构可能变更）");
  await sleep(1_500);
  const applied = await evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => (document.body.innerText || "").indexOf(${JSON.stringify(title.slice(0, 20))}) >= 0)()`,
    { timeoutMs: 8_000 },
  );
  if (!applied) throw new Error("节目名称编辑未生效（确认被拒绝？）");
}

/* ---------- 适配器 ---------- */

export const qingtingAdapter: PlatformAdapter<QingtingProfile> = {
  meta: { ...getPlatformMeta("qingting")!, supports: ["audio"] },

  account: {
    profileSchema: qingtingProfileSchema,

    async verify(_acct, ctx): Promise<VerifyResult<QingtingProfile>> {
      ctx.log("qingting.verify.start");
      try {
        const r = await ctx.runPage(
          "qingting",
          { url: QINGTING_ADMIN_URL, keepOpen: false, activate: false },
          async (cdp, sid) => waitForAuthedApi(cdp, sid),
        );

        if (!r.loggedIn) {
          ctx.log("qingting.verify.fail", { reason: r.reason ?? "not-logged-in" });
          return {
            state: "fail",
            failReason:
              "蜻蜓FM 登录态缺失：admin.qingting.fm 仅支持扫码/账密人工登录，请先在日常 Chrome 登录主播公众平台后重新导入 profile",
          };
        }

        const channels = (r.channels ?? []).map((c) => ({
          id: String(c.id),
          name: String(c.name ?? ""),
          kind: c.kind ?? null,
          coverUrl: c.coverUrl ?? null,
          source: c.source ?? null,
          channelType: c.channelType ?? null,
        }));
        ctx.log("qingting.verify.ok", { uid: r.uid, channelCount: channels.length });
        return {
          state: "ok",
          profile: {
            uid: String(r.uid),
            name: r.name ?? null,
            avatarUrl: r.avatarUrl ?? null,
            channels,
          },
          name: r.name ?? null,
          uid: String(r.uid),
          avatarUrl: r.avatarUrl ?? null,
        };
      } catch (e) {
        return { state: "fail", failReason: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  /**
   * 蜻蜓FM 发布 = 只到草稿为止：上传音频 + 填节目名称/导语 + 选好专辑，**停在「发 布」前**。
   * 绝不点「发 布」（点了即提交上线/进入审核）。标签页保持打开，由用户完成最后一步。
   * 目标专辑选择：环境变量 TASSELLO_QINGTING_CHANNEL_ID 优先，否则 profile 恰有一个专辑时自动选它。
   */
  async publish(post: PostDraft, acct: AdapterAccount<QingtingProfile>, ctx: AdapterCtx, onStage: StageReporter): Promise<PublishResult> {
    const audio = post.assets.find((a) => a.kind === "audio" && a.path);
    if (!audio) throw new Error("蜻蜓FM 发布需要音频素材（kind=audio）");

    const channels = acct.profile?.channels ?? [];
    const envId = process.env.TASSELLO_QINGTING_CHANNEL_ID;
    const target = envId
      ? channels.find((c) => c.id === envId)
      : channels.length === 1
        ? channels[0]
        : undefined;
    if (!target) {
      const list = channels.map((c) => `${c.id}=${c.name}`).join(", ") || "（无）";
      throw new Error(
        envId
          ? `TASSELLO_QINGTING_CHANNEL_ID=${envId} 不在账号专辑列表里（现有：${list}）`
          : `账号有多个专辑且未指定目标：请用 TASSELLO_QINGTING_CHANNEL_ID 指定（现有：${list}）`,
      );
    }

    const fileName = audio.path.split("/").pop() || "audio.m4a";
    const title = (post.title || fileName.replace(/\.[^.]+$/, "")).trim();
    const body = (post.body || "").trim();
    ctx.log("qingting.publish.start", { channelId: target.id, channelName: target.name, title });

    onStage({ stage: 0, progress: 100 });
    onStage({ stage: 1, progress: 10, message: `打开蜻蜓上传节目页（专辑：${target.name}）` });

    // keepOpen: 页面保持打开——未点发布前内容只在页面本地态，用户在页面上点「发 布」完成提交
    return ctx.runPage("qingting", { url: qingtingUploadUrl(target.id), keepOpen: true, activate: true }, async (cdp, sid) => {
      // 等页面就绪：专辑已预选（select 文案 = 专辑名）
      let selected = false;
      for (let i = 0; i < 20; i++) {
        await sleep(1_500);
        try {
          selected = await evaluateScalar<boolean>(
            cdp,
            sid,
            `(() => {
              const sel = document.querySelector(".ant-select");
              return !!sel && (sel.innerText || "").indexOf(${JSON.stringify(target.name)}) >= 0;
            })()`,
            { timeoutMs: 8_000 },
          );
          if (selected) break;
        } catch {}
      }
      if (!selected) throw new Error(`目标专辑「${target.name}」未能在上传页预选（页面结构可能变更，或该专辑不可选）`);
      onStage({ stage: 1, progress: 30, message: "专辑已选中，上传音频" });

      await attachAudio(cdp, sid, audio.path);
      const done = await waitForProgramReady(cdp, sid, fileName, 900_000, (m) => onStage({ stage: 1, progress: 60, message: m }));
      if (!done) throw new Error("音频上传未完成（超时 15 分钟；支持 mp3/wav/aac/flac/ogg/m4a 等，请检查文件格式）");
      onStage({ stage: 1, progress: 100, message: "音频上传完成" });

      onStage({ stage: 2, progress: 30, message: "填充节目名称与简介" });
      await editProgramInfo(cdp, sid, title, body);
      onStage({ stage: 2, progress: 100, message: "表单已填充" });

      // 红线：绝不点「发 布」。内容此时在页面本地态（未提交），把页面留给用户。
      const entryUrl = qingtingUploadUrl(target.id);
      ctx.log("qingting.publish.draft-stopped", { channelId: target.id, title });
      onStage({
        stage: 3,
        progress: 100,
        message: `已填好并停在第 3 方「发 布」确认前（绝不自动发布）：请在保持打开的蜻蜓页面里核对后自己点「发 布」。入口：${entryUrl}`,
      });
      return { url: entryUrl, needsManualConfirm: true, receipt: { channelId: target.id, channelName: target.name, note: "stopped-before-publish" } };
    });
  },
};
