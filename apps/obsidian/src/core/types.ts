import { PLATFORM_METAS } from "@tassello/platform-core";

export type ContentType = "article" | "image" | "video" | "audio";
export type PlatformId = string;
export type BrowserStatus =
  | "disconnected"
  | "checking"
  | "waiting-approval"
  | "connected"
  | "denied"
  | "unsupported";

export type FindingLevel = "ok" | "warning" | "error";

export type Finding = {
  level: FindingLevel;
  message: string;
};

export type ResolvedAsset = {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  vaultPath: string;
  absolutePath: string;
  resourcePath: string;
  alt: string;
};

export type SourceDraft = {
  filePath: string;
  contentDigest: string;
  title: string;
  type: ContentType;
  body: string;
  html: string;
  plain: string;
  assets: ResolvedAsset[];
  platformIds: PlatformId[];
  options: Record<string, unknown>;
};

export type PublishStatus =
  | "queued"
  | "running"
  | "awaiting_confirm"
  | "success"
  | "failed"
  | "cancelled";

export type PublishTask = {
  id: string;
  filePath: string;
  platformId: PlatformId;
  status: PublishStatus;
  stage: number;
  progress: number;
  message?: string | null;
  failReason?: string | null;
  url?: string | null;
  sourceDigestAtStart?: string | null;
  sourceChangedAfterStart?: boolean;
  pageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string | null;
};

export type PlatformCapability = {
  id: PlatformId;
  name: string;
  short: string;
  color: string;
  fg?: string;
  glyph: string;
  supports: ContentType[];
  description: string;
};

export const PLATFORMS: PlatformCapability[] = PLATFORM_METAS.map((meta) => ({
  id: meta.id,
  name: meta.name,
  short: meta.char,
  color: meta.color,
  fg: meta.fg,
  glyph: meta.char,
  supports: meta.supports,
  description: meta.lands,
}));

export const PLATFORM_BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));

/** 同一 Markdown 在不同平台的实际发布形态；article 只是源类型，不代表平台一定有独立文章通道。 */
export function effectiveContentType(platformId: PlatformId, sourceType: ContentType): ContentType {
  const capability = PLATFORM_BY_ID.get(platformId);
  if (!capability) return sourceType;
  if (capability.supports.includes(sourceType)) return sourceType;
  // 不支持独立文章的动态平台，把 article 源降级为图文/贴图；纯文字也继续走同一动态通道。
  if (sourceType === "article" && capability.supports.includes("image")) return "image";
  return sourceType;
}
