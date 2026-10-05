/* @tassello/platform-wechat —— 公众号适配器：CDP 通道（mp 后台统一编辑器填充 + 人工确认）
 *
 * 2026-09 真机验证（详见 docs/platforms.md §2.4）：
 * - 四种内容形态共用新编辑器 appmsg_edit_v2&type=77，由 createType 区分：
 *   文章=0 / 贴图=8 / 视频=5 / 播客=7（音频归播客）。
 * - 文章正文配图走页面上下文 filetransfer 接口（scene=8），返回 mmbiz.qpic.cn
 *   cdn_url，直接贴进正文 HTML；ticket 为空也可用。
 * - 贴图：专用 file input（multiple）交给 DOM.setFileInputFiles，编辑器自己上传。
 * - 视频：选择视频弹窗 → 本地上传 → file input → 编辑器转码完成后确定。
 * - 播客：添加音频 → 插入音频弹窗 → 上传音频 → file input → 插入。
 * - 正文/描述填充必须走合成 paste 事件：编辑器是 ProseMirror，直接 innerHTML
 *   只改 DOM 不进编辑器状态，发表时内容会丢。
 */
import { z } from "zod";
import type {
  PlatformAdapter,
  PostDraft,
  AdapterCtx,
  StageReporter,
  PublishResult,
} from "@tassello/platform-core";
import type { CdpLike } from "@tassello/platform-core";

type CdpConnection = CdpLike;
import { getPlatformMeta } from "@tassello/platform-core";
import { evaluateScalar } from "@tassello/cdp";
import { uploadWechatMaterial, wechatSourceFilename } from "./upload";

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
/** 统一编辑器：type=77 + createType 区分形态 */
const EDITOR_URL = (createType: number, token?: string | null) =>
  `${MP_HOME}/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=${createType}${token ? `&token=${token}` : ""}&lang=zh_CN`;
/** 独立视频素材上传页；公众号“本地上传”实际会跳到这个页面。 */
const VIDEO_UPLOAD_URL = (token?: string | null) =>
  `${MP_HOME}/cgi-bin/appmsg?t=media/videomsg_edit&action=video_edit&type=15${token ? `&token=${token}` : ""}&lang=zh_CN`;

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

/* ---------- 发布用的页内小工具 ---------- */

type PageClient = {
  send: <R = unknown>(method: string, params?: Record<string, unknown>, opts?: { sessionId?: string }) => Promise<R>;
};

