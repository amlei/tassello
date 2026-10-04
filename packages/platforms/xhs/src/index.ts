/* @tassello/platform-xhs —— 小红书适配器：CDP 通道（creator.xiaohongshu.com 创作者中心）
 *
 * 通道选型（按「优先 API/HTTP 接口」规则实测，2026-10-02）：官方开放平台是电商专用，无笔记发布 API；
 * URL 接口方面，上传链路（permit + COS PUT，页面内 `_webmsxyw` 签名）可纯接口化，但发布提交
 * `POST edith.xiaohongshu.com/web_api/sns/v2/note` 额外要求动态 `X-S-Common`（混淆闭包按请求生成，
 * 页面外不可构造，实测 406）→ 提交无法脱离页面上下文，按规则回退 CDP：
 * 提交动作由页面自身代码发起签名请求，本适配器只做一次可信点击。
 *
 * 真机验证记录（docs/platforms.md §2.1；2026-10-02 全链路自动发布通过）：
 * - 登录态与主站共享；verify 走 creator 域 `/api/galaxy/user/info`（页面上下文带 cookie fetch，无需签名、不用 DOM）
 * - 主站 REST（/api/sns/web/v1|v2/...）全部要求 x-s/x-t 签名 → 放弃，一切走 creator 域页面
 * - 发布页 tab：上传视频 / 上传图文 / 写长文；图片视频上传入口是 `input[type=file].upload-input`
 *   + CDP DOM.setFileInputFiles
 * - 标题是 `input[placeholder*="标题"]`（原生 setter）；正文是 tiptap ProseMirror
 *   （`.tiptap.ProseMirror`，focus + Input.insertText 键入）
 * - 发布按钮是自定义元素 `<xhs-publish-btn>` 的 **closed shadow DOM**（JS 摸不到），
 *   必须 DOM.getDocument({pierce:true}) + DOM.performSearch 拿「发布」文本节点坐标，
 *   再用 Input.dispatchMouseEvent 真实点击（mousePressed 必须带 buttons:1 + 按下延迟，
 *   否则点击不生效——真机踩坑）；窗口太小时按钮不渲染/被客服悬浮球遮挡，
 *   发布前先 Emulation.setDeviceMetricsOverride 放大视口
 * - 话题绑定不做自动化：insertText 的 `#话题` 在草稿里是纯文本，用户在草稿箱自己点选绑定
 * - 产品语义：一律存草稿——填好后点「暂存离开」（shadow DOM 里的草稿按钮），
 *   返回草稿入口 publish/publish?source=official（右上角草稿箱），发布由用户完成
 * - 页面对象是 Vue 响应式 Proxy → 铁律：evaluateScalar，只允许标量/纯结构出页面
 */
import { z } from "zod";
import type { PlatformAdapter, PostDraft, AdapterCtx, StageReporter, PublishResult } from "@tassello/platform-core";
import { getPlatformMeta } from "@tassello/platform-core";
import { evaluateScalar, withPage, type CdpConnection } from "@tassello/cdp";

export const xhsProfileSchema = z.object({
  userId: z.string(),
  redId: z.string().nullable().optional(),
  userName: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  permissions: z.array(z.string()).nullable().optional(),
});
export type XhsProfile = z.infer<typeof xhsProfileSchema>;

/** 笔记标题上限 20 字，正文上限 1000 字（图文/视频/播客笔记）；长文标题上限 64 字且正文不限 */
export const XHS_TITLE_LIMIT = 20;
export const XHS_TEXT_LIMIT = 1000;
export const XHS_ARTICLE_TITLE_LIMIT = 64;

export const XHS_PUBLISH_URL = "https://creator.xiaohongshu.com/publish/publish?source=official";

