/* @tassello/platform-ximalaya —— 喜马拉雅适配器：CDP 通道（studio.ximalaya.com 创作中心）
 *
 * 通道选型（按「优先 API/HTTP 接口」规则真机调研，2026-10-02，证据见本包 NOTES.md）：
 * - 喜马拉雅无面向内容创作者的开放发布 API。
 * - 页面同款 HTTP 接口（studio.ximalaya.com 同源，带 cookie 即可，GET 均无需签名）：
 *   ✅ GET /api/home/userInfo —— 主播号信息（uid/nickName/logoPic），verify 主通道
 *   ✅ GET /reform-upload/album/list?page=1&pageSize=N —— 专辑列表（albumId/title/封面），写入 profile.channels
 *   ❌ 音频上传是独立分片协议：cupload.ximalaya.com /upload/file/blk（WebUploader 分块）
 *      + /upload/merge/mkfile 合并，前置还要 cupload /clamper-token/token 换 token；
 *      块参数（token/偏移）由页面 JS 生成，页面外复刻成本高且无文档 → 不接口化
 * - 结论：读接口直连（verify/专辑列表），发布回退 CDP（DOM.setFileInputFiles 喂 WebUploader
 *   file input，填标题/简介/选专辑后停在「确认发布」，needsManualConfirm: true——产品语义
 *   与 registry lands 一致：审核通过后才对外可见，发布动作留给用户）
 *
 * 真机踩坑（详见 NOTES.md §3）：
 * - /upload 页面的上传 UI 在 iframe（www.ximalaya.com/reform-upload/page/webCenter/upload）里，
 *   直接把 iframe URL 当页面打开即可（www 域与 studio 共享登录 cookie）
 * - 上传入口是 Baidu WebUploader 的隐藏 `input[type=file]`（.webuploader-element-invisible），
 *   CDP DOM.setFileInputFiles 直接可用；喂完自动分块上传，完成后进入编辑表单
 * - 标题 input（placeholder=请输入声音标题）与简介 textarea 是 React 受控组件，
 *   必须原生 value setter + input 事件，直接赋值不生效
 * - 专辑是页面记忆的「上次选择」（search-select-album-btn 按钮文本即当前专辑名），
 *   换专辑点下拉项；目标专辑不存在时中止，避免发错专辑
 * - 页面对象是 React 响应式结构 → 铁律：evaluateScalar，只允许标量/纯结构出页面
 */
import { z } from "zod";
import type { PlatformAdapter, PostDraft, AdapterCtx, StageReporter, PublishResult } from "@tassello/platform-core";
import type { CdpLike } from "@tassello/platform-core";

type CdpConnection = CdpLike;
import { getPlatformMeta } from "@tassello/platform-core";
import { evaluateScalar } from "@tassello/cdp";

/* ---------- profile：账号 + 专辑列表（账号→频道两级，本期核心新增） ---------- */

export const ximalayaChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  coverUrl: z.string().nullable().optional(),
  isFinished: z.boolean().nullable().optional(),
  isPublic: z.boolean().nullable().optional(),
});
export type XimalayaChannel = z.infer<typeof ximalayaChannelSchema>;

export const ximalayaProfileSchema = z.object({
  uid: z.string(),
  name: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  /** 主播号下的专辑列表（频道），verify 时全量刷新 */
  channels: z.array(ximalayaChannelSchema).default([]),
});
export type XimalayaProfile = z.infer<typeof ximalayaProfileSchema>;

export const XIMALAYA_STUDIO_URL = "https://studio.ximalaya.com/";
/** 上传/编辑页（studio /upload 的 iframe 本体，直接当页面打开） */
export const XIMALAYA_UPLOAD_URL = "https://www.ximalaya.com/reform-upload/page/webCenter/upload";

/* ---------- 页面同款读接口（同源 fetch，标量出页面） ---------- */

type UserInfoResp = { code?: string; data?: { uid?: number; nickName?: string; logoPic?: string } | null };
type AlbumListResp = {
  ret?: number;
  data?: {
    totalSize?: number;
    infos?: { albumId?: number; title?: string; fullCoverPath?: string; albumStatusInfo?: { isFinished?: boolean; isPublic?: boolean } }[] | null;
  } | null;
};

/** 页内 fetch JSON 的统一模板（credentials 带 cookie；只返回标量结构） */
const FETCH_JSON = (url: string) => `(async () => {
  try {
    const r = await fetch(${JSON.stringify(url)}, { credentials: "include", headers: { Accept: "application/json" } });
    let data = null;
    try { data = await r.json(); } catch {}
    return JSON.parse(JSON.stringify({ status: r.status, data }));
  } catch (e) {
    return JSON.parse(JSON.stringify({ status: 0, data: null, err: String(e) }));
  }
})()`;

