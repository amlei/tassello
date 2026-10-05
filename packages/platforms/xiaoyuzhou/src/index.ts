/* @tassello/platform-xiaoyuzhou —— 小宇宙适配器（podcaster.xiaoyuzhoufm.com 创作者后台）
 *
 * 通道选型（2026-10-02 真机探测，详见包内 NOTES.md）：
 * - verify 走页面上下文 fetch：`GET /v1/profile/get` + `POST /v1/podcast/list`（podcaster-api 域），
 *   必须带 `x-jike-allow-app-token-in-cookie: true` + `x-app-build-time` 两个头，否则 401
 *   （鉴权靠 cookie `x-jike-access-token`，即刻系 token 体系）。
 * - 发布链路：创作者后台「创建单集」页无草稿概念（bundle 里没有任何 episode 草稿接口，
 *   `/v1/episode/hosted/create-free` 即创建并进入审核/上线流程，`/v1/episode/hosted/publish` 是后续动作）。
 *   故按产品语义「绝不自动发布」，publish 停在：音频已上传、标题/简介/shownotes 已填好、
 *   绝不点平台自己的「创建/定时发布」按钮 → needsManualConfirm: true，由用户在打开的标签页里点「创建」。
 * - 音频上传：真实鼠标点开「上传播客」面板（面板懒创建 file input，不点不存在）→
 *   DOM.setFileInputFiles 塞 `accept*=audio` 的 input → 页面自身 POST upload.qiniup.com 直传。
 *   注意：页面上最先出现的两个 file input 是封面/欢迎弹层的图片口（accept=image/*），
 *   往里塞音频只会有一次 avInfo 探测上传然后页面纹丝不动（真机踩坑）。
 * - CDP 铁律：页面是 React + immer，evaluateScalar 只允许标量/纯结构出页面。
 */
import { z } from "zod";
import type { PlatformAdapter, PostDraft, AdapterCtx, StageReporter, PublishResult } from "@tassello/platform-core";

type CdpConnection = CdpLike;
import { getPlatformMeta } from "@tassello/platform-core";
import { evaluateScalar } from "@tassello/cdp";

/** 节目（频道）信息：来自 /v1/podcast/list 与 /v1/profile/get 的 ownedPodcasts，字段都有真机证据 */
export const xiaoyuzhouChannelSchema = z.object({
  pid: z.string(),
  title: z.string(),
  author: z.string().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  syncMode: z.string().nullable().optional(),
});
export type XiaoyuzhouChannel = z.infer<typeof xiaoyuzhouChannelSchema>;

export const xiaoyuzhouProfileSchema = z.object({
  uid: z.string(),
  nickname: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  channels: z.array(xiaoyuzhouChannelSchema),
});
export type XiaoyuzhouProfile = z.infer<typeof xiaoyuzhouProfileSchema>;

export const XYZ_BASE = "https://podcaster.xiaoyuzhoufm.com";
export const XYZ_API = "https://podcaster-api.xiaoyuzhoufm.com";
/** 创建单集页（publish 停在这里，等用户点「创建」） */
export const xyzCreateEpisodeUrl = (pid: string) => `${XYZ_BASE}/podcast/${pid}/episode/create`;