type CdpLike = { send: <R = unknown>(method: string, params?: Record<string, unknown>, opts?: { sessionId?: string }) => Promise<R> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 页内拉取 creator 用户信息（标量返回，遵守 evaluateScalar 铁律） */
const VERIFY_JS = `(async () => {
  try {
    const r = await fetch("/api/galaxy/user/info", { credentials: "include" });
    const j = await r.json();
    if (!j || j.code !== 0 || !j.data) return { loggedIn: false, code: (j && j.code) ?? null };
    const u = j.data;
    return {
      loggedIn: true,
      userId: String(u.userId || ""),
      redId: u.redId || null,
      userName: u.userName || null,
      avatarUrl: u.userAvatar || null,
      permissions: Array.isArray(u.permissions) ? u.permissions.map(String) : [],
    };
  } catch (e) {
    return { loggedIn: false, fetchError: String(e) };
  }
})()`;

type VerifyJsResult = {
  loggedIn: boolean;
  code?: number | null;
  userId?: string;
  redId?: string | null;
  userName?: string | null;
  avatarUrl?: string | null;
  permissions?: string[];
  fetchError?: string;
};

/** 等 creator 页面就绪：接口派（JSON），DOM 不参与判断 */
async function waitForCreatorReady(cdp: CdpLike, sessionId: string, timeoutMs = 25_000): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    try {
      const r = await evaluateScalar<VerifyJsResult>(cdp, sessionId, VERIFY_JS, { timeoutMs: 8_000 });
      if (r.loggedIn) return true;
    } catch {}
    if (Date.now() - start > timeoutMs) return false;
    await sleep(1200);
  }
}

/** 放大视口：窗口过小时发布按钮不渲染，且右下角客服悬浮球会遮挡按钮命中区 */
async function enlargeViewport(cdp: CdpLike, sessionId: string): Promise<void> {
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false },
    { sessionId },
  );
  await sleep(800);
}

/** 真实鼠标点击：mousePressed 必须带 buttons:1 且按下有延迟，否则 shadow 组件收不到 */
async function mouseClick(cdp: CdpLike, sessionId: string, x: number, y: number): Promise<void> {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y } as never, { sessionId });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, buttons: 1 } as never, { sessionId });
  await sleep(80);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 } as never, { sessionId });
}

/** 点发布页顶部的形态 tab（上传视频 / 上传图文 / 写长文） */
async function switchTab(cdp: CdpLike, sessionId: string, tabText: string): Promise<void> {
  const ok = await evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"], li, div, span'))
        .filter((el) => (el.textContent || "").trim() === ${JSON.stringify(tabText)}
          && el.offsetParent !== null
          && el.children.length <= 2);
      // 取最内层匹配（外层容器 textContent 也等于目标文本）
      const el = tabs[tabs.length - 1];
      if (!el) return false;
      el.click();
      return true;
    })()`,
    { timeoutMs: 10_000 },
  );
  if (!ok) throw new Error(`未找到「${tabText}」入口（页面结构可能变更）`);
  await sleep(1500);
}

/** 把本地文件塞进当前形态的上传入口（DOM.setFileInputFiles，入口是初始化即存在的 upload-input） */
async function attachFiles(cdp: CdpConnection, sessionId: string, filePaths: string[], which: "first" | "last" = "first"): Promise<void> {
  await cdp.send("DOM.enable", {}, { sessionId });
  const doc = (await cdp.send("DOM.getDocument", {}, { sessionId })) as { root?: { nodeId?: number } };
  const q = (await cdp.send(
    "DOM.querySelectorAll",
    { nodeId: doc.root?.nodeId, selector: "input[type=file]" },
    { sessionId },
  )) as { nodeIds?: number[] };
  const nodeIds = q.nodeIds ?? [];
  if (!nodeIds.length) throw new Error("未找到小红书上传入口（页面结构可能变更）");
  const nodeId = which === "last" ? nodeIds[nodeIds.length - 1]! : nodeIds[0]!;
  await cdp.send("DOM.setFileInputFiles", { files: filePaths, nodeId }, { sessionId });
}

/** 关首次发布的功能引导弹层（存在才点，无害） */
async function dismissFeatureGuide(cdp: CdpLike, sessionId: string): Promise<void> {
  try {
    await evaluateScalar<boolean>(
      cdp,
      sessionId,
      `(() => { const b = document.querySelector(".feature-guide__btn"); if (b) { b.click(); return true; } return false; })()`,
      { timeoutMs: 5_000 },
    );
  } catch {}
}

/** 等编辑器表单出现（上传素材后懒加载）：标题输入框可见 */
async function waitForForm(cdp: CdpLike, sessionId: string, timeoutMs = 60_000): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    try {
      const ok = await evaluateScalar<boolean>(
        cdp,
        sessionId,
        `!!document.querySelector('input[placeholder*="标题"]')`,
        { timeoutMs: 8_000 },
      );
      if (ok) return true;
    } catch {}
    if (Date.now() - start > timeoutMs) return false;
    await sleep(1500);
  }
}

/** 等素材上传完成：页面上的进度文案（上传中/百分比/转码中）消失 */
async function waitForUploadDone(cdp: CdpLike, sessionId: string, timeoutMs: number, onTick?: (msg: string) => void): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    try {
      const uploading = await evaluateScalar<boolean>(
        cdp,
        sessionId,
        `(() => { const t = (document.body && document.body.innerText) || ""; return /上传中|上传进度|转码中|\\d+%/.test(t); })()`,
        { timeoutMs: 8_000 },
      );
      if (!uploading) return true;
      if (onTick) onTick("素材上传中…");
    } catch {}
    if (Date.now() - start > timeoutMs) return false;
    await sleep(1500);
  }
}

/** 填标题（input，原生 setter 触发框架更新） */
async function fillTitle(cdp: CdpLike, sessionId: string, title: string): Promise<void> {
  const ok = await evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const el = document.querySelector('input[placeholder*="标题"]');
      if (!el || el.tagName !== "INPUT") return false;
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      el.focus();
      if (desc && desc.set) desc.set.call(el, ${JSON.stringify(title)});
      else el.value = ${JSON.stringify(title)};
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
    { timeoutMs: 10_000 },
  );
  if (!ok) throw new Error("未找到标题输入框（页面结构可能变更）");
}

/** 填正文（tiptap ProseMirror，CDP Input.insertText 走浏览器输入管线，等效真实键入）。
 *  话题绑定不做自动化：纯文本的 `#话题` 存进草稿后，由用户在草稿箱里自己点选绑定 */
