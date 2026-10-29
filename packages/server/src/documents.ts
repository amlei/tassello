import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { TYPE_META, type AssetDTO, type ContentType, type PostDTO } from "@tassello/shared";
import { markdownToHtml, escAttr, markdownToPlain } from "@tassello/render";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  normalizeMediaOrder,
  updateDocument,
  type MediaRef,
  type VaultDocument,
} from "@tassello/vault";
import { createMediaToken, mediaUrl, resolveMediaToken, validateMediaFile } from "./media-token";
import { getSettings, resolveAttachmentDir, resolveVaultPath } from "./state";

export type SortKey = "recent" | "oldest" | "title" | "manual";

const MEDIA_EXT: Record<"video" | "audio" | "image", string[]> = {
  video: [".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"],
  audio: [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"],
  image: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg"],
};

function resolveMediaTarget(document: VaultDocument, media: MediaRef): string {
  if (media.source === "url") return media.resolved;
  if (media.source === "absolute") return path.resolve(media.resolved);
  return path.resolve(path.dirname(document.filePath), media.resolved);
}

function remoteAssetId(url: string): string {
  return `url-${createHash("sha256").update(url).digest("hex").slice(0, 24)}`;
}

function invalidAssetId(target: string): string {
  return `invalid-${createHash("sha256").update(target).digest("hex").slice(0, 24)}`;
}

async function mediaAssetId(media: MediaRef, resolved: string): Promise<string> {
  if (media.source === "url") return remoteAssetId(resolved);
  try {
    return await createMediaToken(resolved, media.kind);
  } catch {
    return invalidAssetId(resolved);
  }
}

async function documentAssets(document: VaultDocument): Promise<{
  assets: AssetDTO[];
  urlByTarget: Map<string, string | null>;
  idByTarget: Map<string, string>;
}> {
  const color = TYPE_META[document.type].color;
  const urlByTarget = new Map<string, string | null>();
  const idByTarget = new Map<string, string>();
  const assets = await Promise.all(document.media.map(async (media): Promise<AssetDTO> => {
    const resolved = resolveMediaTarget(document, media);
    let id: string;
    let url: string | null;
    if (media.source === "url") {
      id = remoteAssetId(resolved);
      url = resolved;
    } else {
      id = await mediaAssetId(media, resolved);
      url = id.startsWith("invalid-") ? null : mediaUrl(id);
    }
    urlByTarget.set(media.resolved, url);
    idByTarget.set(media.resolved, id);
    return { id, kind: media.kind, reference: media.resolved, path: resolved, url, color, role: media.role };
  }));
  return { assets, urlByTarget, idByTarget };
}

async function renderDocument(document: VaultDocument): Promise<{
  assets: AssetDTO[];
  html: string;
  plain: string;
}> {
  const { assets, urlByTarget, idByTarget } = await documentAssets(document);
  const color = TYPE_META[document.type].color;
  const html = markdownToHtml(document.bodyMarkdown, {
    renderImage: ({ href, alt }) => {
      const url = urlByTarget.get(href);
      const assetId = idByTarget.get(href) ?? remoteAssetId(href);
      return (
        `<figure class="m-fig" contenteditable="false" data-asset="${escAttr(assetId)}"` +
        ` data-alt="${escAttr(alt || "配图")}" data-source="${escAttr(href)}"` +
        `${url ? ` data-src="${escAttr(url)}"` : ""}>` +
        `${url ? `<img class="m-fig-img" src="${escAttr(url)}" alt="${escAttr(alt || "配图")}" draggable="false">` : ""}` +
        `<button type="button" class="m-fig-del" aria-label="移除这张图">×</button></figure>`
      );
    },
  });
  return { assets, html, plain: markdownToPlain(document.bodyMarkdown) };
}

export async function toPostDTO(document: VaultDocument): Promise<PostDTO> {
  const rendered = await renderDocument(document);
  const duration = document.options.durationSec;
  return {
    id: document.id,
    type: document.type,
    title: document.title,
    markdown: document.bodyMarkdown,
    body: rendered.plain,
    bodyHtml: rendered.html,
    filePath: document.relativePath,
    fingerprint: document.fingerprint,
    status: document.status,
    issues: document.issues,
    platforms: document.platforms,
    options: document.options,
    media: document.media,
    cover: document.cover,
    durationSec: typeof duration === "number" && Number.isFinite(duration) ? duration : null,
    updatedAt: document.updatedAt,
    manualOrder: document.manualOrder,
    assets: rendered.assets,
  };
}

export async function listPosts(opts: {
  scope?: ContentType | "all";
  query?: string;
  sort?: SortKey;
} = {}): Promise<PostDTO[]> {
  const vaultPath = await resolveVaultPath();
  const documents = await listDocuments(vaultPath, {
    type: opts.scope && opts.scope !== "all" ? opts.scope : undefined,
    query: opts.query,
    sort: opts.sort,
  });
  return Promise.all(documents.map(toPostDTO));
}

export async function getPost(id: string): Promise<PostDTO | null> {
  const document = await getDocument(await resolveVaultPath(), id);
  return document ? toPostDTO(document) : null;
}

export async function createPost(input: {
  type: ContentType;
  title?: string;
  markdown?: string;
}): Promise<PostDTO> {
  const document = await createDocument(await resolveVaultPath(), input);
  return toPostDTO(document);
}

export async function updatePost(
  id: string,
  patch: {
    title?: string;
    markdown?: string;
    cover?: string | null;
    durationSec?: number | null;
    order?: string[];
    expectedFingerprint?: string;
  },
): Promise<PostDTO | null> {
  const vaultPath = await resolveVaultPath();
  if (patch.order) {
    const all = await listDocuments(vaultPath);
    const picked = new Set(patch.order);
    const queue = [...patch.order];
    const byId = new Map(all.map((document) => [document.id, document]));
    const nextOrder = all.map((document) => (picked.has(document.id) ? byId.get(queue.shift()!)! : document));
    await Promise.all(nextOrder.map((document, index) =>
      updateDocument(vaultPath, document.id, { manualOrder: index }).catch(() => undefined),
    ));
  }
  const current = await getDocument(vaultPath, id);
  if (!current) return null;
  const options = patch.durationSec === undefined
    ? current.options
    : { ...current.options, durationSec: patch.durationSec };
  const updated = await updateDocument(vaultPath, id, {
    title: patch.title,
    markdown: patch.markdown,
    cover: patch.cover,
    options,
    expectedFingerprint: patch.expectedFingerprint,
  });
  return toPostDTO(updated);
}

export async function deletePost(id: string): Promise<void> {
  await deleteDocument(await resolveVaultPath(), id);
}

function markdownMediaTarget(document: VaultDocument, assetId: string): { media: MediaRef; absolute: string } | null {
  for (const media of document.media) {
    const absolute = resolveMediaTarget(document, media);
    if (media.source === "url") {
      if (remoteAssetId(absolute) === assetId) return { media, absolute };
    } else {
      // Token verification is async, so callers compare through the URL helper when needed.
    }
  }
  return null;
}

export async function deleteAsset(postId: string, assetId: string): Promise<void> {
  const vaultPath = await resolveVaultPath();
  const document = await getDocument(vaultPath, postId);
  if (!document) return;
  let matchedRaw: string | null = null;
  let matchedReference: string | null = null;
  for (const media of document.media) {
    const resolved = resolveMediaTarget(document, media);
    const id = await mediaAssetId(media, resolved);
    if (id === assetId) {
      matchedRaw = media.raw;
      matchedReference = media.resolved;
      break;
    }
  }
  if (!matchedRaw) return;
  const markdown = document.bodyMarkdown.replace(matchedRaw, "").replace(/\n{3,}/g, "\n\n").trimEnd();
  await updateDocument(vaultPath, postId, {
    markdown,
    ...(document.cover === matchedReference ? { cover: null } : {}),
    expectedFingerprint: document.fingerprint,
  });
}

export async function reorderAssets(postId: string, ids: string[]): Promise<void> {
  const vaultPath = await resolveVaultPath();
  const document = await getDocument(vaultPath, postId);
  if (!document) return;
  const raws = new Map<string, string>();
  for (const media of document.media) {
    const resolved = resolveMediaTarget(document, media);
    const id = await mediaAssetId(media, resolved);
    raws.set(id, media.raw);
  }
  const ordered = ids.map((id) => raws.get(id)).filter((raw): raw is string => !!raw);
  if (ordered.length !== document.media.length) return;
  let cursor = 0;
  const markdown = document.bodyMarkdown.replace(/!\[[^\]]*\]\([^)\s]+(?:\s+["'][^"']*["'])?\)/g, () => ordered[cursor++] ?? "");
  await updateDocument(vaultPath, postId, { markdown, expectedFingerprint: document.fingerprint });
}