/** 轮询页内条件成立；intervalMs 毫秒试一次 */
async function waitForJs(
  cdp: PageClient,
  sessionId: string,
  js: string,
  { timeoutMs, intervalMs = 1500, label = "条件" }: { timeoutMs: number; intervalMs?: number; label?: string },
): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const ok = await evaluateScalar<boolean>(cdp, sessionId, js, { timeoutMs: 8_000 });
      if (ok) return;
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error(`等待${label}超时（${Math.round(timeoutMs / 1000)}s，页面结构可能变更）`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** 把本地文件交给页面 file input（编辑器自己的上传器接管后续），CDP DOM.setFileInputFiles */
async function setFileInput(
  cdp: CdpConnection,
  sessionId: string,
  selectorJs: string,
  filePaths: string[],
): Promise<void> {
  await cdp.send("DOM.enable", {}, { sessionId });
  const doc = (await cdp.send("DOM.getDocument", {}, { sessionId })) as { root?: { nodeId?: number } };
  const q = (await cdp.send(
    "DOM.querySelectorAll",
    { nodeId: doc.root?.nodeId, selector: "input[type=file]" },
    { sessionId },
  )) as { nodeIds?: number[] };
  const nodes = q.nodeIds ?? [];
  if (!nodes.length) throw new Error("页面里没有 file input（页面结构可能变更）");
  // 挨个读 accept/匹配：nodeIds 与 querySelectorAll 顺序一致，这里借页面求值挑出目标 input 的序号。
  // mp 上传后会重建 input（旧节点成死节点），必须挑「最后一个」匹配项——它是新渲染出来的活的
  const pick = await evaluateScalar<number>(
    cdp,
    sessionId,
    `(() => {
      const files = Array.from(document.querySelectorAll("input[type=file]"));
      let hit = -1;
      files.forEach((f, i) => { if (${selectorJs}) hit = i; });
      return hit;
    })()`,
    { timeoutMs: 8_000 },
  );
  if (pick < 0 || pick >= nodes.length) throw new Error("未匹配到可用的上传入口（页面结构可能变更）");
  await cdp.send("DOM.setFileInputFiles", { files: filePaths, nodeId: nodes[pick]! }, { sessionId });
}

/** 合成 paste 事件把 HTML/纯文本送进 ProseMirror：走编辑器自己的粘贴管线，
 *  状态与 DOM 才会同步（直接 innerHTML 骗过 DOM 骗不过状态，发表会丢内容） */
async function pasteIntoProseMirror(
  cdp: PageClient,
  sessionId: string,
  pickJs: string,
  html: string,
  plain: string,
): Promise<boolean> {
  return evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(async () => {
      const pick = ${pickJs};
      const el = pick(Array.from(document.querySelectorAll(".ProseMirror")));
      if (!el) return false;
      el.focus();
      const dt = new DataTransfer();
      dt.setData("text/html", ${JSON.stringify(html)});
      dt.setData("text/plain", ${JSON.stringify(plain)});
      const ev = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
      el.dispatchEvent(ev);
      await new Promise((r) => setTimeout(r, 400));
      return true;
    })()`,
    { timeoutMs: 15_000 },
  );
}


/** 正文 HTML 粘贴后，公众号可能弹「继续插入」确认框；只在文章正文粘贴后处理 */
async function confirmContinueInsert(cdp: PageClient, sessionId: string): Promise<boolean> {
  return evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(async () => {
      for (let i = 0; i < 8; i++) {
        const btn = Array.from(document.querySelectorAll("button, .weui-desktop-btn, a"))
          .find((b) => b.offsetHeight > 0 && (b.textContent || "").trim() === "继续插入");
        if (btn) {
          btn.click();
          return true;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      return false;
    })()`,
    { timeoutMs: 10_000 },
  );
}

/** textarea 填充：原生 value setter + input 事件（mp 的框架监听原生事件） */
async function fillTextarea(
  cdp: PageClient,
  sessionId: string,
  selector: string,
  value: string,
): Promise<boolean> {
  return evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const ta = document.querySelector(${JSON.stringify(selector)});
      if (!ta) return false;
      const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      ta.focus();
      if (desc && desc.set) desc.set.call(ta, ${JSON.stringify(value)});
      else ta.value = ${JSON.stringify(value)};
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
    { timeoutMs: 10_000 },
  );
}

/** 打开统一编辑器并等它就绪；会话失效被踢回首页时用新 token 重导航一次。
 *  返回 true = 编辑器就绪；扫码页 = 抛未登录 */
async function openEditor(
  cdp: PageClient,
  sessionId: string,
  createType: number,
  knownToken: string | null | undefined,
): Promise<string> {
  // 直接落到编辑器 URL；token 失效会被重定向回首页（带新 token）
  const start = Date.now();
  let navigated = false;
  for (;;) {
    const st = await evaluateScalar<{ onScan: boolean; token: string | null; onEditor: boolean; titleReady: boolean }>(
      cdp,
      sessionId,
      `JSON.parse(JSON.stringify({
        onScan: !!document.querySelector(".login__type__container__scan, #scan_qrcode"),
        token: (location.search.match(/token=(\\d+)/) || [])[1] || null,
        onEditor: location.href.indexOf("appmsg_edit") >= 0,
        titleReady: !!document.querySelector("textarea#title") && !!document.querySelector(".ProseMirror"),
      }))`,
      { timeoutMs: 6_000 },
    ).catch(() => null);
    if (st?.onScan) throw new Error("公众号后台未登录，请先在浏览器里扫码登录（工作台「重新获取」）");
    if (st?.onEditor && st.titleReady) return st.token ?? knownToken ?? "";
    // 被踢回首页：拿新 token 重进编辑器（只重导一次，防循环）
    if (st?.token && !st.onEditor && !navigated) {
      navigated = true;
      await cdp.send("Page.navigate", { url: EDITOR_URL(createType, st.token) }, { sessionId });
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }
    if (Date.now() - start > 45_000) throw new Error("公众号编辑器加载超时（可能未登录或页面结构变更）");
    await new Promise((r) => setTimeout(r, 1200));
  }
}

