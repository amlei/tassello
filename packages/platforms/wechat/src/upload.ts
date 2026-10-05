/* 公众号素材上传：filetransfer 通道 + 平台素材引用缓存。
 * 去重身份只由平台、账号、scene、kind、内容指纹决定；文件名只是上传/素材库展示名。 */
import fs from "node:fs/promises";
import path from "node:path";
import { evaluateScalar } from "@tassello/cdp";
import type { PlatformAssetUploadStore } from "@tassello/platform-core";

export type WechatCdpClient = {
  send<R = unknown>(
    method: string,
    params?: Record<string, unknown>,
    opts?: { sessionId?: string; timeoutMs?: number },
  ): Promise<R>;
};

export type WechatUploadResult = {
  /** filetransfer 返回的素材 content id */
  id: string;
  /** 图片接口返回的 CDN 地址；音频等素材可能为空 */
  cdn: string | null;
  /** 上传或缓存记录中的素材名；音频素材库匹配使用它 */
  filename: string;
  cached: boolean;
};

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".mp3": "audio/mpeg",
};

export function wechatSourceFilename(filePath: string, fallback = "asset"): string {
  return path.basename(filePath).trim() || fallback;
}

export function wechatMime(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/** 从 mp 后台读取稳定账号标识；仅注入中心素材缓存且调用方未显式传账号时使用。 */
export async function detectWechatAccountId(
  cdp: WechatCdpClient,
  sessionId: string,
): Promise<string | null> {
  const identity = await evaluateScalar<{ userName?: string | null; uin?: string | number | null }>(
    cdp,
    sessionId,
    `(() => {
      const cd = (window.wx && window.wx.commonData && window.wx.commonData.data) || {};
      return JSON.parse(JSON.stringify({ userName: cd.user_name || null, uin: cd.uin || null }));
    })()`,
    { timeoutMs: 8_000 },
  ).catch(() => null);
  const userName = identity?.userName?.trim();
  if (userName) return userName;
  const uin = identity?.uin;
  return uin == null || `${uin}`.trim() === "" ? null : `${uin}`.trim();
}

function wechatUploadKind(scene: number): string {
  if (scene === 8) return "image";
  if (scene === 4) return "audio";
  return "material";
}

export async function uploadWechatMaterial(
  cdp: WechatCdpClient,
  sessionId: string,
  filePath: string,
  options: { accountId?: string; scene: number; assets?: PlatformAssetUploadStore },
): Promise<WechatUploadResult> {
  const filename = wechatSourceFilename(filePath);
  const mime = wechatMime(filePath);
  const kind = wechatUploadKind(options.scene);
  const scope = `filetransfer:scene-${options.scene}`;
  const assets = options.assets;

  let accountId = options.accountId?.trim() || null;
  if (assets && !accountId) accountId = await detectWechatAccountId(cdp, sessionId);
  if (assets && !accountId) throw new Error("无法识别公众号账号，素材上传去重不能继续");

  const query = accountId
    ? { accountId, assetPath: filePath, kind, scope }
    : null;
  if (assets && query) {
    const cached = await assets.find(query).catch(() => null);
    const payload = cached?.payload as { cdn?: unknown; sourceName?: unknown } | undefined;
    const cachedId = cached?.id;
    if (cachedId) {
      return {
        id: cachedId,
        cdn: typeof payload?.cdn === "string" ? payload.cdn : cached.url ?? null,
        filename: typeof payload?.sourceName === "string" && payload.sourceName ? payload.sourceName : filename,
        cached: true,
      };
    }
  }

  const content = await fs.readFile(filePath);
  const base64 = content.toString("base64");
  const uploaded = await evaluateScalar<{
    ret?: number;
    errMsg?: string;
    content?: string;
    cdn?: string | null;
    body?: string;
  }>(
    cdp,
    sessionId,
    `(async () => {
      const b64 = ${JSON.stringify(base64)};
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const fd = new FormData();
      fd.append("file", new Blob([bytes], { type: ${JSON.stringify(mime)} }), ${JSON.stringify(filename)});
      const cd = (window.wx && window.wx.commonData && window.wx.commonData.data) || {};
      const seq = Date.now();
      const url = "/cgi-bin/filetransfer?action=upload_material&f=json&scene=${options.scene}&writetype=doublewrite&groupid=1"
        + "&ticket_id=" + (cd.ticket_id || "") + "&ticket_token=" + (cd.ticket_token || "")
        + "&svr_time=" + Math.floor(seq / 1000) + "&lang=zh_CN&seq=" + seq;
      const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
      const j = await res.json().catch(() => null);
      const base = j && j.base_resp;
      if (!base) return { body: (await res.text().catch(() => ""))?.slice(0, 200) };
      return {
        ret: base.ret,
        errMsg: base.err_msg,
        content: j.content ? String(j.content) : undefined,
        cdn: j.cdn_url || (j.content && j.content.url) || null,
      };
    })()`,
    { timeoutMs: 120_000 },
  );

  if (uploaded.ret !== 0 || !uploaded.content) {
    throw new Error(`素材上传失败（${uploaded.errMsg || uploaded.body || "无响应"}）：${filename}`);
  }

  const cdn = uploaded.cdn ?? null;
  if (assets && query) {
    // 上传成功但缓存写失败时不影响本次发布；下次最多重传一次。
    await assets.save(query, {
      id: uploaded.content,
      url: cdn,
      payload: { cdn, sourceName: filename },
    }).catch(() => {});
  }

  return { id: uploaded.content, cdn, filename, cached: false };
}
