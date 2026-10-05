/* @tassello/platform-douban —— 豆瓣适配器：HTTP 接口通道（rexxar dwarf drafts，只存草稿不发布）
 *
 * 通道选型（按「优先 API/HTTP 接口」规则实测，2026-10-02）：豆瓣开放 API 早已停摆；
 * 网页编辑器（首页分享框「放大」进入的发言编辑器，可投递小组）的草稿走干净的 REST 接口，
 * 页面上下文 fetch 即可覆盖「存草稿 + 拿草稿链接」，无需操作编辑器 DOM → 采用接口通道：
 *   POST https://m.douban.com/rexxar/api/v2/dwarf/drafts   建草稿（免 ck）
 *        body: { draft_props: JSON.stringify({ title, content: { blocks, entityMap }, image_ids: [], topic_tag_ids: [], subtype: "personal" }) }
 *        → 200 { id, ... }
 *   DELETE .../dwarf/drafts?id=<id>                        删草稿（清理探针/重试时用，200）
 *   草稿链接：https://www.douban.com/topic/create?draft_id=<id>（真机验证可恢复标题+正文，
 *   编辑器带「可投递到小组 / 收到文集」，投递与发布由用户手动完成）
 *   富文本：draft_props 的 blocks 能带格式，编辑器恢复保留标题/粗/斜/删/下划线/高亮(MARK)/行内码/
 *   代码块/列表/引用/链接，atomic IMAGE 可插段落间（映射表见 html-to-blocks.ts，2026-10-05 真机验证）
 *   图片：POST https://upload.douban.com/j/group/topic/add_photo（FormData：ck / image_file /
 *   primary_color / upload_auth_token，token 读页面 __INIT_STATE__）→ { r:0, photo:{id,url,width,height} }。
 *   画廊模式（正文空）image_layout:"horizontal"；图文混排 image_layout:"vertical"，
 *   atomic block + entityMap {type:"IMAGE", data:{src,width,height,id}}。data.id 缺失时编辑器校验不过；
 *   horizontal 也必须在 content 里放图块，否则草稿恢复不出图（真机踩坑）
 *
 * 真机踩坑（docs/platforms.md §2.6）：
 * - 豆瓣 CDN 对 headless Chrome 返回空响应体（curl / visible Chrome 均正常）→ 一切页面任务
 *   2026-10-05 复测 headless 可用；旧的「必须 visible」结论不再成立。
 * - subtype：发言（可投递小组）= "personal"；日记 = "note"。tassello 只发 personal
 * - 认证走共享 cookie（dbcl2，.douban.com 域全域有效），m.douban.com 无独立登录态；
 *   rexxar /user/self 免鉴权参数时返回占位账号（id 1178175「风凌子」，状态异常），
 *   不能作为 verify 来源 → verify 读页面 __INIT_STATE__.user + ck cookie
 * - 正文体：drafts 编辑器的 blocks（key/text/type/depth/inlineStyleRanges/entityRanges/data.align）
 */
import { z } from "zod";
import type { PlatformAdapter, PostDraft, AdapterCtx, StageReporter, PublishResult } from "@tassello/platform-core";

type CdpConnection = CdpLike;
import { getPlatformMeta } from "@tassello/platform-core";
import { evaluateScalar } from "@tassello/cdp";
import { htmlToDoubanBlocks, type DoubanBlockDraft, type DoubanLinkEntity } from "./html-to-blocks";

export const doubanProfileSchema = z.object({
  uid: z.string(),
  name: z.string().nullable().optional(),
  /** 写操作 CSRF 令牌（cookie ck；建草稿实测不需要，留作后续增强） */
  ck: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
});
export type DoubanProfile = z.infer<typeof doubanProfileSchema>;

export const DOUBAN_HOME_URL = "https://www.douban.com/";
/** 草稿编辑器链接（个人发言，可投递小组；draft_id 由 publish 返回时拼接） */
export const DOUBAN_DRAFT_URL = "https://www.douban.com/topic/create?draft_id=";