/** 编辑区 HTML → 公众号正文 HTML：配图换成 mp cdn 地址，figure 展开成裸 img 段落。
 *  没有配图时原样返回；换源失败抛错（由调用方决定是否降级剔除配图） */
function buildMpBodyHtml(post: PostDraft, urlByAsset: Map<string, string>): string {
  const html = post.bodyHtml || "";
  // figure：取 data-asset 换成对应 cdn url 的 img（公众号正文没有"图注角标"概念）
  return html.replace(/<figure[^>]*data-asset="([^"]+)"[\s\S]*?<\/figure>/g, (m, assetId: string) => {
    const url = urlByAsset.get(assetId);
    if (!url) return "";
    return `<p><img src="${url}" alt=""></p>`;
  });
}

/** 等正文 ProseMirror 真的吃下内容（有段落文字或图片） */
const BODY_FILLED_JS = `(window.__tasselloBodyCheck = (minImgs) => {
  const pms = Array.from(document.querySelectorAll(".ProseMirror")).filter((e) => e.offsetHeight > 40);
  const body = pms.find((e) => e.querySelector("p, img, h1, h2, h3, blockquote, ul, ol"));
  return !!body && (body.textContent.replace(/\\s+/g, "").length > 0 || body.querySelectorAll("img").length >= minImgs);
})`;

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
        const r = await ctx.runPage("wechat", { url: MP_HOME, keepOpen: false, activate: false }, (cdp, sid) =>
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
    if (!acct) throw new Error("公众号需要账号上下文");
    const args = { post, acct, ctx, onStage };
    switch (post.type) {
      case "article":
        return publishArticle(args);
      case "image":
        return publishImage(args);
      case "video":
        return publishVideo(args);
      case "audio":
        return publishAudio(args);
      default:
        throw new Error(`公众号不支持的内容类型：${post.type}`);
    }
  },
};

type PublishArgs = { post: PostDraft; acct: { id?: string; uid?: string | null; profile?: unknown }; ctx: AdapterCtx; onStage: StageReporter };

function uploadAccountId(acct: PublishArgs["acct"]): string {
  return acct.id?.trim() || acct.uid?.trim() || "unknown-account";
}

