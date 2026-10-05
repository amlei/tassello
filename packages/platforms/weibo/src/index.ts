/* @tassello/platform-weibo —— 微博适配器：CDP 通道（真实浏览器填充 + 人工确认） */
import { z } from "zod";
import type { PlatformAdapter, PostDraft, AdapterCtx, StageReporter, PublishResult } from "@tassello/platform-core";
import type { CdpLike } from "@tassello/platform-core";

type CdpConnection = CdpLike;
import { getPlatformMeta } from "@tassello/platform-core";
import { evaluateScalar } from "@tassello/cdp";

export const weiboProfileSchema = z.object({
  uid: z.string(),
  screenName: z.string().nullable().optional(),
  verified: z.boolean().nullable().optional(),
  verifiedType: z.number().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  profileUrl: z.string().nullable().optional(),
});
export type WeiboProfile = z.infer<typeof weiboProfileSchema>;

/** 微博话题是双 # 包裹（#话题#）：编辑器里单 # 书写，发布时自动补全 */
export function weiboWrapTopics(text: string): string {
  return text.replace(/#([^#\s，。！？；：,.!?;:]+)(?!#)/g, "#$1#");
}

const WEIBO_HOME = "https://weibo.com";
const WEIBO_ARTICLE_EDITOR = "https://card.weibo.com/article/v5/editor#/draft";

/** 页内拉取登录用户的资料（全部标量返回，遵守 evaluateScalar 铁律） */
const VERIFY_JS = `(async () => {
  const uid = (window.$CONFIG && window.$CONFIG.uid) || null;
  if (!uid) return { loggedIn: false };
  try {
    const r = await fetch("/ajax/profile/info?uid=" + uid, { credentials: "include" });
    const j = await r.json();
    const u = (j && j.data && j.data.user) || {};
    return {
      loggedIn: true,
      uid: String(uid),
      screenName: u.screen_name || null,
      verified: !!u.verified,
      verifiedType: (typeof u.verified_type === "number") ? u.verified_type : null,
      avatarUrl: u.profile_image_url || null,
      profileUrl: u.profile_url || null,
    };
  } catch (e) {
    return { loggedIn: true, uid: String(uid), fetchError: String(e) };
  }
})()`;

type VerifyJsResult = {
  loggedIn: boolean;
  uid?: string;
  screenName?: string | null;
  verified?: boolean;
  verifiedType?: number | null;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  fetchError?: string;
};

/** 等媒体上传结束：微博视频没有稳定进度 DOM，只能用明确的平台文案 + 发送键状态判断 */
async function waitForWeiboMediaReady(
  cdp: CdpLike,
  sessionId: string,
  video: boolean,
  onStage: StageReporter,
): Promise<void> {
  if (!video) return;
  const start = Date.now();
  for (;;) {
    const state = await evaluateScalar<{ busy: boolean; failed: boolean; sendDisabled: boolean; sample: string }>(
      cdp,
      sessionId,
      `(() => {
        const text = (document.body && document.body.innerText) || "";
        const btns = Array.from(document.querySelectorAll("button, [role=button]"));
        const send = btns.find((b) => ["发送", "发微博"].includes((b.textContent || "").trim()));
        const failed = /上传失败|处理失败|转码失败/.test(text);
        const busy = /上传中|正在上传|转码中|处理中|剩余时间/.test(text);
        return JSON.parse(JSON.stringify({
          busy,
          failed,
          sendDisabled: !!send && (send.disabled || send.getAttribute("aria-disabled") === "true"),
          sample: text.slice(0, 300),
        }));
      })()`,
      { timeoutMs: 8_000 },
    ).catch(() => ({ busy: true, failed: false, sendDisabled: true, sample: "" }));

    if (state.failed) throw new Error(`微博媒体处理失败：${state.sample || "页面未给出原因"}`);
    if (!state.busy && !state.sendDisabled) {
      return;
    }
    if (Date.now() - start > 600_000) throw new Error("微博视频上传/转码超时（10 分钟）");
    onStage({ stage: 1, progress: 80, message: "等待微博视频上传完成" });
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

/** 等首页就绪：$CONFIG 出现 = 已登录；被踢到 passport = 未登录 */
async function waitForWeiboReady(
  cdp: { send: <R = unknown>(method: string, params?: Record<string, unknown>, opts?: { sessionId?: string }) => Promise<R> },
  sessionId: string,
  timeoutMs = 25_000,
): Promise<{ ready: boolean; onPassport: boolean }> {
  const start = Date.now();
  for (;;) {
    try {
      const s = await evaluateScalar<{ ready: boolean; onPassport: boolean }>(
        cdp,
        sessionId,
        `JSON.parse(JSON.stringify({
          ready: !!(window.$CONFIG && window.$CONFIG.uid),
          onPassport: location.host.indexOf("passport") >= 0,
        }))`,
        { timeoutMs: 5_000 },
      );
      if (s.ready || s.onPassport) return s;
    } catch {}
    if (Date.now() - start > timeoutMs) return { ready: false, onPassport: false };
    await new Promise((r) => setTimeout(r, 1200));
  }
}

export const weiboAdapter: PlatformAdapter<WeiboProfile> = {
  meta: getPlatformMeta("weibo")!,

  account: {
    profileSchema: weiboProfileSchema,

    async verify(_acct, ctx) {
      ctx.log("weibo.verify.start");
      try {
        const r = await ctx.runPage("weibo", { url: WEIBO_HOME, keepOpen: false, activate: false }, async (cdp, sid) => {
          await waitForWeiboReady(cdp, sid);
          return evaluateScalar<VerifyJsResult>(cdp, sid, VERIFY_JS, { timeoutMs: 20_000 });
        });
        if (!r.loggedIn) {
          return { state: "fail", failReason: "微博登录态已失效，请重新登录" };
        }
        ctx.log("weibo.verify.ok", { uid: r.uid });
        return {
          state: "ok",
          profile: {
            uid: r.uid!,
            screenName: r.screenName ?? null,
            verified: r.verified ?? false,
            verifiedType: r.verifiedType ?? null,
            avatarUrl: r.avatarUrl ?? null,
            profileUrl: r.profileUrl ?? null,
          },
          name: r.screenName ?? null,
          uid: r.uid ?? null,
          avatarUrl: r.avatarUrl ?? null,
        };
      } catch (e) {
        return { state: "fail", failReason: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  async publish(post: PostDraft, acct, ctx: AdapterCtx, onStage: StageReporter) {
    /* 渲染排版：微博没有标题字段，正文即全部；唯一差异是话题自动补 # 闭合。 */

    // 文章走头条文章编辑器（card.weibo.com），贴图/视频/短文走首页 composer
    if (post.type === "article") return publishArticle(post, ctx, onStage);

    onStage({ stage: 0, progress: 10, message: "整理微博文本" });
    const text = weiboWrapTopics((post.body || "").trim());
    if (!text) throw new Error("微博正文为空");
    // 微博单条：视频或图片二选一，视频优先
    const videoAsset = post.assets.find((a) => a.kind === "video" && a.path);
    const imageAssets = videoAsset ? [] : post.assets.filter((a) => a.kind === "image" && a.path);
    if (!videoAsset && imageAssets.length > 18) throw new Error("微博单条最多 18 张图");
    ctx.log("weibo.publish.rendered", {
      textLen: text.length,
      images: imageAssets.length,
      video: videoAsset ? videoAsset.path : null,
    });

    onStage({ stage: 0, progress: 100 });
    onStage({ stage: 1, progress: 5, message: "打开微博编辑器" });

    const mediaPaths = videoAsset ? [videoAsset.path] : imageAssets.map((a) => a.path);

    const keepComposerOpen = post.type !== "article";
    /* 贴图是 composer state：上传 + 填充后必须停下，最终发送由用户完成。 */
    return ctx.runPage("weibo", { url: WEIBO_HOME, keepOpen: keepComposerOpen, activate: true }, async (cdp, sid) => {
      // 等页面就绪（编辑器出现才动）
      await waitForWeiboReady(cdp, sid);
      await new Promise((r) => setTimeout(r, 1500));

      if (mediaPaths.length > 0) {
        const label = videoAsset ? "视频" : `${mediaPaths.length} 张图`;
        onStage({ stage: 1, progress: 30, message: `上传${label}` });
        await attachFiles(cdp, sid, mediaPaths);
        onStage({ stage: 1, progress: 100, message: "已交给编辑器上传" });
        // 视频必须等到平台明确结束处理；固定等待会让 disabled 的发送键造成假失败。
        if (videoAsset) await new Promise((r) => setTimeout(r, 5_000));
        await waitForWeiboMediaReady(cdp, sid, !!videoAsset, onStage);
        if (!videoAsset) await new Promise((r) => setTimeout(r, 3000 + mediaPaths.length * 1500));
      } else {
        onStage({ stage: 1, progress: 100, message: "无附件" });
      }

      onStage({ stage: 2, progress: 30, message: "填充正文" });
      await fillText(cdp, sid, text);
      onStage({ stage: 2, progress: 100, message: "正文已填充" });

      if (keepComposerOpen) {
        ctx.log("weibo.publish.state.awaiting-user", { video: !!videoAsset });
        onStage({ stage: 3, progress: 100, message: `${videoAsset ? "视频" : "贴图"}已填好；请检查后点「发送」` });
        return { url: WEIBO_HOME, needsManualConfirm: true, receipt: { kind: "composer" } };
      }

      /* 仅文章会走自动发布；首页 composer 的贴图/视频都是 state 通道。 */
      throw new Error("微博贴图/视频必须人工发送（state 通道不代点发布）");
        });
  },
};

/** 把本地文件塞进首页编辑器的文件入口（微博是图片/视频共用的单一 input，CDP DOM.setFileInputFiles） */
async function attachFiles(
  cdp: CdpConnection,
  sessionId: string,
  filePaths: string[],
): Promise<void> {
  await cdp.send("DOM.enable", {}, { sessionId });
  const doc = (await cdp.send("DOM.getDocument", {}, { sessionId })) as {
    root?: { nodeId?: number };
  };
  const q = (await cdp.send(
    "DOM.querySelectorAll",
    { nodeId: doc.root?.nodeId, selector: "input[type=file]" },
    { sessionId },
  )) as { nodeIds?: number[] };
  const nodeIds = q.nodeIds ?? [];
  if (!nodeIds.length) throw new Error("未找到微博的图片上传入口（页面结构可能变更）");
  await cdp.send(
    "DOM.setFileInputFiles",
    { files: filePaths, nodeId: nodeIds[0] },
    { sessionId },
  );
}

/** 把正文填进首页编辑器：新版微博是 React 受控 textarea，要用原生 setter 才能触发框架更新 */
async function fillText(
  cdp: { send: <R = unknown>(method: string, params?: Record<string, unknown>, opts?: { sessionId?: string }) => Promise<R> },
  sessionId: string,
  text: string,
): Promise<void> {
  const ok = await evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const ta = document.querySelector('textarea[placeholder*="分享"], textarea');
      if (ta) {
        const proto = Object.getPrototypeOf(ta);
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        ta.focus();
        if (desc && desc.set) {
          desc.set.call(ta, ${JSON.stringify(text)});
        } else {
          ta.value = ${JSON.stringify(text)};
        }
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
      const editors = Array.from(document.querySelectorAll('[contenteditable="true"]'));
      const el = editors.find((e) => e.offsetHeight > 20);
      if (!el) return false;
      el.focus();
      el.textContent = ${JSON.stringify(text)};
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return true;
    })()`,
    { timeoutMs: 10_000 },
  );
  if (!ok) throw new Error("未找到微博编辑器输入框（页面结构可能变更）");
  // 验证内容真的进去了（受控组件可能吃掉 input）
  await new Promise((r) => setTimeout(r, 800));
  const filled = await evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const ta = document.querySelector('textarea');
      if (ta) return (ta.value || "").length > 0;
      const el = Array.from(document.querySelectorAll('[contenteditable="true"]')).find((e) => e.offsetHeight > 20);
      return !!(el && el.textContent && el.textContent.length > 0);
    })()`,
    { timeoutMs: 5_000 },
  );
  if (!filled) throw new Error("正文未进入微博编辑器（受控组件拒绝更新？）");
}

/** 等头条文章编辑器就绪：标题框 + ProseMirror 正文 */
async function waitForArticleEditor(
  cdp: CdpConnection,
  sessionId: string,
  timeoutMs = 25_000,
): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    try {
      const ok = await evaluateScalar<boolean>(
        cdp,
        sessionId,
        `!!document.querySelector('textarea[placeholder="请输入标题"]') && !!document.querySelector(".ProseMirror")`,
        { timeoutMs: 5_000 },
      );
      if (ok) return true;
    } catch {}
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/** 文章发布：头条文章编辑器（自动建草稿 → 标题/导语/正文粘贴 → 停在人工确认） */
async function publishArticle(
  post: PostDraft,
  ctx: AdapterCtx,
  onStage: StageReporter,
): Promise<PublishResult> {
  onStage({ stage: 0, progress: 20, message: "整理文章内容" });
  const title = post.title || "未命名";
  // 文章里 # 不是话题语法，保持编辑区原样；占位图块无法粘贴，剔除后由编辑器插图补
  const html = post.bodyHtml?.trim()
    ? post.bodyHtml.replace(/<figure[\s\S]*?<\/figure>/g, "")
    : "";
  if (!html) throw new Error("文章正文为空");
  const lead = post.body.replace(/\s+/g, " ").trim().slice(0, 120);

  onStage({ stage: 0, progress: 100 });
  onStage({ stage: 1, progress: 5, message: "打开头条文章编辑器" });

  return ctx.runPage("weibo", { url: WEIBO_ARTICLE_EDITOR, keepOpen: true, activate: true }, async (cdp, sid) => {
    if (!(await waitForArticleEditor(cdp, sid))) {
      throw new Error("文章编辑器未加载（可能未登录或页面结构变更）");
    }

    onStage({ stage: 2, progress: 30, message: "填充标题与导语" });
    await evaluateScalar<boolean>(
      cdp,
      sid,
      `(() => {
        const set = (ta, v) => {
          const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
          ta.focus();
          if (desc && desc.set) desc.set.call(ta, v); else ta.value = v;
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        };
        const title = document.querySelector('textarea[placeholder="请输入标题"]');
        const lead = document.querySelector('textarea[placeholder*="导语"]');
        if (title) set(title, ${JSON.stringify(title)});
        if (lead) set(lead, ${JSON.stringify(lead)});
        return !!title;
      })()`,
      { timeoutMs: 10_000 },
    );

    onStage({ stage: 2, progress: 60, message: "键入正文" });
    // ProseMirror 不吃合成 paste/execCommand（后台标签页 execCommand 静默失败），
    // 改用 CDP Input.insertText——走浏览器输入管线，等效真实键入
    await evaluateScalar<boolean>(
      cdp,
      sid,
      `(() => {
        const el = document.querySelector(".ProseMirror");
        if (!el) return false;
        el.focus();
        return document.activeElement === el;
      })()`,
      { timeoutMs: 10_000 },
    );
    const paras = post.body.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < paras.length; i++) {
      if (i > 0) {
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }, { sessionId: sid });
        await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, { sessionId: sid });
      }
      await cdp.send("Input.insertText", { text: paras[i]! }, { sessionId: sid });
    }
    const filled = await evaluateScalar<boolean>(
      cdp,
      sid,
      `(() => {
        const el = document.querySelector(".ProseMirror");
        return !!el && el.textContent.length > 0;
      })()`,
      { timeoutMs: 10_000 },
    );
    if (!filled) throw new Error("正文未进入文章编辑器（键入被拒绝？）");

    const draftId = await evaluateScalar<string | null>(
      cdp,
      sid,
      `(() => { const m = location.hash.match(/draft\\/(\\d+)/); return m ? m[1] : null; })()`,
      { timeoutMs: 5_000 },
    );

    onStage({ stage: 3, progress: 100, message: "草稿已建，请在编辑器里检查、点「下一步」完成发布，然后回工作台标记完成" });
    ctx.log("weibo.article.filled", { draftId });
    return {
      url: null,
      needsManualConfirm: true,
      receipt: draftId ? { draftId } : undefined,
    };
  });
}