type CdpLike = { send: <R = unknown>(method: string, params?: Record<string, unknown>, opts?: { sessionId?: string }) => Promise<R> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** podcaster-api 页面上下文 fetch（带 cookie + 必需头；只回标量/纯 JSON） */
const XYZ_FETCH_JS = `(async () => {
  try {
    const H = { Accept: "application/json", "Content-Type": "application/json", "x-jike-allow-app-token-in-cookie": "true", "x-app-build-time": "2026-09-24 14:25:46 +0800" };
    const p = await fetch("https://podcaster-api.xiaoyuzhoufm.com/v1/profile/get", { credentials: "include", headers: H });
    if (p.status !== 200) return { ok: false, status: p.status, reason: "profile/get " + p.status };
    const profile = (await p.json()).data || {};
    const l = await fetch("https://podcaster-api.xiaoyuzhoufm.com/v1/podcast/list", { method: "POST", credentials: "include", headers: H, body: "{}" });
    if (l.status !== 200) return { ok: false, status: l.status, reason: "podcast/list " + l.status };
    const list = (await l.json()).data || [];
    return {
      ok: true,
      uid: String(profile.uid || ""),
      nickname: profile.nickname || null,
      avatarUrl: (profile.avatar && profile.avatar.picture && profile.avatar.picture.picUrl) || null,
      channels: list.map((x) => ({ pid: String(x.pid || ""), title: String(x.title || ""), author: x.author || null, coverUrl: (x.image && x.image.picUrl) || null, syncMode: x.syncMode || null })),
    };
  } catch (e) {
    return { ok: false, status: 0, reason: String(e) };
  }
})()`;

type VerifyJsResult =
  | { ok: true; uid: string; nickname: string | null; avatarUrl: string | null; channels: XiaoyuzhouChannel[] }
  | { ok: false; status: number; reason: string };

/** 等 podcaster 页面就绪（profile/get 能拿到登录态） */
async function waitForReady(cdp: CdpLike, sessionId: string, timeoutMs = 25_000): Promise<VerifyJsResult | null> {
  const start = Date.now();
  for (;;) {
    try {
      const r = await evaluateScalar<VerifyJsResult>(cdp, sessionId, XYZ_FETCH_JS, { timeoutMs: 15_000 });
      if (r.ok) return r;
    } catch {}
    if (Date.now() - start > timeoutMs) return null;
    await sleep(1500);
  }
}

/** 放大视口：小窗口下上传面板可能布局异常 */
async function enlargeViewport(cdp: CdpLike, sessionId: string): Promise<void> {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false }, { sessionId });
  await sleep(800);
}

/** 真实鼠标点击（mousePressed 带 buttons:1 + 按下延迟，对齐 xhs 真机结论） */
async function mouseClick(cdp: CdpLike, sessionId: string, x: number, y: number): Promise<void> {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y } as never, { sessionId });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, buttons: 1 } as never, { sessionId });
  await sleep(80);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 } as never, { sessionId });
}

/** 关首次进入的引导弹层（「我知道了」/「稍后再说」），存在才点 */
async function dismissGuide(cdp: CdpLike, sessionId: string): Promise<void> {
  try {
    await evaluateScalar<boolean>(
      cdp,
      sessionId,
      `(() => {
        const b = Array.from(document.querySelectorAll("button")).find((x) => ["我知道了", "稍后再说"].includes((x.innerText || "").trim()));
        if (!b) return false;
        b.click();
        return true;
      })()`,
      { timeoutMs: 8_000 },
    );
  } catch {}
}

/** 真实点击「点击上传播客」展开上传面板（面板里的音频 file input 是懒创建的） */
async function openUploadPanel(cdp: CdpLike, sessionId: string): Promise<void> {
  const pt = await evaluateScalar<[number, number] | null>(
    cdp,
    sessionId,
    `(() => {
      const el = Array.from(document.querySelectorAll("*")).find((e) => (e.textContent || "").trim() === "点击上传播客"
        && e.offsetParent !== null && e.children.length === 0);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`,
    { timeoutMs: 10_000 },
  );
  if (!pt) throw new Error("未找到「点击上传播客」入口（页面结构可能变更）");
  await mouseClick(cdp, sessionId, pt[0]!, pt[1]!);
  await sleep(2000);
}

/** 把音频塞进上传面板的音频 file input（accept 含 audio 的那个；封面/弹层的 image 口不要碰） */
async function attachAudio(cdp: CdpConnection, sessionId: string, filePath: string): Promise<void> {
  const inputs = await evaluateScalar<{ accept: string }[]>(
    cdp,
    sessionId,
    `(() => Array.from(document.querySelectorAll("input[type=file]")).map((el) => ({ accept: el.getAttribute("accept") || "" })))()`,
    { timeoutMs: 10_000 },
  );
  const idx = inputs.findIndex((i) => /audio/i.test(i.accept));
  if (idx < 0) throw new Error("未找到音频上传入口（上传面板未展开或页面结构变更）");
  await cdp.send("DOM.enable", {}, { sessionId });
  const doc = (await cdp.send("DOM.getDocument", {}, { sessionId })) as { root?: { nodeId?: number } };
  const q = (await cdp.send("DOM.querySelectorAll", { nodeId: doc.root?.nodeId, selector: "input[type=file]" }, { sessionId })) as { nodeIds?: number[] };
  const nodeId = q.nodeIds?.[idx];
  if (!nodeId) throw new Error("音频上传入口 DOM 节点获取失败");
  await cdp.send("DOM.setFileInputFiles", { files: [filePath], nodeId }, { sessionId });
}

