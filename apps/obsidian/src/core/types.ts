export type ContentType = "article" | "image" | "video" | "audio";
export type PlatformId = "weibo" | "zhihu" | "xhs" | "jike" | "douban" | "x";
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
  glyph: string;
  supports: ContentType[];
  description: string;
};

export const PLATFORMS: PlatformCapability[] = [
  {
    id: "jike",
    name: "即刻",
    short: "即",
    color: "#FFD400",
    glyph: "即",
    supports: ["image"],
    description: "读取当前 Chrome 登录态，自动发送动态/图文",
  },
  {
    id: "douban",
    name: "豆瓣",
    short: "豆",
    color: "#2E963D",
    glyph: "豆",
    supports: ["article", "image"],
    description: "创建豆瓣发言草稿；投递和发布由你完成",
  },
  {
    id: "x",
    name: "X",
    short: "X",
    color: "#16130E",
    glyph: "X",
    supports: ["article", "image"],
    description: "发送普通帖子/想法；X Articles 暂不接入",
  },
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
/** 同一 Markdown 在不同平台的实际发布形态；article 只是源类型，不代表平台一定有独立文章通道。 */
export function effectiveContentType(platformId: PlatformId, sourceType: ContentType): ContentType {
  const capability = PLATFORM_BY_ID.get(platformId);
  if (!capability) return sourceType;
  if (capability.supports.includes(sourceType)) return sourceType;
  // 不支持独立文章的动态平台，把 article 源降级为图文/贴图；纯文字也继续走同一动态通道。
  if (sourceType === "article" && capability.supports.includes("image")) return "image";
  return sourceType;
}
