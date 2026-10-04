export type ContentType = "article" | "image" | "video" | "audio";
export type PlatformId = "weibo" | "zhihu" | "xhs";
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
  options: Record<string, Record<string, unknown>>;
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
  glyph: string;
  supports: ContentType[];
  description: string;
};

export const PLATFORMS: PlatformCapability[] = [
  {
    id: "weibo",
    name: "微博",
    short: "博",
    color: "#FF8200",
    glyph: "博",
    supports: ["article", "image"],
    description: "发送到微博首页 composer，自动点击发送",
  },
  {
    id: "zhihu",
    name: "知乎",
    short: "知",
    color: "#0084FF",
    glyph: "知",
    supports: ["article", "image"],
    description: "创建知乎草稿，等待你人工确认",
  },
  {
    id: "xhs",
    name: "小红书",
    short: "红",
    color: "#FF2442",
    glyph: "红",
    supports: ["article", "image"],
    description: "创建小红书草稿，等待你人工确认",
  },
];

export const PLATFORM_BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));