/** 等音频上传完成：页面出现「音频 · 时长」与「重新上传」字样（页面自身走 upload.qiniup.com 直传） */
async function waitForAudioUploaded(cdp: CdpLike, sessionId: string, timeoutMs: number, onTick?: (m: string) => void): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const done = await evaluateScalar<boolean>(
        cdp,
        sessionId,
        `(() => {
          const t = (document.body && document.body.innerText) || "";
          // 上传完成后面板可能自动收起，「重新上传」不一定可见；稳定标记是「音频 · 时长」
          return /音频\s*·\s*\d/.test(t) || /重新上传/.test(t);
        })()`,
        { timeoutMs: 8_000 },
      );
      if (done) return;
      if (/上传失败|错误/.test(JSON.stringify(await evaluateScalar<string>(cdp, sessionId, `(() => ((document.body && document.body.innerText) || "").slice(0, 2000))()`, { timeoutMs: 8_000 })))) {
        // 页面文本含「错误/失败」不一定是音频区，继续等，靠超时兜底
      }
    } catch {}
    if (onTick) onTick("音频上传中…");
    if (Date.now() - start > timeoutMs) throw new Error("音频上传超时（小宇宙支持 WAV/MP3/M4A，≤2GB）");
    await sleep(4000);
  }
}

/** 填标题 / 简介（原生 input + textarea，原生 setter 触发 React 更新） */
async function fillField(cdp: CdpLike, sessionId: string, selector: string, value: string): Promise<void> {
  const ok = await evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el || el.offsetParent === null) return false;
      const isInput = el.tagName === "INPUT";
      const d = Object.getOwnPropertyDescriptor(isInput ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, "value");
      el.focus();
      if (d && d.set) d.set.call(el, ${JSON.stringify(value)});
      else el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
    { timeoutMs: 10_000 },
  );
  if (!ok) throw new Error(`未找到输入框 ${selector}（页面结构可能变更）`);
}

