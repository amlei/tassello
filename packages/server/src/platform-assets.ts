/* platform-assets —— 平台素材上传去重仓。
 * 指纹 = platform + account + scope + kind + sha256 + byteSize + mime。
 * 只缓存“能再次引用”的远端产物；DOM file input 型上传没有稳定引用，不进入这里。 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { getPrisma } from "@tassello/db";
import type {
  PlatformAssetUploadQuery,
  PlatformAssetUploadRef,
  PlatformAssetUploadStore,
} from "@tassello/platform-core";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".mp3": "audio/mpeg",
};

type Fingerprint = { contentHash: string; byteSize: number; mime: string; sourceName: string };

function mimeForPath(assetPath: string): string {
  const ext = assetPath.slice(assetPath.lastIndexOf(".")).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** Asset.meta 里有指纹就直接复用；否则读一次字节、计算并回写。 */
async function fingerprint(query: PlatformAssetUploadQuery): Promise<Fingerprint> {
  const prisma = getPrisma();
  const sourceName = query.assetPath.split("/").pop() ?? query.assetPath;
  const mime = mimeForPath(query.assetPath);
  const asset = await prisma.asset.findFirst({
    where: { path: query.assetPath },
    orderBy: { order: "asc" },
    select: { id: true, meta: true },
  });
  if (asset) {
    try {
      const parsed = JSON.parse(asset.meta) as { sha256?: unknown; byteSize?: unknown; mime?: unknown };
      if (
        typeof parsed.sha256 === "string" && parsed.sha256 &&
        typeof parsed.byteSize === "number" && Number.isSafeInteger(parsed.byteSize) && parsed.byteSize >= 0 &&
        typeof parsed.mime === "string" && parsed.mime
      ) {
        return {
          contentHash: parsed.sha256,
          byteSize: parsed.byteSize,
          mime: parsed.mime,
          sourceName,
        };
      }
    } catch {}
  }

  const bytes = await fs.readFile(query.assetPath);
  const fp: Fingerprint = {
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    byteSize: bytes.byteLength,
    mime,
    sourceName,
  };
  if (asset) {
    let oldMeta: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(asset.meta) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) oldMeta = parsed as Record<string, unknown>;
    } catch {}
    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        meta: JSON.stringify({
          ...oldMeta,
          sha256: fp.contentHash,
          byteSize: fp.byteSize,
          mime: fp.mime,
        }),
      },
    }).catch(() => {});
  }
  return fp;
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function platformAssetStore(platformId: string): PlatformAssetUploadStore {
  const withFingerprint = async (query: PlatformAssetUploadQuery) => {
    const fp = await fingerprint(query);
    return { query: { ...query, scope: query.scope ?? "default" }, fp };
  };

  return {
    async find(query): Promise<PlatformAssetUploadRef | null> {
      const { query: normalized, fp } = await withFingerprint(query);
      const row = await getPrisma().platformAssetUpload.findUnique({
        where: {
          platformId_accountId_scope_kind_contentHash_byteSize_mime: {
            platformId,
            accountId: normalized.accountId,
            scope: normalized.scope ?? "default",
            kind: normalized.kind,
            contentHash: fp.contentHash,
            byteSize: fp.byteSize,
            mime: fp.mime,
          },
        },
      });
      if (!row || row.status !== "available") return null;
      await getPrisma().platformAssetUpload.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => {});
      return { id: row.remoteId, url: row.remoteUrl, payload: parsePayload(row.payloadJson) };
    },

    async save(query, ref): Promise<PlatformAssetUploadRef> {
      const { query: normalized, fp } = await withFingerprint(query);
      const row = await getPrisma().platformAssetUpload.upsert({
        where: {
          platformId_accountId_scope_kind_contentHash_byteSize_mime: {
            platformId,
            accountId: normalized.accountId,
            scope: normalized.scope ?? "default",
            kind: normalized.kind,
            contentHash: fp.contentHash,
            byteSize: fp.byteSize,
            mime: fp.mime,
          },
        },
        create: {
          platformId,
          accountId: normalized.accountId,
          scope: normalized.scope ?? "default",
          kind: normalized.kind,
          contentHash: fp.contentHash,
          byteSize: fp.byteSize,
          mime: fp.mime,
          sourceName: fp.sourceName,
          remoteId: ref.id,
          remoteUrl: ref.url ?? null,
          payloadJson: JSON.stringify(ref.payload ?? {}),
          uploadedAt: new Date(),
          lastUsedAt: new Date(),
        },
        update: {
          remoteId: ref.id,
          remoteUrl: ref.url ?? null,
          payloadJson: JSON.stringify(ref.payload ?? {}),
          status: "available",
          uploadedAt: new Date(),
          lastUsedAt: new Date(),
        },
      });
      return { id: row.remoteId, url: row.remoteUrl, payload: parsePayload(row.payloadJson) };
    },

    async forget(query): Promise<void> {
      const { query: normalized, fp } = await withFingerprint(query);
      await getPrisma().platformAssetUpload.deleteMany({
        where: {
          platformId,
          accountId: normalized.accountId,
          scope: normalized.scope ?? "default",
          kind: normalized.kind,
          contentHash: fp.contentHash,
          byteSize: fp.byteSize,
          mime: fp.mime,
        },
      });
    },
  };
}