async function fillBody(cdp: CdpLike, sessionId: string, text: string): Promise<void> {
  const focused = await evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const el = document.querySelector(".tiptap.ProseMirror")
        || document.querySelector(".ProseMirror[contenteditable='true']")
        || document.querySelector("#post-textarea");
      if (!el) return false;
      el.focus();
      return document.activeElement === el;
    })()`,
    { timeoutMs: 10_000 },
  );
  if (!focused) throw new Error("未找到正文编辑器（页面结构可能变更）");
  const paras = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < paras.length; i++) {
    if (i > 0) {
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }, { sessionId });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, { sessionId });
    }
    await cdp.send("Input.insertText", { text: paras[i]! }, { sessionId });
  }
  await sleep(800);
  const filled = await evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const el = document.querySelector(".tiptap.ProseMirror") || document.querySelector(".ProseMirror");
      return !!el && (el.textContent || "").length > 0;
    })()`,
    { timeoutMs: 8_000 },
  );
  if (!filled) throw new Error("正文未进入编辑器（键入被拒绝？）");
}

/**
 * 设置笔记可见范围（真实鼠标：d-select 下拉在浮层里，合成 click 点不开）。
 * TASSELLO_XHS_VISIBILITY=self 时设为「仅自己可见」，其余保持默认公开
 */