/** 填 shownotes（tiptap ProseMirror，focus + Input.insertText 走真实输入管线） */
async function fillShownotes(cdp: CdpConnection, sessionId: string, text: string): Promise<void> {
  const focused = await evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const el = document.querySelector(".tiptap.ProseMirror") || document.querySelector(".ProseMirror[contenteditable='true']");
      if (!el) return false;
      el.focus();
      return document.activeElement === el;
    })()`,
    { timeoutMs: 10_000 },
  );
  if (!focused) throw new Error("未找到 shownotes 编辑器（页面结构可能变更）");
  const paras = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < paras.length; i++) {
    if (i > 0) {
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }, { sessionId });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, { sessionId });
    }
    await cdp.send("Input.insertText", { text: paras[i]! }, { sessionId });
  }
  await sleep(600);
}

/* ---------- 适配器 ---------- */

export const xiaoyuzhouAdapter: PlatformAdapter<XiaoyuzhouProfile> = {
  meta: { ...getPlatformMeta("xiaoyuzhou")!, supports: ["audio"] },

  account: {
    profileSchema: xiaoyuzhouProfileSchema,

    async verify(_acct, ctx) {
      ctx.log("xiaoyuzhou.verify.start");
      try {
        const r = await ctx.runPage("xiaoyuzhou", { url: `${XYZ_BASE}/podcast`, keepOpen: false, activate: false }, async (cdp, sid) => {
          const ready = await waitForReady(cdp, sid);
          return ready ?? (await evaluateScalar<VerifyJsResult>(cdp, sid, XYZ_FETCH_JS, { timeoutMs: 20_000 }));
        });
        if (!r.ok || !r.uid) {
          return { state: "fail", failReason: "小宇宙登录态已失效，请重新登录 podcaster.xiaoyuzhoufm.com 后重试" };
        }
        ctx.log("xiaoyuzhou.verify.ok", { uid: r.uid, channels: r.channels.length });
        return {
          state: "ok",
          profile: { uid: r.uid, nickname: r.nickname, avatarUrl: r.avatarUrl, channels: r.channels },
          name: r.nickname,
          uid: r.uid,
          avatarUrl: r.avatarUrl,
        };
      } catch (e) {
        return { state: "fail", failReason: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  async publish(post: PostDraft, acct, ctx: AdapterCtx, onStage: StageReporter): Promise<PublishResult> {
    onStage({ stage: 0, progress: 10, message: "整理小宇宙单集" });

    const audioAsset = post.assets.find((a) => a.kind === "audio" && a.path);
    if (!audioAsset) throw new Error("小宇宙发布需要一个音频素材（WAV/MP3/M4A，≤2GB）");
    const imageAsset = post.assets.find((a) => a.kind === "image" && a.path);

    // 目标节目：env 指定 > 唯一节目默认 > 多节目时报错列出可选
    const channels = acct?.profile?.channels ?? [];
    const pidEnv = process.env.TASSELLO_XIAOYUZHOU_PID?.trim();
    const channel = pidEnv
      ? channels.find((c) => c.pid === pidEnv)
      : channels.length === 1
        ? channels[0]
        : undefined;
    if (!channel) {
      const list = channels.map((c) => `${c.pid}(${c.title})`).join(", ") || "（无）";
      throw new Error(`未能确定目标节目：请用 TASSELLO_XIAOYUZHOU_PID 指定。账号下节目：${list}`);
    }

    const title = (post.title || "未命名").trim();
    if (!title) throw new Error("单集标题为空");
    const brief = (post.body || "").trim();
    ctx.log("xiaoyuzhou.publish.start", { pid: channel.pid, title, briefLen: brief.length, audio: audioAsset.path, cover: imageAsset?.path ?? null });
    onStage({ stage: 0, progress: 100 });
    onStage({ stage: 1, progress: 5, message: `打开小宇宙创建单集页（${channel.title}）` });

    // keepOpen: 停在填好的创建页，等用户人工点「创建」——本适配器绝不点它
    return ctx.runPage("xiaoyuzhou", { url: xyzCreateEpisodeUrl(channel.pid), keepOpen: true, activate: true }, async (cdp, sid) => {
      const ready = await waitForReady(cdp, sid);
      if (!ready) throw new Error("小宇宙创作者后台未就绪（可能未登录）");
      await enlargeViewport(cdp, sid);
      await dismissGuide(cdp, sid);

      onStage({ stage: 1, progress: 20, message: "展开音频上传面板" });
      await openUploadPanel(cdp, sid);
      onStage({ stage: 1, progress: 30, message: "上传音频（页面走七牛直传）" });
      await attachAudio(cdp, sid, audioAsset.path);
      // 大文件放宽到 30 分钟
      await waitForAudioUploaded(cdp, sid, 1_800_000, (m) => onStage({ stage: 1, progress: 60, message: m }));
      onStage({ stage: 1, progress: 100, message: "音频上传完成" });

      onStage({ stage: 2, progress: 30, message: "填充标题 / 简介 / shownotes" });
      await fillField(cdp, sid, 'input[placeholder="输入单集标题"]', title);
      // 「节目简介」textarea 只出现在首次引导弹层（完善播客节目信息），单集表单没有简介字段，
      // 正文一律进 shownotes（tiptap）
      const hasBrief = await evaluateScalar<boolean>(cdp, sid, `(() => { const el = document.querySelector('textarea[placeholder="节目简介"]'); return !!el && el.offsetParent !== null; })()`, { timeoutMs: 8_000 }).catch(() => false);
      if (brief && hasBrief) await fillField(cdp, sid, 'textarea[placeholder="节目简介"]', brief.slice(0, 2000));
      await fillShownotes(cdp, sid, brief || title);

      // 产品语义红线：到此为止。绝不点击「创建 / 定时发布」——正式发布由用户在页面上完成。
      // （小宇宙创建单集页没有草稿功能，/v1/episode/hosted/create-free 即发布入审核，故不能代点。）
      onStage({ stage: 3, progress: 100, message: "单集已填好，请人工检查并点「创建」完成发布（本工具不会替你点）" });
      ctx.log("xiaoyuzhou.publish.stopped-before-create", { pid: channel.pid });
      return { url: xyzCreateEpisodeUrl(channel.pid), needsManualConfirm: true, receipt: { pid: channel.pid } };
    });
  },
};