/** 等登录态就绪：/api/home/userInfo 返回 uid 即认为已登录 */
async function waitForLogin(cdp: CdpConnection, sessionId: string, timeoutMs = 30_000): Promise<UserInfoResp["data"] | null> {
  const start = Date.now();
  for (;;) {
    try {
      const r = await evaluateScalar<{ status: number; data: UserInfoResp | null }>(
        cdp,
        sessionId,
        FETCH_JSON("https://studio.ximalaya.com/api/home/userInfo"),
        { timeoutMs: 10_000 },
      );
      if (r.status === 200 && r.data?.data?.uid) return r.data.data;
    } catch {}
    if (Date.now() - start > timeoutMs) return null;
    await new Promise((res) => setTimeout(res, 1_500));
  }
}

/** 拉全量专辑列表（pageSize=50 一页拿完——真机实测 pageSize=100 服务端返回 ret:-3 空列表；翻页防呆最多 5 页） */
async function fetchAlbums(cdp: CdpConnection, sessionId: string): Promise<XimalayaChannel[]> {
  const channels: XimalayaChannel[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const r = await evaluateScalar<{ status: number; data: AlbumListResp | null }>(
      cdp,
      sessionId,
      FETCH_JSON(`https://studio.ximalaya.com/reform-upload/album/list?page=${page}&pageSize=50`),
      { timeoutMs: 15_000 },
    );
    const infos = r.data?.data?.infos ?? [];
    for (const a of infos) {
      if (!a.albumId) continue;
      channels.push({
        id: String(a.albumId),
        name: a.title ?? "",
        coverUrl: a.fullCoverPath ?? null,
        isFinished: a.albumStatusInfo?.isFinished ?? null,
        isPublic: a.albumStatusInfo?.isPublic ?? null,
      });
    }
    const total = r.data?.data?.totalSize ?? 0;
    if (channels.length >= total || infos.length === 0) break;
  }
  return channels;
}

/* ---------- 发布：CDP 填表，停在「确认发布」 ---------- */

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** 把本地音频塞进 WebUploader 的隐藏 file input（DOM.setFileInputFiles） */
async function attachAudio(cdp: CdpConnection, sessionId: string, filePath: string): Promise<void> {
  await cdp.send("DOM.enable", {}, { sessionId });
  const doc = (await cdp.send("DOM.getDocument", {}, { sessionId })) as { root?: { nodeId?: number } };
  const q = (await cdp.send(
    "DOM.querySelectorAll",
    { nodeId: doc.root?.nodeId, selector: "input[type=file]" },
    { sessionId },
  )) as { nodeIds?: number[] };
  const nodeId = q.nodeIds?.[0];
  if (!nodeId) throw new Error("未找到喜马拉雅上传入口（页面结构可能变更）");
  await cdp.send("DOM.setFileInputFiles", { files: [filePath], nodeId }, { sessionId });
}

/** 等上传完成、编辑表单出现（标题 input 被预填成文件名即视为表单就绪） */
async function waitForForm(cdp: CdpConnection, sessionId: string, timeoutMs = 180_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const ok = await evaluateScalar<boolean>(
        cdp,
        sessionId,
        `(() => {
          const el = document.querySelector('input[placeholder="请输入声音标题"]');
          return !!el && !!el.value;
        })()`,
        { timeoutMs: 10_000 },
      );
      if (ok) return;
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error("喜马拉雅上传后编辑表单未出现（上传可能失败，见平台包 NOTES.md）");
    await sleep(3_000);
  }
}

/** React 受控 input/textarea 赋值：原生 value setter + input 事件 */
async function setControlValue(cdp: CdpConnection, sessionId: string, selector: string, value: string): Promise<boolean> {
  return evaluateScalar<boolean>(
    cdp,
    sessionId,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (!setter) return false;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
    { timeoutMs: 10_000 },
  );
}

/** 当前选中的专辑名（search-select-album-btn 按钮文本） */
const CURRENT_ALBUM_JS = `(() => {
  const b = Array.from(document.querySelectorAll("button")).find((x) => /search-select-album-btn/.test(String(x.className)));
  return b ? (b.textContent || "").trim() : "";
})()`;