async function setVisibilitySelf(cdp: CdpLike, sessionId: string): Promise<boolean> {
  await evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => { const el = document.querySelector(".permission-card-select"); if (el) el.scrollIntoView({ block: "center" }); return !!el; })()`,
    { timeoutMs: 8_000 },
  );
  await sleep(800);
  const sel = await evaluateScalar<[number, number] | null>(
    cdp,
    sessionId,
    `(() => {
      const el = document.querySelector(".permission-card-select");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`,
    { timeoutMs: 8_000 },
  );
  if (!sel) return false;
  await mouseClick(cdp, sessionId, sel[0], sel[1]);
  await sleep(1200);
  const opt = await evaluateScalar<[number, number] | null>(
    cdp,
    sessionId,
    `(() => {
      const el = Array.from(document.querySelectorAll(".name")).find((e) => (e.textContent || "").trim() === "仅自己可见" && e.getBoundingClientRect().width > 0);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`,
    { timeoutMs: 8_000 },
  );
  if (!opt) return false;
  await mouseClick(cdp, sessionId, opt[0], opt[1]);
  await sleep(800);
  return evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const el = document.querySelector(".permission-card-select .d-select-description");
      return !!el && (el.textContent || "").trim() === "仅自己可见";
    })()`,
    { timeoutMs: 8_000 },
  );
}

/** 点最内层的可见文本元素（真机验证：D-UI 组件对合成 click 免疫的场景用；纯文本按钮 el.click() 够用） */
async function clickText(cdp: CdpLike, sessionId: string, text: string): Promise<boolean> {
  return evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const els = Array.from(document.querySelectorAll("*")).filter((e) => (e.textContent || "").trim() === ${JSON.stringify(text)}
        && e.offsetParent !== null && e.children.length <= 2);
      const el = els[els.length - 1];
      if (!el) return false;
      el.click();
      return true;
    })()`,
    { timeoutMs: 10_000 },
  );
}

/** 等页面出现指定文案（如播客上传后的「去发布」按钮） */
async function waitForText(cdp: CdpLike, sessionId: string, text: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    try {
      const has = await evaluateScalar<boolean>(
        cdp,
        sessionId,
        `(() => { const t = (document.body && document.body.innerText) || ""; return t.indexOf(${JSON.stringify(text)}) >= 0; })()`,
        { timeoutMs: 8_000 },
      );
      if (has) return true;
    } catch {}
    if (Date.now() - start > timeoutMs) return false;
    await sleep(2000);
  }
}

/**
 * 在 closed shadow DOM 里找指定文本的按钮坐标（如「暂存离开」）。
 * xhs-publish-btn 的按钮 JS 摸不到，只能 pierce 拿文本节点盒模型 + 真实鼠标点击。
 */
async function findShadowTextPoint(cdp: CdpLike, sessionId: string, text: string): Promise<[number, number]> {
  await cdp.send("DOM.enable", {}, { sessionId });
  await cdp.send("DOM.getDocument", { depth: -1, pierce: true }, { sessionId });
  const search = await cdp.send("DOM.performSearch", { query: text, includeUserAgentShadowDOM: false }, { sessionId }) as {
    searchId?: string;
    resultCount?: number;
  };
  if (search.searchId && search.resultCount) {
    const count = Math.min(search.resultCount, 20);
    for (let i = 0; i < count; i++) {
      try {
        const rr = await cdp.send("DOM.getSearchResults", { searchId: search.searchId, fromIndex: i, toIndex: i + 1 }, { sessionId }) as { nodeIds?: number[] };
        const nodeId = rr.nodeIds?.[0];
        if (!nodeId) continue;
        const node = await cdp.send("DOM.describeNode", { nodeId, depth: 0 }, { sessionId }) as { node?: { nodeName?: string; nodeValue?: string } };
        if (node.node?.nodeName !== "#text" || (node.node.nodeValue || "").trim() !== text) continue;
        const bm = await cdp.send("DOM.getBoxModel", { nodeId }, { sessionId }) as { model?: { content?: number[] } };
        const q = bm.model?.content;
        if (q && q.length >= 6) return [Math.round((q[0]! + q[4]!) / 2), Math.round((q[1]! + q[5]!) / 2)];
      } catch {}
    }
  }
  throw new Error(`未找到「${text}」按钮（页面结构可能变更）`);
}

/* ---------- 适配器 ---------- */

export const xhsAdapter: PlatformAdapter<XhsProfile> = {
  meta: getPlatformMeta("xhs")!,

  account: {
    profileSchema: xhsProfileSchema,

    async verify(_acct, ctx) {
      ctx.log("xhs.verify.start");
      try {
        const r = await withPage(
          "xhs",
          { url: XHS_PUBLISH_URL, keepOpen: false, activate: false, mode: "headless" },
          async (cdp, sid) => {
            await waitForCreatorReady(cdp, sid);
            return evaluateScalar<VerifyJsResult>(cdp, sid, VERIFY_JS, { timeoutMs: 20_000 });
          },
        );
        if (!r.loggedIn || !r.userId) {
          return { state: "fail", failReason: "小红书登录态已失效，请重新登录" };
        }
        ctx.log("xhs.verify.ok", { userId: r.userId, permissions: r.permissions?.length ?? 0 });
        return {
          state: "ok",
          profile: {
            userId: r.userId,
            redId: r.redId ?? null,
            userName: r.userName ?? null,
            avatarUrl: r.avatarUrl ?? null,
            permissions: r.permissions ?? null,
          },
          name: r.userName ?? null,
          uid: r.redId ?? r.userId,
          avatarUrl: r.avatarUrl ?? null,
        };
      } catch (e) {
        return { state: "fail", failReason: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  async publish(post: PostDraft, _acct, ctx: AdapterCtx, onStage: StageReporter) {
    onStage({ stage: 0, progress: 10, message: "整理小红书笔记" });

    const videoAsset = post.assets.find((a) => a.kind === "video" && a.path);
    const audioAsset = post.assets.find((a) => a.kind === "audio" && a.path);
    const imageAssets = videoAsset || audioAsset ? post.assets.filter((a) => a.kind === "image" && a.path) : post.assets.filter((a) => a.kind === "image" && a.path);
    if (imageAssets.length > 18) throw new Error("小红书一篇笔记最多 18 张图");

    // 形态分发：音频→播客；文章（无音视频图）→长文草稿；视频→上传视频；其余→上传图文
    const isPodcast = !!audioAsset;
    const isArticle = post.type === "article" && !videoAsset && !audioAsset && imageAssets.length === 0;
    const isVideo = !!videoAsset;
    const isImage = !isPodcast && !isArticle && !isVideo && imageAssets.length > 0;

    const titleLimit = isArticle ? XHS_ARTICLE_TITLE_LIMIT : XHS_TITLE_LIMIT;
    const title = (post.title || "未命名").trim();
    if (title.length > titleLimit) throw new Error(`标题 ${title.length} 字，超出小红书 ${titleLimit} 字上限`);
    const body = (post.body || "").trim();
    if (!body) throw new Error("小红书正文为空");
    if (!isArticle && body.length > XHS_TEXT_LIMIT) {
      throw new Error(`正文 ${body.length} 字，超出小红书笔记 ${XHS_TEXT_LIMIT} 字上限`);
    }
    if (isImage && imageAssets.length === 0) {
      throw new Error("小红书发布需要至少一张图片或一个视频（长文请把内容类型设为文章，播客请提供音频素材）");
    }
    if (isPodcast && imageAssets.length === 0) {
      throw new Error("小红书播客需要一张封面图（请给内容附带一张图片素材，推荐 1:1）");
    }

    const tabText = isPodcast ? "发播客" : isArticle ? "写长文" : isVideo ? "上传视频" : "上传图文";
    ctx.log("xhs.publish.rendered", { tab: tabText, images: imageAssets.length, video: videoAsset?.path ?? null, audio: audioAsset?.path ?? null, textLen: body.length });
    onStage({ stage: 0, progress: 100 });
    onStage({ stage: 1, progress: 5, message: `打开小红书创作者中心（${tabText}）` });

    return withPage("xhs", { url: XHS_PUBLISH_URL, keepOpen: true, activate: true }, async (cdp, sid) => {
      if (!(await waitForCreatorReady(cdp, sid))) {
        throw new Error("小红书创作者中心未就绪（可能未登录）");
      }
      // 窗口过小时发布按钮不渲染，先放大视口
      await enlargeViewport(cdp, sid);

      /* ---------- 长文：草稿模式（creator 网页端长文无发布按钮，只有「暂存离开」） ---------- */
      if (isArticle) {
        await switchTab(cdp, sid, "写长文");
        onStage({ stage: 1, progress: 50, message: "新建长文" });
        if (!(await clickText(cdp, sid, "新的创作"))) {
          throw new Error("未找到「新的创作」入口（页面结构可能变更）");
        }
        await sleep(3000);
        onStage({ stage: 2, progress: 30, message: "填充标题与正文" });
        const titleOk = await evaluateScalar<boolean>(
          cdp,
          sid,
          `(() => {
            const d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
            const t = document.querySelector('textarea[placeholder="输入标题"]');
            if (!t) return false;
            t.focus();
            if (d && d.set) d.set.call(t, ${JSON.stringify(title)}); else t.value = ${JSON.stringify(title)};
            t.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
          })()`,
          { timeoutMs: 10_000 },
        );
        if (!titleOk) throw new Error("未找到长文标题输入框（页面结构可能变更）");
        await fillBody(cdp, sid, body);
        onStage({ stage: 2, progress: 100, message: "长文已填充" });
        onStage({ stage: 3, progress: 40, message: "暂存草稿" });
        if (!(await clickText(cdp, sid, "暂存离开"))) {
          throw new Error("未找到「暂存离开」按钮（页面结构可能变更）");
        }
        const saved = await waitForText(cdp, sid, "保存成功", 15_000);
        ctx.log("xhs.publish.article.draft", { saved });
        if (!saved) throw new Error("长文草稿保存失败（未出现「保存成功」）");
        onStage({ stage: 3, progress: 100, message: `长文已存草稿，草稿入口：${XHS_PUBLISH_URL}（写长文 → 草稿箱）` });
        // 草稿存于浏览器本地（无服务端草稿链接），标签页保持打开，用户可直接继续发布
        return { url: XHS_PUBLISH_URL, needsManualConfirm: true };
      }

      await switchTab(cdp, sid, tabText);

      if (isPodcast) {
        /* ---------- 播客：上传音频 → 封面 → 去发布 → 表单（与图文同构） ---------- */
        onStage({ stage: 1, progress: 30, message: "上传音频" });
        if (!(await clickText(cdp, sid, "上传音频"))) {
          throw new Error("未找到「上传音频」入口（页面结构可能变更）");
        }
        await sleep(1500);
        await attachFiles(cdp, sid, [audioAsset!.path]);
        // 等音频处理完出现「去发布」（大文件放宽到 15 分钟）
        if (!(await waitForText(cdp, sid, "去发布", 900_000))) {
          throw new Error("音频上传后未出现「去发布」（格式/时长需 m4a/mp3/wav/flac/aac，10 分钟～2 小时）");
        }
        onStage({ stage: 1, progress: 60, message: "音频上传完成，设置封面" });
        // 封面对话框里的 upload-input 是懒创建的，取最后一个 file input
        await attachFiles(cdp, sid, [imageAssets[0]!.path], "last");
        await sleep(2500);
        // 封面裁剪确认（出现才点）
        await clickText(cdp, sid, "确定");
        await sleep(1200);
        if (!(await clickText(cdp, sid, "去发布"))) {
          throw new Error("未找到「去发布」按钮（页面结构可能变更）");
        }
        await sleep(3000);
        onStage({ stage: 1, progress: 100, message: "音频与封面就绪" });
      } else {
        /* ---------- 图文 / 视频 ---------- */
        const label = isVideo ? "视频" : `${imageAssets.length} 张图`;
        onStage({ stage: 1, progress: 30, message: `上传${label}` });
        await attachFiles(cdp, sid, isVideo ? [videoAsset!.path] : imageAssets.map((a) => a.path));
        if (!(await waitForForm(cdp, sid))) {
          throw new Error("上传后编辑器表单未出现（页面结构可能变更）");
        }
        // 等平台把素材传完（进度文案消失），大视频放宽到 10 分钟
        const done = await waitForUploadDone(cdp, sid, isVideo ? 600_000 : 180_000, (m) => onStage({ stage: 1, progress: 60, message: m }));
        onStage({ stage: 1, progress: 100, message: done ? "素材上传完成" : "素材仍在上传，先继续填充" });
      }

      await dismissFeatureGuide(cdp, sid);

      onStage({ stage: 2, progress: 30, message: "填充标题与正文" });
      await fillTitle(cdp, sid, title);
      await fillBody(cdp, sid, body);
      onStage({ stage: 2, progress: 100, message: "编辑器已填充" });

      // 测试通道：TASSELLO_XHS_VISIBILITY=self 时设为「仅自己可见」
      if (process.env.TASSELLO_XHS_VISIBILITY === "self") {
        const ok = await setVisibilitySelf(cdp, sid);
        ctx.log("xhs.publish.visibility", { self: ok });
        if (!ok) throw new Error("未能把可见范围切到「仅自己可见」（已阻止发布，避免测试内容公开）");
      }

      onStage({ stage: 3, progress: 40, message: "暂存草稿" });
      // 产品语义：小红书不自动发布，一律点「暂存离开」存草稿，给草稿入口由用户完成发布。
      // 按钮在 xhs-publish-btn 的 closed shadow DOM 里，pierce 拿坐标 + 真实鼠标点击
      const point = await findShadowTextPoint(cdp, sid, "暂存离开");
      await mouseClick(cdp, sid, point[0], point[1]);
      // 等保存反馈（toast「保存成功」或草稿箱计数出现），宽松处理
      let saved = false;
      for (let i = 0; i < 15; i++) {
        await sleep(2000);
        try {
          saved = await evaluateScalar<boolean>(
            cdp,
            sid,
            `(() => {
              const t = (document.body && document.body.innerText) || "";
              return /保存成功|已保存|草稿箱/.test(t);
            })()`,
            { timeoutMs: 8_000 },
          );
          if (saved) break;
        } catch {}
      }
      ctx.log("xhs.publish.draft", { saved });
      const draftEntry = `${XHS_PUBLISH_URL}（右上角「草稿箱」）`;
      onStage({ stage: 3, progress: 100, message: `已存草稿，草稿入口：${draftEntry}` });
      return { url: XHS_PUBLISH_URL, needsManualConfirm: true };
    });
  },
};