function safeName(fileName: string): string {
  return fileName.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_").replace(/^\.+/, "") || "asset";
}

export async function setPostMedia(
  postId: string,
  kind: "video" | "audio" | "image",
  fileName: string,
  bytes: Uint8Array,
): Promise<PostDTO | null> {
  const vaultPath = await resolveVaultPath();
  const document = await getDocument(vaultPath, postId);
  if (!document) return null;
  const base = safeName(fileName);
  const ext = path.extname(base).toLowerCase();
  if (!MEDIA_EXT[kind].includes(ext)) throw new Error(`不支持的文件格式：${ext || "无扩展名"}`);
  const settings = await getSettings();
  const mediaDir = path.join(resolveAttachmentDir(vaultPath, settings.attachmentPath), postId);
  await fs.mkdir(mediaDir, { recursive: true });
  const destination = path.join(mediaDir, `${Date.now()}-${base}`);
  await fs.writeFile(destination, bytes);

  const relative = path.relative(path.dirname(document.filePath), destination).split(path.sep).join("/");
  const token = `![${kind === "image" ? "配图" : base.replace(/\.[^.]+$/, "")}](${relative})`;
  const sameKind = document.media.find((media) => media.kind === kind);
  let markdown = document.bodyMarkdown;
  if (kind !== "image" && sameKind) markdown = markdown.replace(sameKind.raw, token);
  else markdown = `${markdown.trimEnd()}\n\n${token}`.trim();
  const updated = await updateDocument(vaultPath, postId, {
    markdown,
    options: { ...document.options, durationSec: null },
    expectedFingerprint: document.fingerprint,
  });
  return toPostDTO(updated);
}

