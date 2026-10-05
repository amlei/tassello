/* @tassello/platform-x —— X 帖子 CDP 通道（使用当前浏览器登录态）
 *
 * 范围：普通帖子（想法）与最多 4 张图片；intent=auto 自动点 Post，intent=draft 填完停住。
 * X Articles 是独立 Premium 编辑器，DOM/API 未验证前显式不支持，不做假发布。
 */
import { z } from "zod";
import type {
  AdapterPublishOptions,
  AdapterCtx,
  PlatformAdapter,
  PostDraft,
  PublishResult,
  StageReporter,
} from "@tassello/platform-core";
import { getPlatformMeta } from "@tassello/platform-core";
import { evaluateScalar } from "@tassello/cdp";
import type { CdpLike } from "@tassello/platform-core";

type CdpConnection = CdpLike;

const X_FILE_INPUT_SELECTOR =
  'input[type="file"][accept*="video"], [data-testid="fileInput"], input[type="file"]';

export const X_COMPOSE_URL = "https://x.com/compose/post";

export const xProfileSchema = z.object({
  handle: z.string().min(1).optional(),
  avatarUrl: z.string().optional(),
});
export type XProfile = z.infer<typeof xProfileSchema>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** X 没有独立标题位：标题为正文首块，发布行为与 baoyu 的 regular post 一致。 */
export function composeXText(title: string, body: string): string {
  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  return cleanTitle && cleanBody && !cleanBody.startsWith(cleanTitle)
    ? `${cleanTitle}\n\n${cleanBody}`
    : cleanBody || cleanTitle;
}

async function waitForComposer(cdp: CdpConnection, sessionId: string, timeoutMs = 30_000): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    try {
      const ready = await evaluateScalar<boolean>(
        cdp,
        sessionId,
        `!!document.querySelector('[data-testid="tweetTextarea_0"]')`,
        { timeoutMs: 5_000 },
      );
      if (ready) return true;
    } catch {}
    if (Date.now() - start > timeoutMs) return false;
    await sleep(1_000);
  }
}

async function waitForLoginState(
  cdp: CdpConnection,
  sessionId: string,
  timeoutMs = 30_000,
): Promise<{ loggedIn: boolean; handle: string | null; avatarUrl: string | null }> {
  const start = Date.now();
  for (;;) {
    try {
      const state = await evaluateScalar<{ loggedIn: boolean; handle: string | null; avatarUrl: string | null }>(
        cdp,
        sessionId,
        `JSON.parse(JSON.stringify((() => {
          const button = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
          const avatarContainer = document.querySelector('[data-testid^="UserAvatar-Container-"]');
          const avatar = button?.querySelector("img")?.getAttribute("src") || null;
          const rawHandle = avatarContainer?.getAttribute("data-testid")?.slice("UserAvatar-Container-".length) || "";
          const handle = rawHandle || null;
          return {
            loggedIn: !!document.querySelector('[data-testid="tweetTextarea_0"], [data-testid="tweetButtonInline"], [data-testid="SideNav_AccountSwitcher_Button"]'),
            handle,
            avatarUrl: avatar,
          };
        })()))`,
        { timeoutMs: 5_000 },
      );
      if (state.loggedIn) return state;
      // 登录页不需要等满 30 秒：直接失败，让 acquireAccount 打开登录页兜底。
      if (await evaluateScalar<boolean>(
        cdp,
        sessionId,
        `location.pathname === "/login" || location.pathname === "/i/flow/login"`,
        { timeoutMs: 5_000 },
      )) return state;
    } catch {}
    if (Date.now() - start > timeoutMs) {
      return { loggedIn: false, handle: null, avatarUrl: null };
    }
    await sleep(1_000);
  }
}

async function attachMedia(
  cdp: CdpConnection,
  sessionId: string,
  paths: string[],
): Promise<void> {
  await cdp.send("DOM.enable", {}, { sessionId });
  const doc = await cdp.send<{ root?: { nodeId?: number } }>("DOM.getDocument", {}, { sessionId });
  const found = await cdp.send<{ nodeIds?: number[] }>(
    "DOM.querySelector",
    { nodeId: doc.root?.nodeId, selector: X_FILE_INPUT_SELECTOR },
    { sessionId },
  ) as { nodeId?: number };
  if (!found.nodeId) throw new Error("未找到 X 图片上传入口（页面结构可能变更）");
  await cdp.send("DOM.setFileInputFiles", { files: paths, nodeId: found.nodeId }, { sessionId });
}