type CdpLike = { send: <R = unknown>(method: string, params?: Record<string, unknown>, opts?: { sessionId?: string }) => Promise<R> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 等 www.douban.com 就绪：__INIT_STATE__.user 出现（登录态判定，接口派、不碰 DOM） */
async function waitForHomeReady(cdp: CdpLike, sessionId: string, timeoutMs = 25_000): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    try {
      const ok = await evaluateScalar<boolean>(
        cdp,
        sessionId,
        `(() => { try { const s = JSON.parse(window.__INIT_STATE__ || "null"); return !!(s && s.user && s.user.id); } catch { return false; } })()`,
        { timeoutMs: 8_000 },
      );
      if (ok) return true;
      // 未登录时 __INIT_STATE__ 缺 user；再探一次导航文案兜底
      const nav = await evaluateScalar<boolean>(
        cdp,
        sessionId,
        `(() => { const t = (document.body && document.body.innerText) || ""; return t.indexOf("的账号") >= 0 && t.indexOf("登录/注册") < 0; })()`,
        { timeoutMs: 8_000 },
      );
      if (nav) return true;
    } catch {}
    if (Date.now() - start > timeoutMs) return false;
    await sleep(1_200);
  }
}

/* ---------- 适配器 ---------- */

export const doubanAdapter: PlatformAdapter<DoubanProfile> = {
  meta: getPlatformMeta("douban")!,

  account: {
    profileSchema: doubanProfileSchema,

    async verify(_acct, ctx) {
      ctx.log("douban.verify.start");
      try {
        // 豆瓣 CDN 对 headless 返回空响应体，必须 visible
        const r = await ctx.runPage(
          "douban",
          { url: DOUBAN_HOME_URL, keepOpen: false, activate: false },
          async (cdp, sid) => {
            if (!(await waitForHomeReady(cdp, sid))) {
              return evaluateScalar<{ uid: string | null; name: string | null; ck: string | null; avatarUrl: string | null }>(
                cdp,
                sid,
                `(() => JSON.parse(JSON.stringify({ uid: null, name: null, ck: null, avatarUrl: null })))`,
                { timeoutMs: 10_000 },
              );
            }
            return evaluateScalar<{ uid: string | null; name: string | null; ck: string | null; avatarUrl: string | null }>(
              cdp,
              sid,
              `(async () => {
                let uid = null, name = null;
                try {
                  const s = JSON.parse(window.__INIT_STATE__ || "null");
                  if (s && s.user && s.user.id) { uid = String(s.user.id); name = s.user.name || null; }
                } catch {}
                if (!uid) { try { uid = String((window._GLOBAL_NAV || {}).USER_ID || "") || null; } catch {} }
                if (!name) {
                  const nav = Array.from(document.querySelectorAll("a, span")).find((e) => /的账号$/.test((e.textContent || "").trim()));
                  if (nav) name = (nav.textContent || "").trim().replace(/的账号$/, "") || null;
                }
                const m = (document.cookie || "").match(/(?:^|;\\s*)ck=([^;]+)/);
                const ck = m ? m[1] : null;
                const img = document.querySelector(".top-nav-info img, [class*=avatar] img, nav img");
                return JSON.parse(JSON.stringify({ uid, name, ck, avatarUrl: img ? img.src : null }));
              })()`,
              { timeoutMs: 15_000 },
            );
          },
        );
        if (!r.uid) {
          return { state: "fail", failReason: "豆瓣登录态已失效，请重新登录" };
        }
        ctx.log("douban.verify.ok", { uid: r.uid });
        return {
          state: "ok",
          profile: { uid: r.uid, name: r.name ?? null, ck: r.ck ?? null, avatarUrl: r.avatarUrl ?? null },
          name: r.name ?? null,
          uid: r.uid,
          avatarUrl: r.avatarUrl ?? null,
        };
      } catch (e) {
        return { state: "fail", failReason: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  async publish(post: PostDraft, acct, ctx: AdapterCtx, onStage: StageReporter) {
    onStage({ stage: 0, progress: 20, message: "整理豆瓣发言草稿" });

    const title = (post.title || "").trim();
    const body = (post.body || "").trim();
    const imageAssets = post.assets.filter((a) => a.kind === "image" && a.path);
    if (!title && !body && imageAssets.length === 0) throw new Error("豆瓣草稿需要标题、正文或图片至少一项");
    if (imageAssets.length > 18) throw new Error("豆瓣一篇最多 18 张图");
    if (post.assets.some((a) => a.kind !== "image" && a.path)) {
      throw new Error("豆瓣草稿通道仅支持文字与图片素材");
    }

    /* 形态（豆瓣编辑器规则，真机验证见 docs/platforms.md §2.6）：
     * - bodyHtml 非空 → 富文本转 blocks：标题/粗/斜/删/下划线/高亮/行内码/代码块/列表/引用/链接全保留，
     *   figure.m-fig[data-asset] 原位落图（图文混排位置保留）；转换异常或产物为空回退纯文本分段
     * - 纯文本回退：正文空 + 有图 → 画廊（horizontal）；否则图片块固定在文字前（vertical，历史语义）
     * 图片必须先经 add_photo 上传拿 photo.id，实体 data 无 id 的图编辑器校验不通过 */
    const paras = body ? body.split(/\n+/).map((s) => s.trim()).filter(Boolean) : [];
    let items: DoubanBlockDraft[] = [];
    let linkEntities: Record<string, DoubanLinkEntity> = {};
    let richSource = false;
    if (post.bodyHtml && post.bodyHtml.trim()) {
      try {
        const converted = htmlToDoubanBlocks(post.bodyHtml);
        if (converted.items.length) {
          items = converted.items;
          linkEntities = converted.entities;
          richSource = true;
        }
      } catch (e) {
        ctx.log("douban.publish.html_fallback", { err: e instanceof Error ? e.message : String(e) });
      }
    }
    if (!items.length) {
      items = paras.map((line) => ({ kind: "text" as const, type: "unstyled", depth: 0, text: line, inlineStyleRanges: [], entityRanges: [] }));
    }
    /* bodyHtml 不带 figure（旧稿/纯文本路径）时保留历史语义：图片固定在文字前 */
    if (imageAssets.length && !items.some((it) => it.kind === "image")) {
      items = [...imageAssets.map((a) => ({ kind: "image" as const, assetId: a.id })), ...items];
    }
    const isGallery = imageAssets.length > 0 && !items.some((it) => it.kind === "text");

    ctx.log("douban.publish.rendered", { titleLen: title.length, paras: paras.length, blocks: items.length, rich: richSource, images: imageAssets.length, layout: isGallery ? "horizontal" : imageAssets.length ? "vertical" : "none" });
    onStage({ stage: 0, progress: 100 });
    onStage({ stage: 1, progress: 20, message: imageAssets.length ? `上传 ${imageAssets.length} 张图` : "调用豆瓣草稿接口" });

    // 图片先查平台素材缓存；只有没有稳定远端引用的字节才带进页面上传。
    type DoubanPhoto = { id: string; url: string; width: number; height: number };
    const accountId = acct?.id || "shared";
    const uploadQuery = (asset: typeof imageAssets[number]) => ({ accountId, assetPath: asset.path, kind: "image", scope: "photo" });
    const photoRefs: (DoubanPhoto | null)[] = Array.from({ length: imageAssets.length }, () => null);
    const refByPath = new Map<string, DoubanPhoto>();
    const pending = [] as { index: number; asset: typeof imageAssets[number] }[];
    for (const [index, asset] of imageAssets.entries()) {
      const reused = refByPath.get(asset.path);
      if (reused) {
        photoRefs[index] = reused;
        continue;
      }
      const cached = ctx.assets ? await ctx.assets.find(uploadQuery(asset)) : null;
      const payload = cached?.payload as { id?: unknown; url?: unknown; width?: unknown; height?: unknown } | undefined;
      if (cached && typeof payload?.id === "string" && typeof payload?.url === "string") {
        const photo: DoubanPhoto = {
          id: payload.id,
          url: payload.url,
          width: Number(payload.width ?? 0),
          height: Number(payload.height ?? 0),
        };
        photoRefs[index] = photo;
        refByPath.set(asset.path, photo);
        ctx.log("douban.image.cache-hit", { assetId: asset.id, photoId: photo.id });
        continue;
      }
      pending.push({ index, asset });
    }
    const cachedCount = imageAssets.length - pending.length;

    const fsp = await import("node:fs/promises");
    const pendingUploads = [] as { name: string; base64: string }[];
    for (const item of pending) {
      const buf = await fsp.readFile(item.asset.path);
      pendingUploads.push({
        name: item.asset.path.split("/").pop() || `image-${item.index}.png`,
        base64: Buffer.from(buf).toString("base64"),
      });
    }

    // 接口通道：www 页面上下文 fetch（带共享 cookie），不碰编辑器 DOM
    const r = await ctx.runPage(
      "douban",
      { url: DOUBAN_HOME_URL, keepOpen: false, activate: false },
      async (cdp, sid) => {
        if (!(await waitForHomeReady(cdp, sid))) {
          throw new Error("豆瓣登录态已失效，请重新登录");
        }

        /* 只上传缓存 miss 的图片：POST upload.douban.com/j/group/topic/add_photo。 */
        if (pending.length) {
          onStage({ stage: 1, progress: 40, message: `上传图片（0/${pending.length}）` });
          const up = await evaluateScalar<{ ok: boolean; photos: DoubanPhoto[]; msg: string | null }>(
            cdp,
            sid,
            `(async () => {
              const imgs = ${JSON.stringify(pendingUploads)};
              const ck = (document.cookie.match(/(?:^|;\\s*)ck=([^;]+)/) || [])[1] || "";
              const authToken = (window.__INIT_STATE__ || {}).upload_auth_token || "";
              const photos = [];
              for (let i = 0; i < imgs.length; i++) {
                const bin = atob(imgs[i].base64);
                const bytes = new Uint8Array(bin.length);
                for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
                const fd = new FormData();
                fd.append("ck", ck);
                fd.append("image_file", new File([bytes], imgs[i].name, { type: "image/png" }));
                fd.append("primary_color", "");
                fd.append("upload_auth_token", authToken);
                const res = await fetch("https://upload.douban.com/j/group/topic/add_photo", { method: "POST", credentials: "include", body: fd });
                const j = await res.json().catch(() => null);
                if (!res.ok || !j || j.r !== 0 || !j.photo || !j.photo.id) {
                  return { ok: false, photos: [], msg: "第 " + (i + 1) + " 张图上传失败（HTTP " + res.status + "）" };
                }
                photos.push({ id: String(j.photo.id), url: String(j.photo.url || ""), width: Number(j.photo.width || 0), height: Number(j.photo.height || 0) });
              }
              return JSON.parse(JSON.stringify({ ok: true, photos, msg: null }));
            })()`,
            { timeoutMs: 180_000 },
          );
          if (!up.ok) {
            ctx.log("douban.publish.upload_fail", { msg: up.msg });
            throw new Error(up.msg || "豆瓣图片上传失败");
          }
          for (const [i, photo] of up.photos.entries()) {
            const item = pending[i]!;
            photoRefs[item.index] = photo;
            refByPath.set(item.asset.path, photo);
            await ctx.assets?.save(uploadQuery(item.asset), {
              id: photo.id,
              url: photo.url,
              payload: { id: photo.id, url: photo.url, width: photo.width, height: photo.height },
            });
          }
          onStage({ stage: 1, progress: 90, message: `图片处理完成（新上传 ${up.photos.length}，缓存 ${cachedCount}）` });
        } else if (imageAssets.length) {
          onStage({ stage: 1, progress: 90, message: `图片全部复用平台缓存（${cachedCount}）` });
        }
        /* 组 draft_props：IMAGE 实体等图片上传完才落 key；LINK 实体沿用转换器分配的 key */
        const photos = photoRefs.map((photo) => {
          if (!photo) throw new Error("豆瓣图片引用缺失");
          return photo;
        });
        const assetIndexById = new Map(imageAssets.map((a, i) => [a.id, i]));
        let keySeq = 0;
        const nextKey = () => "ts" + Date.now().toString(36) + keySeq++;
        type DraftBlock = {
          key: string; text: string; type: string; depth: number;
          inlineStyleRanges: unknown[]; entityRanges: { key: string; offset: number; length: number }[];
          data: { align: string };
        };
        const blocks: DraftBlock[] = [];
        const entityMap: Record<string, unknown> = {};
        let imgEntitySeq = 0;
        for (const item of items) {
          if (item.kind === "image") {
            const assetIndex = assetIndexById.get(item.assetId);
            if (assetIndex === undefined) continue; /* figure 引用了非图片素材（视频等）：跳过 */
            const photo = photos[assetIndex]!;
            const key = "e" + imgEntitySeq++;
            entityMap[key] = { type: "IMAGE", mutability: "IMMUTABLE", data: { src: photo.url, width: photo.width, height: photo.height, id: photo.id } };
            blocks.push({ key: nextKey(), text: " ", type: "atomic", depth: 0, inlineStyleRanges: [], entityRanges: [{ key, offset: 0, length: 1 }], data: { align: "" } });
          } else {
            blocks.push({ key: nextKey(), text: item.text, type: item.type, depth: item.depth, inlineStyleRanges: item.inlineStyleRanges, entityRanges: item.entityRanges, data: { align: "" } });
          }
        }
        Object.assign(entityMap, linkEntities);
        const draftProps = JSON.stringify({
          ...(title ? { title } : {}),
          content: { blocks, entityMap },
          image_ids: photos.map((p) => p.id),
          ...(imageAssets.length ? { image_layout: isGallery ? "horizontal" : "vertical" } : {}),
          topic_tag_ids: [],
          subtype: "personal",
        });

        return evaluateScalar<{ ok: boolean; status: number; id: string | null; msg: string | null }>(
          cdp,
          sid,
          `(async () => {
            try {
              const r = await fetch("https://m.douban.com/rexxar/api/v2/dwarf/drafts", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ draft_props: ${JSON.stringify(draftProps)} }),
              });
              const b = await r.text();
              let id = null;
              try { id = String(JSON.parse(b).id || "") || null; } catch {}
              return JSON.parse(JSON.stringify({ ok: r.ok, status: r.status, id, msg: r.ok ? null : b.slice(0, 300) }));
            } catch (e) {
              return JSON.parse(JSON.stringify({ ok: false, status: 0, id: null, msg: String(e) }));
            }
          })()`,
          { timeoutMs: 30_000 },
        );
      },
    );

    if (!r.ok || !r.id) {
      ctx.log("douban.publish.fail", { status: r.status, msg: r.msg });
      // 草稿保存失败时不要让刚拿到的 photo id 变成永久缓存；下一轮重传更安全。
      await Promise.all(imageAssets.map((asset) => ctx.assets?.forget(uploadQuery(asset)).catch(() => {})));
      throw new Error(`豆瓣草稿保存失败（HTTP ${r.status}）：${r.msg || "未知错误"}`);
    }
    const url = DOUBAN_DRAFT_URL + r.id;
    ctx.log("douban.publish.draft", { draftId: r.id, url });
    onStage({ stage: 3, progress: 100, message: `已存豆瓣草稿，去豆瓣完成投递与发布：${url}` });
    return { url, needsManualConfirm: true, receipt: { draftId: r.id } };
  },
};