export const ximalayaAdapter: PlatformAdapter<XimalayaProfile> = {
  meta: { ...getPlatformMeta("ximalaya")!, supports: ["audio"] },

  account: {
    profileSchema: ximalayaProfileSchema,

    async verify(_acct, ctx) {
      ctx.log("ximalaya.verify.start");
      try {
        const r = await ctx.runPage(
          "ximalaya",
          { url: XIMALAYA_STUDIO_URL, keepOpen: false, activate: false },
          async (cdp, sid) => {
            const user = await waitForLogin(cdp, sid);
            if (!user?.uid) return { user: null, channels: [] };
            const channels = await fetchAlbums(cdp, sid);
            return { user, channels };
          },
        );
        if (!r.user?.uid) {
          return { state: "fail", failReason: "喜马拉雅登录态已失效，请重新登录后同步 profile" };
        }
        ctx.log("ximalaya.verify.ok", { uid: r.user.uid, channels: r.channels.length });
        return {
          state: "ok",
          profile: {
            uid: String(r.user.uid),
            name: r.user.nickName ?? null,
            avatarUrl: r.user.logoPic ?? null,
            channels: r.channels,
          },
          name: r.user.nickName ?? null,
          uid: String(r.user.uid),
          avatarUrl: r.user.logoPic ?? null,
        };
      } catch (e) {
        return { state: "fail", failReason: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  async publish(post: PostDraft, acct, ctx: AdapterCtx, onStage: StageReporter): Promise<PublishResult> {
    // 只支持音频：PostDraft.assets 里 kind="audio" 的文件
    const audio = post.assets.find((a) => a.kind === "audio" && a.path);
    if (!audio) throw new Error("喜马拉雅只支持音频发布：PostDraft.assets 需要一个 kind=audio 的文件");

    const title = (post.title || "").trim();
    if (!title) throw new Error("喜马拉雅声音需要标题");
    const intro = (post.body || "").trim();
    // 发布目标专辑：用户选择优先；env 兜底；否则保留平台记忆的「上次选择」。
    const channels = acct?.profile?.channels ?? [];
    const albumTarget = ((post.targetChannel
      ? channels.find((c) => c.id === post.targetChannel!.id)?.name
      : undefined)
      ?? process.env.TASSELLO_XIMALAYA_ALBUM?.trim()) || "";

    ctx.log("ximalaya.publish.start", { title, audio: audio.path, albumTarget });
    onStage({ stage: 0, progress: 10, message: "打开喜马拉雅上传页" });

    const r = await ctx.runPage(
      "ximalaya",
      // visible + keepOpen：停在编辑表单，浏览器窗口留给用户检查点「确认发布」
      { url: XIMALAYA_UPLOAD_URL, keepOpen: true, activate: true },
      async (cdp, sid) => {
        const user = await waitForLogin(cdp, sid);
        if (!user?.uid) throw new Error("喜马拉雅登录态已失效，请重新登录后同步 profile");

        // 1. 喂音频文件（WebUploader 自动分块上传）
        onStage({ stage: 1, progress: 25, message: "上传音频文件" });
        await attachAudio(cdp, sid, audio.path);

        // 2. 等编辑表单
        onStage({ stage: 1, progress: 60, message: "等待上传完成" });
        await waitForForm(cdp, sid);

        // 3. 填标题 / 简介（React 受控组件，原生 setter）
        onStage({ stage: 2, progress: 80, message: "填写标题与简介" });
        const tOk = await setControlValue(cdp, sid, 'input[placeholder="请输入声音标题"]', title);
        if (!tOk) throw new Error("未找到喜马拉雅标题输入框（页面结构可能变更）");
        if (intro) await setControlValue(cdp, sid, "textarea", intro);

        // 4. 选专辑：指定了目标专辑就展开下拉点选（浮层 React 异步渲染，必须分两步求值）；
        //    否则保留平台记忆的上次选择
        const readAlbum = () =>
          evaluateScalar<string>(cdp, sid, CURRENT_ALBUM_JS, { timeoutMs: 10_000 });
        let albumName = await readAlbum();
        if (albumTarget && albumTarget !== albumName) {
          // 4a. 点按钮展开专辑下拉浮层
          const opened = await evaluateScalar<boolean>(
            cdp,
            sid,
            `(() => {
              const btn = Array.from(document.querySelectorAll("button")).find((x) =>
                /search-select-album-btn/.test(String(x.className)),
              );
              if (!btn) return false;
              btn.click();
              return true;
            })()`,
            { timeoutMs: 10_000 },
          ).catch(() => false);
          if (!opened) throw new Error("未找到喜马拉雅专辑选择按钮（页面结构可能变更）");
          await sleep(1_000);
          // 4b. 在已渲染的浮层里点目标专辑项（精确匹配文本、必须可见）
          const picked = await evaluateScalar<boolean>(
            cdp,
            sid,
            `(() => {
              const wrap = document.querySelector("[class*=select-album-wrapper]");
              const scope = wrap || document;
              const items = Array.from(scope.querySelectorAll("button, li, [class*=item], [class*=name]"))
                .filter((el) => (el.textContent || "").trim() === ${JSON.stringify(albumTarget)} && el.offsetParent !== null);
              const el = items[items.length - 1];
              if (!el) return false;
              el.click();
              return true;
            })()`,
            { timeoutMs: 10_000 },
          ).catch(() => false);
          if (!picked) throw new Error(`未找到目标专辑「${albumTarget}」（请在账号 profile.channels 里核对名称）`);
          await sleep(1_500);
          albumName = await readAlbum();
          if (albumTarget !== albumName) {
            throw new Error(`专辑切换未生效（当前：${albumName || "未知"}，目标：${albumTarget}）`);
          }
        }
        ctx.log("ximalaya.publish.form-filled", { album: albumName });
        onStage({ stage: 2, progress: 95, message: `表单已填好（专辑：${albumName || "默认"}），等待人工确认发布` });

        // 5. 不点「确认发布」——停在表单，用户在浏览器里检查并发布（审核通过才对外可见）
        return { album: albumName };
      },
    );

    ctx.log("ximalaya.publish.await-manual-confirm", { album: r.album });
    onStage({ stage: 3, progress: 100, message: "请在浏览器里检查表单并点「确认发布」" });
    return {
      url: XIMALAYA_UPLOAD_URL,
      needsManualConfirm: true,
      receipt: { album: r.album ?? "" },
    };
  },
};