function mediaReadyExpression(kind: "images" | "video", imageCount: number): string {
  if (kind === "video") {
    return `!!document.querySelector('[data-testid="attachments"] video, [data-testid="videoPlayer"]')`;
  }
  return `document.querySelectorAll('[data-testid="attachments"] img').length >= ${imageCount}`;
}

async function composerText(cdp: CdpConnection, sessionId: string): Promise<string> {
  return await evaluateScalar<string>(
    cdp,
    sessionId,
    `document.querySelector('[data-testid^="tweetTextarea"]')?.textContent || ""`,
    { timeoutMs: 5_000 },
  );
}

async function latestOwnPostUrl(cdp: CdpConnection, sessionId: string, handle: string | null): Promise<string | null> {
  const handleSuffix = handle ? ` && m[1].toLowerCase() === ${JSON.stringify(handle.toLowerCase())}` : "";
  return await evaluateScalar<string | null>(
    cdp,
    sessionId,
    `JSON.parse(JSON.stringify((() => {
      for (const cell of document.querySelectorAll('[data-testid="cellInnerDiv"]')) {
        for (const a of cell.querySelectorAll('a[href*="/status/"]')) {
          const m = a.pathname.match(/^\\/([^/]+)\\/status\\/(\\d+)/);
          if (m && m[2]${handleSuffix}) return a.href;
        }
      }
      return null;
    })())`,
    { timeoutMs: 5_000 },
  );
}