export async function setPostCover(
  postId: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<PostDTO | null> {
  const vaultPath = await resolveVaultPath();
  const document = await getDocument(vaultPath, postId);
  if (!document) return null;
  const base = safeName(fileName);
  const ext = path.extname(base).toLowerCase();
  if (!MEDIA_EXT.image.includes(ext)) throw new Error(`不支持的文件格式：${ext || "无扩展名"}`);
  const settings = await getSettings();
  const mediaDir = path.join(resolveAttachmentDir(vaultPath, settings.attachmentPath), postId);
  await fs.mkdir(mediaDir, { recursive: true });
  const destination = path.join(mediaDir, `${Date.now()}-cover-${base}`);
  await fs.writeFile(destination, bytes);
  const relative = path.relative(path.dirname(document.filePath), destination).split(path.sep).join("/");
  const updated = await updateDocument(vaultPath, postId, {
    cover: relative,
    expectedFingerprint: document.fingerprint,
  });
  return toPostDTO(updated);
}

export async function readAssetMetadata(
  assetId: string,
): Promise<{ ext: string; totalSize: number } | null> {
  const absolute = await resolveMediaToken(assetId);
  if (!absolute) return null;
  try {
    const media = await validateMediaFile(absolute);
    return { ext: media.ext, totalSize: media.size };
  } catch {
    return null;
  }
}

export async function readAssetFileRange(
  assetId: string,
  start: number,
  end: number,
): Promise<{ bytes: Buffer; ext: string; totalSize: number } | null> {
  const absolute = await resolveMediaToken(assetId);
  if (!absolute) return null;
  const media = await validateMediaFile(absolute).catch(() => null);
  if (!media) return null;
  const safeStart = Math.max(0, Math.min(start, media.size - 1));
  const safeEnd = Math.max(safeStart, Math.min(end, media.size - 1));
  const length = safeEnd - safeStart + 1;
  if (length <= 0) return null;
  const handle = await fs.open(absolute, "r");
  try {
    const bytes = Buffer.allocUnsafe(length);
    await handle.read(bytes, 0, length, safeStart);
    return { bytes, ext: media.ext, totalSize: media.size };
  } finally {
    await handle.close();
  }
}

export async function readAssetFile(
  assetId: string,
): Promise<{ bytes: Buffer; ext: string } | null> {
  const absolute = await resolveMediaToken(assetId);
  if (!absolute) return null;
  try {
    const media = await validateMediaFile(absolute);
    return { bytes: await fs.readFile(absolute), ext: media.ext };
  } catch {
    return null;
  }
}

export async function scanVault(): Promise<{ path: string; files: number; conflicts: number; warnings: number }> {
  const vaultPath = await resolveVaultPath();
  const documents = await listDocuments(vaultPath);
  return {
    path: vaultPath,
    files: documents.length,
    conflicts: documents.filter((document) => document.status === "identity_conflict").length,
    warnings: documents.reduce((sum, document) => sum + document.issues.length, 0),
  };
}