/* ---------- 文章（createType=0：标题 + 摘要 + 富文本正文，配图上传到素材库换 mp 地址） ---------- */
async function publishArticle({ post, acct, ctx, onStage }: PublishArgs): Promise<PublishResult> {
  onStage({ stage: 0, progress: 20, message: "整理文章内容" });
  const title = (post.title || "未命名").slice(0, 64);
  const htmlSource = post.bodyHtml?.trim() ?? "";
  if (!htmlSource && !(post.body || "").trim()) throw new Error("文章正文为空");

  // 收集正文配图（asset:// 引用 → 本地文件）
  const figRe = /<figure[^>]*data-asset="([^"]+)"[\s\S]*?<\/figure>/g;
  const figIds: string[] = [];
  for (const m of htmlSource.matchAll(figRe)) figIds.push(m[1]!);
  const pathById = new Map(post.assets.filter((a) => a.kind === "image" && a.path).map((a) => [a.id, a.path]));
  const missing = figIds.filter((id) => !pathById.has(id));
  if (missing.length) ctx.log("wechat.article.figures-missing", { missing });

  onStage({ stage: 0, progress: 100 });
  onStage({ stage: 1, progress: 10, message: figIds.length ? `上传 ${figIds.length} 张配图到素材库` : "无配图" });

  return ctx.runPage("wechat", { url: EDITOR_URL(0, (acct.profile as WechatProfile).sessionToken), keepOpen: true, activate: true }, async (cdp, sid) => {
    const token = await openEditor(cdp, sid, 0, (acct.profile as WechatProfile).sessionToken);
    ctx.log("wechat.article.editor-ready", { token });

    // 配图：逐张走编辑器同款上传接口换 mp 地址；失败降级剔除配图（不阻塞发文，人工确认时可见）
    const urlByAsset = new Map<string, string>();
    let degraded = false;
    for (let i = 0; i < figIds.length; i++) {
      const id = figIds[i]!;
      const path = pathById.get(id);
      if (!path) continue;
      onStage({ stage: 1, progress: 10 + Math.round(((i + 1) / figIds.length) * 80), message: `上传配图 ${i + 1}/${figIds.length}` });
      try {
        const upload = await uploadWechatMaterial(cdp, sid, path, { accountId: uploadAccountId(acct), scene: 8, assets: ctx.assets });
        urlByAsset.set(id, upload.cdn ?? "");
        ctx.log("wechat.article.figure-uploaded", { id, filename: upload.filename, materialId: upload.id, cached: upload.cached });
      } catch (e) {
        degraded = true;
        ctx.log("wechat.article.figure-failed", { id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const bodyHtml = buildMpBodyHtml(post, urlByAsset);
    const plainText = (post.body || "").trim();
    if (!bodyHtml.replace(/<[^>]+>/g, "").trim() && !urlByAsset.size && !plainText) {
      throw new Error("文章正文为空");
    }
    onStage({ stage: 1, progress: 100, message: degraded ? "部分配图上传失败，已剔除（可在编辑器补图）" : "配图就绪" });

    onStage({ stage: 2, progress: 20, message: "填充标题与摘要" });
    // 标题：textarea#title 是提交字段；编辑器标题区也是 ProseMirror，双写保险
    if (!(await fillTextarea(cdp, sid, "textarea#title", title))) {
      throw new Error("未找到公众号标题输入框（页面结构可能变更）");
    }
    await evaluateScalar(
      cdp,
      sid,
      `(() => {
        const pm = Array.from(document.querySelectorAll(".ProseMirror")).find((e) => (e.offsetHeight > 0 && e.offsetHeight < 60));
        if (pm && !pm.textContent.trim()) {
          const dt = new DataTransfer();
          dt.setData("text/plain", ${JSON.stringify(title)});
          pm.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
        }
        return true;
      })()`,
      { timeoutMs: 10_000 },
    );
    const desc = plainText.replace(/\s+/g, " ").slice(0, 120);
    if (desc) await fillTextarea(cdp, sid, "textarea#js_description", desc);

    onStage({ stage: 2, progress: 60, message: "粘贴正文" });
    // 正文 ProseMirror：非标题区里最高的那个
    const pasted = await pasteIntoProseMirror(
      cdp,
      sid,
      `(roots) => roots.filter((e) => e.offsetHeight > 80).sort((a, b) => b.offsetHeight - a.offsetHeight)[0] || null`,
      bodyHtml,
      plainText,
    );
    if (!pasted) throw new Error("未找到公众号正文编辑区（页面结构可能变更）");
    if (await confirmContinueInsert(cdp, sid)) ctx.log("wechat.article.continue-insert-confirmed");
    await waitForJs(
      cdp,
      sid,
      `(() => { ${BODY_FILLED_JS}; return window.__tasselloBodyCheck(${urlByAsset.size ? 1 : 0}); })()`,
      { timeoutMs: 20_000, label: "正文填充校验" },
    );
    ctx.log("wechat.article.filled", { figures: urlByAsset.size, degraded });

    onStage({ stage: 3, progress: 100, message: "请在浏览器里检查后自行「保存为草稿」或「发表」，然后回工作台标记完成" });
    return { url: null, needsManualConfirm: true };
  });
}

/* ---------- 贴图（createType=8：图集 ≤20 张 + 描述，标题选填） ---------- */
async function publishImage({ post, acct, ctx, onStage }: PublishArgs): Promise<PublishResult> {
  onStage({ stage: 0, progress: 30, message: "整理贴图" });
  const images = post.assets.filter((a) => a.kind === "image" && a.path);
  if (!images.length) throw new Error("贴图稿没有图片素材");
  if (images.length > 20) throw new Error(`公众号贴图一次最多 20 张（当前 ${images.length} 张）`);
  const desc = (post.body || "").trim();
  onStage({ stage: 0, progress: 100 });
  onStage({ stage: 1, progress: 10, message: `打开贴图编辑器，上传 ${images.length} 张图` });

  return ctx.runPage("wechat", { url: EDITOR_URL(8, (acct.profile as WechatProfile).sessionToken), keepOpen: true, activate: true }, async (cdp, sid) => {
    await openEditor(cdp, sid, 8, (acct.profile as WechatProfile).sessionToken);

    // mp 贴图口只吃「上传器初始化后的第一份文件」——喂过一次即失效，重新喂不再触发。
    // 所以自动传第一张，其余的留给人在编辑器里点加图（素材就是稿子的图片列表）
    onStage({ stage: 1, progress: 30, message: "上传第一张贴图" });
    await setFileInput(cdp, sid, `(f.accept || "").indexOf("bmp") >= 0`, [images[0]!.path!]);
    await waitForJs(
      cdp,
      sid,
      `document.querySelectorAll("img[src*='mmbiz.qpic.cn']").length >= 1`,
      { timeoutMs: 180_000, intervalMs: 2500, label: "贴图上传" },
    );
    onStage({ stage: 1, progress: 100, message: images.length > 1 ? "第 1 张已上传" : "贴图就绪" });

    onStage({ stage: 2, progress: 40, message: "填充描述与标题" });
    if (post.title) await fillTextarea(cdp, sid, "textarea#title", post.title.slice(0, 64));
    if (desc) {
      await pasteIntoProseMirror(
        cdp,
        sid,
        `(roots) => roots.filter((e) => e.offsetHeight > 100).sort((a, b) => b.offsetHeight - a.offsetHeight)[0] || null`,
        `<p>${desc.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n{2,}/g, "</p><p>")}</p>`,
        desc,
      );
    }
    ctx.log("wechat.image.filled", { images: images.length });
    onStage({
      stage: 3,
      progress: 100,
      message: images.length > 1
        ? `已自动插入第 1 张图，请在编辑器里把其余 ${images.length - 1} 张补上（不超过 20 张），然后自行「保存为草稿」或「发表」`
        : "请在浏览器里检查后自行「保存为草稿」或「发表」，然后回工作台标记完成",
    });
    return { url: null, needsManualConfirm: true };
  });
}

/* ---------- 视频（createType=5）：标题/摘要/正文与本地视频自动填入。
   最终保存/发表仍留在人工确认；封面和平台侧检查必须由用户负责。 */
async function publishVideo({ post, acct, ctx, onStage }: PublishArgs): Promise<PublishResult> {
  onStage({ stage: 0, progress: 30, message: "整理视频" });
  const video = post.assets.find((a) => a.kind === "video" && a.path);
  if (!video) throw new Error("视频稿没有视频素材");
  const title = (post.title || "未命名").slice(0, 64);
  onStage({ stage: 0, progress: 100 });
  onStage({ stage: 1, progress: 20, message: "打开公众号视频上传页" });

  /* 公众号的“本地上传”会另开独立视频素材页；编辑器弹窗里没有可复用的 video input。
     直接进入该页注入文件，避免在旧弹窗里找不存在的输入。 */
  return ctx.runPage("wechat", { url: VIDEO_UPLOAD_URL((acct.profile as WechatProfile).sessionToken), keepOpen: true, activate: true }, async (cdp, sid) => {
    await waitForJs(
      cdp,
      sid,
      `(() => {
        const input = document.querySelector('input.weui-desktop-upload-input[name="vid"][accept*="video"]');
        const titleInput = document.querySelector('input.weui-desktop-form__input[name="title"]');
        return !!input && input.offsetHeight > 0 && !!titleInput && titleInput.offsetHeight > 0;
      })()`,
      { timeoutMs: 60_000, intervalMs: 1500, label: "公众号视频上传页" },
    );
    onStage({ stage: 1, progress: 50, message: "注入视频文件" });
    await setFileInput(cdp, sid, `(f.accept || "").includes("video")`, [video.path]);
    await waitForJs(
      cdp,
      sid,
      `document.querySelector('input.weui-desktop-upload-input[name="vid"]')?.files?.length === 1`,
      { timeoutMs: 30_000, intervalMs: 1000, label: "视频文件进入上传控件" },
    );
    ctx.log("wechat.video.attached", { asset: video.id, filePath: video.path });

    onStage({ stage: 2, progress: 70, message: "填充素材标题" });
    const titleOk = await evaluateScalar<boolean>(
      cdp,
      sid,
      `(() => {
        const input = document.querySelector('input.weui-desktop-form__input[name="title"]');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, ${JSON.stringify(title)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return input.value === ${JSON.stringify(title)};
      })()`,
      { timeoutMs: 10_000 },
    );
    if (!titleOk) throw new Error("未找到公众号视频素材标题输入框（页面结构可能变更）");
    ctx.log("wechat.video.material-filled", { asset: video.id, title });

    onStage({ stage: 3, progress: 100, message: "视频与标题已准备；请设置封面、勾选协议并保存/发表，回工作台回填结果" });
    return { url: null, needsManualConfirm: true };
  });
}

async function publishAudio({ post, acct, ctx, onStage }: PublishArgs): Promise<PublishResult> {
  onStage({ stage: 0, progress: 30, message: "整理音频" });
  const audio = post.assets.find((a) => a.kind === "audio" && a.path);
  if (!audio) throw new Error("音频稿没有音频素材");
  const desc = (post.body || "").trim();
  onStage({ stage: 0, progress: 100 });
  onStage({ stage: 1, progress: 10, message: "打开播客编辑器" });

  return ctx.runPage("wechat", { url: EDITOR_URL(7, (acct.profile as WechatProfile).sessionToken), keepOpen: true, activate: true }, async (cdp, sid) => {
    await openEditor(cdp, sid, 7, (acct.profile as WechatProfile).sessionToken);

    onStage({ stage: 1, progress: 30, message: "上传音频到素材库" });
    const upload = await uploadWechatMaterial(cdp, sid, audio.path!, { accountId: uploadAccountId(acct), scene: 4, assets: ctx.assets });
    const fname = upload.filename;
    ctx.log("wechat.audio.uploaded", { fname, materialId: upload.id, cached: upload.cached });

    onStage({ stage: 1, progress: 60, message: "打开「插入音频」弹窗" });
    await evaluateScalar(
      cdp,
      sid,
      `(async () => {
        const visible = () => {
          const d = document.querySelector(".audio_music_dialog_content");
          return !!d && d.offsetHeight > 0;
        };
        for (let round = 0; round < 2 && !visible(); round++) {
          let a = document.querySelector("a.audio_cover_empty.js_replace_media");
          if (!a || a.offsetHeight === 0) {
            // 兜底：工具栏「音频 → 音频」插入入口
            const item = document.querySelector("li.js_insertaudio");
            if (item) item.click();
            await new Promise((r) => setTimeout(r, 1200));
            a = document.querySelector("a.audio_cover_empty.js_replace_media, .js_replace_media");
          }
          if (a) { a.click(); await new Promise((r) => setTimeout(r, 2500)); }
        }
        return visible();
      })()`,
      { timeoutMs: 30_000 },
    );

    onStage({ stage: 1, progress: 80, message: "在素材库列表勾选刚上传的音频" });
    // 等列表加载出条目（含刚上传的；服务端数据，弹窗打开即含最新素材）。
    // 文件名过长时列表会截断显示，勾选时按文件名找、找不到就取第一条（列表按时间倒序）
    await waitForJs(
      cdp,
      sid,
      `(() => {
        const dlg = document.querySelector(".audio_music_dialog_content");
        return !!dlg && dlg.querySelectorAll(".audio_item_wrp, .frm_checkbox_label.audio_item").length > 0;
      })()`,
      { timeoutMs: 90_000, intervalMs: 2000, label: "素材库列表加载" },
    );
    // 勾选该项：勾选框是隐藏的，点 label 中心会落在「试听」按钮上 —— 直接点 checkbox 本体
    await evaluateScalar(
      cdp,
      sid,
      `(async () => {
        const dlg = document.querySelector(".audio_music_dialog_content");
        const items = Array.from((dlg || document).querySelectorAll(".audio_item_wrp"));
        const fname = ${JSON.stringify(fname)};
        const hit = items.find((e) => (e.textContent || "").indexOf(fname) >= 0)
          || items.find((e) => (e.textContent || "").indexOf(fname.slice(-16)) >= 0)
          || items[0];
        if (!hit) return "no-item";
        const cb = hit.querySelector("input[type=checkbox]");
        if (cb) { cb.click(); await new Promise((r) => setTimeout(r, 1000)); return "checked:" + cb.checked; }
        hit.click();
        await new Promise((r) => setTimeout(r, 1000));
        return "clicked-label";
      })()`,
      { timeoutMs: 15_000 },
    );
    await waitForJs(
      cdp,
      sid,
      `(() => {
        const dlg = document.querySelector(".audio_music_dialog_content");
        if (dlg && dlg.querySelector("input[type=checkbox]:checked")) return true;
        return /已选择\\s*1\\s*\\/\\s*1\\s*个音频/.test(document.body.innerText || "");
      })()`,
      { timeoutMs: 30_000, intervalMs: 1500, label: "音频勾选" },
    );
    await evaluateScalar(
      cdp,
      sid,
      `(async () => {
        const btn = Array.from(document.querySelectorAll("button, .weui-desktop-btn"))
          .find((b) => b.offsetHeight > 0 && ["插入", "确定"].includes((b.textContent || "").trim()));
        if (btn) { btn.click(); await new Promise((r) => setTimeout(r, 1500)); }
        return !!btn;
      })()`,
      { timeoutMs: 15_000 },
    );
    onStage({ stage: 1, progress: 100, message: "音频已插入" });

    onStage({ stage: 2, progress: 40, message: "填充标题与正文" });
    if (!(await fillTextarea(cdp, sid, "textarea#title", (post.title || "未命名").slice(0, 64)))) {
      throw new Error("未找到公众号标题输入框（页面结构可能变更）");
    }
    if (desc) {
      await pasteIntoProseMirror(
        cdp,
        sid,
        `(roots) => roots.filter((e) => e.offsetHeight > 80).sort((a, b) => b.offsetHeight - a.offsetHeight)[0] || null`,
        `<p>${desc.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n{2,}/g, "</p><p>")}</p>`,
        desc,
      );
    }
    ctx.log("wechat.audio.filled", { asset: audio.id, fname });
    onStage({ stage: 3, progress: 100, message: "请在浏览器里检查封面后自行「保存为草稿」或「发表」，然后回工作台标记完成" });
    return { url: null, needsManualConfirm: true };
  });
}