export const xAdapter: PlatformAdapter<XProfile> = {
  meta: getPlatformMeta("x")!,

  account: {
    profileSchema: xProfileSchema,

    async verify(_acct, ctx) {
      ctx.log("x.verify.start");
      try {
        const state = await ctx.runPage(
          "x",
          { url: "https://x.com/home", keepOpen: false, activate: false },
          async (cdp, sid) => await waitForLoginState(cdp, sid),
        );
        if (!state.loggedIn) {
          return { state: "fail", failReason: "X 登录态已失效，请导入浏览器登录态或在应用浏览器登录 x.com" };
        }
        const profile = {
          ...(state.handle ? { handle: state.handle } : {}),
          ...(state.avatarUrl ? { avatarUrl: state.avatarUrl } : {}),
        };
        ctx.log("x.verify.ok", { handle: state.handle ?? null });
        return {
          state: "ok",
          profile,
          name: state.handle ? `@${state.handle}` : null,
          uid: state.handle ?? null,
          avatarUrl: state.avatarUrl,
        };
      } catch (e) {
        return { state: "fail", failReason: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  async publish(
    post: PostDraft,
    _acct,
    ctx: AdapterCtx,
    onStage: StageReporter,
    options?: AdapterPublishOptions,
  ): Promise<PublishResult> {
    const intent = post.type === "video" ? "draft" : options?.intent ?? "auto";
    if (options?.channel === "article") {
      throw new Error("X Articles 编辑器未接入；当前只支持普通帖子（想法）");
    }
    if (post.type === "audio") throw new Error("X 音频发布本期未实现");

    const content = composeXText(post.title || "", post.body || "");
    const video = post.assets.find((asset) => asset.kind === "video" && asset.path);
    const images = post.assets.filter((asset) => asset.kind === "image" && asset.path);
    if (images.length > 4) throw new Error(`X 单帖最多 4 张图片，当前 ${images.length} 张`);
    if (video && images.length) throw new Error("X 单帖视频与图片不能混用，请分开建稿");
    if (!content && !images.length && !video) throw new Error("X 帖子需要正文、图片或视频");
    if (post.type === "video" && !video) throw new Error("X 视频帖需要视频素材");

    ctx.log("x.publish.start", {
      intent,
      chars: content.length,
      images: video ? 0 : images.length,
      video: video?.path ?? null,
    });
    onStage({ stage: 0, progress: 100, message: "打开 X composer" });

    return await ctx.runPage("x", {
      url: X_COMPOSE_URL,
      keepOpen: intent === "draft",
      activate: true,
    }, async (cdp, sessionId) => {
      if (!(await waitForComposer(cdp, sessionId))) {
        throw new Error("未加载 X 发帖框；请确认当前 Chrome 已登录 x.com");
      }

      const mediaPaths = video ? [video.path] : images.map((image) => image.path);
      if (mediaPaths.length) {
        const label = video ? "视频" : `${images.length} 张图片`;
        onStage({ stage: 1, progress: 50, message: `上传 ${label}` });
        await attachMedia(cdp, sessionId, mediaPaths);
        // 等 composer 的媒体预览出现且 Post 按钮不再因上传禁用；避免文字先填好后把失败上传静默发出去。
        const start = Date.now();
        for (;;) {
          const ready = await evaluateScalar<boolean>(
            cdp,
            sessionId,
            `(() => { const b=document.querySelector('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'); return !!b && b.getAttribute('aria-disabled') !== 'true' && !b.disabled && (${mediaReadyExpression(video ? "video" : "images", images.length)}); })()`,
            { timeoutMs: 8_000 },
          ).catch(() => false);
          if (ready) break;
          if (Date.now() - start > 180_000) throw new Error(`X ${label}上传未完成`);
          await sleep(1_500);
        }
      } else {
        onStage({ stage: 1, progress: 100, message: "无附件" });
      }

      if (content) {
        onStage({ stage: 2, progress: 30, message: "填充帖子正文" });
        const focused = await evaluateScalar<boolean>(
          cdp,
          sessionId,
          `(() => { const el=document.querySelector('[data-testid="tweetTextarea_0"]'); if(!el) return false; el.focus(); return document.activeElement===el; })()`,
          { timeoutMs: 10_000 },
        );
        if (!focused) throw new Error("无法聚焦 X 帖子编辑器");
        await cdp.send("Input.insertText", { text: content }, { sessionId });
        onStage({ stage: 2, progress: 100, message: "正文已填充" });
      } else {
        onStage({ stage: 2, progress: 100, message: "无正文" });
      }

      const filled = (await composerText(cdp, sessionId)).trim();
      if (content && !filled) throw new Error("X 编辑器拒绝了正文填充");

      if (intent === "draft") {
        ctx.log("x.publish.draft");
        onStage({ stage: 3, progress: 100, message: "X composer 已填充；请检查后手动发布" });
        return { url: X_COMPOSE_URL, needsManualConfirm: true };
      }

      onStage({ stage: 3, progress: 40, message: "点击 Post" });
      const clicked = await evaluateScalar<boolean>(
        cdp,
        sessionId,
        `(() => { const b=document.querySelector('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'); if(!b||b.getAttribute('aria-disabled')==='true'||b.disabled) return false; b.click(); return true; })()`,
        { timeoutMs: 10_000 },
      );
      if (!clicked) throw new Error("X Post 按钮不可用");

      const start = Date.now();
      let receiptUrl: string | null = null;
      for (;;) {
        const closed = await evaluateScalar<boolean>(
          cdp,
          sessionId,
          `!document.querySelector('[data-testid="tweetTextarea_0"]')`,
          { timeoutMs: 8_000 },
        ).catch(() => false);
        if (closed) {
          // composer 关闭只是提交信号；timeline 里短暂尝试找当前用户的 status 回执。
          await sleep(3_000);
          receiptUrl = await latestOwnPostUrl(cdp, sessionId, _acct?.profile?.handle ?? null).catch(() => null);
          break;
        }
        if (Date.now() - start > 60_000) {
          ctx.log("x.publish.manual", {});
          onStage({ stage: 3, progress: 100, message: "发送未确认；请在 X 页面手动点击 Post" });
          return { url: X_COMPOSE_URL, needsManualConfirm: true };
        }
        await sleep(1_500);
      }

      ctx.log("x.publish.ok");
      onStage({ stage: 3, progress: 100, message: "X 帖子已发送" });
      return { url: receiptUrl, needsManualConfirm: false, receipt: receiptUrl ? { url: receiptUrl } : undefined };
    });
  },
};
