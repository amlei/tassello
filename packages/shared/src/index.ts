/* @tassello/shared —— 领域类型 + zod schema（UI / 服务 / 未来 Agent 共用） */
import { z } from "zod";

/* ---------- 内容类型 ---------- */
export const CONTENT_TYPES = ["article", "image", "video", "audio"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** 手动安装与开发版共享的扩展 ID；manifest 使用同一 public key 固定此值。 */
export const BUNDLED_EXTENSION_ID = "ablhokoljngdpaicipgpaigjeagmbhkl";
export const NATIVE_HOST_NAME = "com.jiuyang.onda";

export function configuredExtensionIds(env: Record<string, string | undefined> = {}): string[] {
  const candidates = [
    BUNDLED_EXTENSION_ID,
    env.ONDA_CHROME_EXTENSION_ID,
    env.ONDA_EDGE_EXTENSION_ID,
    ...(env.ONDA_EXTENSION_IDS ?? "").split(","),
  ];
  return [...new Set(candidates
    .map((value) => value?.trim())
    .filter((value): value is string => !!value && /^[a-p]{32}$/.test(value)))];
}

export function extensionOrigin(extensionId: string): string {
  return `chrome-extension://${extensionId}/`;
}

export const TYPE_META: Record<
  ContentType,
  { zh: string; en: string; color: string; glyph: string }
> = {
  article: { zh: "文章", en: "ARTICLE", color: "#2C6FF0", glyph: "文" },
  image: { zh: "贴图", en: "IMAGES", color: "#D52088", glyph: "图" },
  video: { zh: "视频", en: "VIDEO", color: "#FD8D11", glyph: "影" },
  audio: { zh: "音频", en: "AUDIO", color: "#0EC3D4", glyph: "声" },
};

export const TYPE_ORDER: ContentType[] = ["article", "image", "video", "audio"];

/* ---------- 平台 ---------- */
export const AUTH_MODES = ["api", "extension", "cdp", "rss-downstream"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];
export type PlatformStatus = "active" | "planned";
export type PublishPersistence = "draft" | "state";
export type AccountState = "ok" | "fail";

export type PlatformMeta = {
  id: string;
  name: string;
  char: string;
  color: string;
  /** 亮色底上的深色文字（即刻黄 / 抖音青） */
  fg?: string;
  /** 发布成功后的回执链接前缀 */
  link: string;
  /** 登录页地址：导入的登录态失效时，「重新获取」打开它让用户在应用浏览器里登录 */
  loginUrl?: string;
  supports: ContentType[];
  /** 平台内对内容形态的专用名称，例如头条号 image = 微头条。 */
  contentLabels?: Partial<Record<ContentType, string>>;
  authMode: AuthMode;
  /** true = 适配器可自动点发布；false = 停在人工确认 */
  autoSubmit: boolean;
  /** 按内容类型区分：draft = 可持久恢复；state = 页面状态，不保留就丢弃 */
  publishPersistence: Partial<Record<ContentType, PublishPersistence>>;
  /** 个别平台会拒绝 HeadlessChrome，verify 需要显式使用可见浏览器 */
  verifyMode?: "headless" | "visible";
  /** 发布去向文案（账号卡渲染用，平台级静态） */
  lands: string;
  status: PlatformStatus;
  /** 平台对封面的能力；未声明表示当前发布流程不处理独立封面。 */
  cover?: Partial<Record<ContentType, CoverCapability>>;
};

export type CoverCapability = {
  required: boolean;
  /** 比例文案尚未统一到像素尺寸，由各平台接入时进一步细化。 */
  ratio: string;
  sources: Array<"post-asset" | "channel" | "platform-default">;
};

/* ---------- 发布任务 ---------- */
export const TASK_STATUSES = [
  "queued",
  "rendering",
  "uploading",
  "filling",
  "running",
  "awaiting_confirm",
  "waiting_extension",
  "unknown",
  "success",
  "failed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const STAGE_LABELS = ["渲染排版", "上传素材", "填充编辑器", "人工确认"] as const;

export type StageEvent = {
  taskId: string;
  postId: string;
  platformId: string;
  status: TaskStatus;
  stage: number;
  progress: number;
  message?: string | null;
  url?: string | null;
};

/* ---------- DTO（服务层 → UI） ---------- */
export type AssetDTO = {
  id: string;
  kind: string;
  /** frontmatter 可持久保存的资源引用，优先相对当前 Markdown。 */
  reference: string;
  path: string;
  url?: string | null;
  color?: string | null;
  role?: "body" | "cover";
};

export type DocumentStatus = "ready" | "missing" | "identity_conflict" | "invalid_frontmatter";

export type MediaRefDTO = {
  raw: string;
  alt: string;
  kind: "image" | "video" | "audio";
  source: "relative" | "absolute" | "url";
  resolved: string;
  order: number;
  /** cover = 只作为稿件封面，不参与正文媒体顺序。 */
  role?: "body" | "cover";
};

export type PublishMediaRefDTO = MediaRefDTO & {
  /** 本机媒体通过签名 token 交给扩展读取。 */
  assetId: string | null;
  fileName: string | null;
};

export type PostDTO = {
  id: string;
  type: ContentType;
  title: string;
  /** Markdown 正文，含首个 H1；磁盘文件是唯一持久事实源。 */
  markdown: string;
  /** 由 Markdown 派生的纯文本，仅用于摘要和搜索。 */
  body: string;
  /** 由 Markdown 派生的编辑/预览 HTML，不持久化。 */
  bodyHtml: string;
  filePath: string;
  fingerprint: string;
  status: DocumentStatus;
  issues: string[];
  platforms: string[];
  options: Record<string, unknown>;
  media: MediaRefDTO[];
  cover: string | null;
  durationSec: number | null;
  updatedAt: string;
  manualOrder: number;
  assets: AssetDTO[];
};

export type ChannelDTO = {
  id: string;
  name: string;
  coverUrl?: string | null;
};

export type RssFeedHintDTO = {
  url: string;
  title: string;
  episodeCount: number | null;
  status: string | null;
};

export type PodcastRssClaimDTO = {
  platformId: string;
  state: "claimed" | "indexed";
  label: string;
  evidenceUrl: string | null;
  checkedAt: string;
  accountUid: string | null;
};

export type PodcastRssDTO = {
  feedUrl: string;
  title: string;
  episodeCount: number | null;
  coverUrl: string | null;
  sourcePlatformId: string | null;
  sourceChannelId: string | null;
  sourceChannelName: string | null;
  claims: PodcastRssClaimDTO[];
  checkedAt: string;
};

export const ACCOUNT_SYNC_PHASES = [
  "unsupported",
  "extension_offline",
  "unverified",
  "checking",
  "source_changed",
  "needs_login",
  "failed",
  "connected",
] as const;
export type AccountSyncPhase = (typeof ACCOUNT_SYNC_PHASES)[number];

export type AccountSyncDTO = {
  phase: AccountSyncPhase;
  reason: string | null;
};

export type AccountDTO = {
  id: string;
  platformId: string;
  state: AccountState;
  failReason: string | null;
  name: string | null;
  uid: string | null;
  avatarUrl: string | null;
  authExpiresAt: string | null;
  lastCheckedAt: string | null;
  /** 播客账号的发布目标：小宇宙节目 / 喜马拉雅专辑 / 荔枝播单 */
  channels?: ChannelDTO[];
};

export type PlatformDTO = PlatformMeta & {
  account: AccountDTO | null;
  /** 由持久化账号、扩展连接和当前 verify 共同派生，不写入账号文件。 */
  sync: AccountSyncDTO;
};

export type TaskDTO = {
  id: string;
  postId: string;
  postTitle: string;
  documentPath?: string | null;
  platformId: string;
  accountUid: string | null;
  channelId: string | null;
  channelName: string | null;
  status: TaskStatus;
  stage: number;
  progress: number;
  failReason: string | null;
  url: string | null;
  urlSource?: "auto" | "manual" | null;
  noPublicUrl?: boolean;
  pageUrl?: string | null;
  manualHint?: string | null;
  tabId?: number | null;
  retryOfTaskId?: string | null;
  createdAt: string;
  finishedAt: string | null;
};

/* ---------- API 输入 schema ---------- */
export const postCreateSchema = z.object({
  type: z.enum(CONTENT_TYPES),
  title: z.string().max(200).optional().default(""),
  markdown: z.string().optional().default(""),
});

export const postUpdateSchema = z.object({
  title: z.string().max(200).optional(),
  markdown: z.string().optional(),
  cover: z.string().trim().max(4096).nullable().optional(),
  durationSec: z.number().int().nonnegative().nullable().optional(),
  order: z.array(z.string()).optional(), // 拖拽排序：可见稿子的新顺序
  expectedFingerprint: z.string().optional(),
});

export const publishRequestSchema = z.object({
  source: z.object({
    id: z.string().trim().min(1).max(200),
    filePath: z.string().trim().min(1).max(4096),
    vaultPath: z.string().trim().min(1).max(4096).optional(),
    markdown: z.string().max(16 * 1024 * 1024),
    fingerprint: z.string().trim().min(1).max(512),
  }).strict(),
  platformIds: z.array(z.string().min(1)).min(1),
  /** 平台 → 发布频道；播客账号有多个节目/专辑/播单时必选 */
  channelIds: z.record(z.string(), z.string().min(1)).optional(),
}).strict();

export type PublishSourceInput = z.infer<typeof publishRequestSchema>["source"];

export const extensionAutoPairSchema = z.object({
  clientId: z.string().min(1).max(160).optional(),
  extensionId: z.string().regex(/^[a-p]{32}$/),
  browserLabel: z.string().min(1).max(80),
  userAgent: z.string().max(4096).default(""),
  version: z.string().min(1).max(80),
  runtimeId: z.string().min(1).max(160).optional(),
});

export const settingsUpdateSchema = z.object({
  defaultTargets: z.partialRecord(z.enum(CONTENT_TYPES), z.array(z.string())).optional(),
  vaultPath: z.string().trim().min(1).max(4096).optional(),
  attachmentPath: z.string().trim().min(1).max(4096).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
});

export const podcastRssUpdateSchema = z.object({
  feedUrl: z.string().trim().url().max(4096).refine(
    (value) => /^https?:\/\//i.test(value),
    "只接受 HTTP(S) RSS 地址",
  ),
}).strict();

export const uploadCacheQuerySchema = z.object({
  platformId: z.string().trim().min(1).max(80),
  accountUid: z.string().trim().min(1).max(300),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  kind: z.string().trim().min(1).max(40),
  scope: z.string().trim().min(1).max(120),
}).strict();

export const uploadCacheSaveSchema = uploadCacheQuerySchema.extend({
  id: z.string().trim().min(1).max(4096),
  url: z.string().trim().url().max(4096).nullable().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type AppSettings = {
  defaultTargets: Record<ContentType, string[]>;
  vaultPath: string | null;
  /** 粘贴和上传资源相对 Vault 的目录；默认 files。 */
  attachmentPath: string;
  theme: "light" | "dark" | "system";
};

export const DEFAULT_SETTINGS: AppSettings = {
  defaultTargets: {
    article: ["wechat", "weibo"],
    image: ["weibo"],
    video: ["weibo"],
    audio: [],
  },
  vaultPath: null,
  attachmentPath: "files",
  theme: "system",
};

export type PublishCapabilityDTO = {
  installationId: string;
  state: "ready" | "waiting" | "unavailable";
  extension: {
    connected: boolean;
    clientId: string | null;
    lastHeartbeatAt: string | null;
    browserLabel: string | null;
  };
  reason: string | null;
};

export type PublishSnapshotDTO = {
  documentId: string;
  documentPath: string;
  title: string;
  type: ContentType;
  markdown: string;
  /** 任务创建时由统一 Markdown 渲染器生成的正文，平台驱动只替换媒体占位。 */
  bodyHtml?: string;
  plainText?: string;
  media: PublishMediaRefDTO[];
  /** 显式选择的封面；为空时驱动使用第一张有效图片。 */
  cover: PublishMediaRefDTO | null;
  contentHash: string;
  platformId: string;
  accountUid: string | null;
  targetChannel: { id: string; name: string; coverUrl?: string | null } | null;
  options: Record<string, unknown>;
};

/* ---------- 应用内网页生图 ---------- */
export const IMAGE_GENERATION_PLATFORMS = ["doubao"] as const;
export type ImageGenerationPlatform = (typeof IMAGE_GENERATION_PLATFORMS)[number];

export const IMAGE_GENERATION_MODELS = [
  "Seedream 5.0 Flash",
  "Seedream 5.0 Pro",
  "Seedream 4.5",
  "Seedream 4.0",
] as const;
export type ImageGenerationModel = (typeof IMAGE_GENERATION_MODELS)[number];

export const IMAGE_GENERATION_RATIOS = [
  "自动",
  "9:16",
  "2:3",
  "3:4",
  "1:1",
  "4:3",
  "3:2",
  "16:9",
] as const;
export type ImageGenerationRatio = (typeof IMAGE_GENERATION_RATIOS)[number];

export const DEFAULT_IMAGE_GENERATION_MODEL = "Seedream 5.0 Flash" as const;
export const DEFAULT_IMAGE_GENERATION_RATIO = "16:9" as const;
export const IMAGE_GENERATION_TIMEOUT_MS = 300_000;
export const IMAGE_GENERATION_LOGIN_TIMEOUT_MS = 180_000;

export const IMAGE_GENERATION_STATUSES = [
  "queued",
  "waiting_extension",
  "waiting_login",
  "generating",
  "downloading",
  "quota_exhausted",
  "unknown",
  "success",
  "failed",
  "cancelled",
] as const;
export type ImageGenerationStatus = (typeof IMAGE_GENERATION_STATUSES)[number];

const generationSlugSchema = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "名称只能包含小写字母、数字和连字符")
  .max(80);

export const imageGenerationItemSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  ratio: z.enum(IMAGE_GENERATION_RATIOS).default(DEFAULT_IMAGE_GENERATION_RATIO),
  slug: generationSlugSchema.optional(),
}).strict();
export type ImageGenerationItemInput = z.infer<typeof imageGenerationItemSchema>;

export const imageGenerationRequestSchema = z.object({
  platform: z.literal("doubao").default("doubao"),
  model: z.enum(IMAGE_GENERATION_MODELS).default(DEFAULT_IMAGE_GENERATION_MODEL),
  name: generationSlugSchema.optional(),
  items: z.array(imageGenerationItemSchema).min(1),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
}).strict();
export type ImageGenerationRequest = z.infer<typeof imageGenerationRequestSchema>;

export type ImageGenerationOutputDTO = {
  promptIndex: number;
  outputIndex: number;
  filePath: string;
  relativePath: string;
  width: number;
  height: number;
  bytes: number;
  contentHash: string;
};

export type ImageGenerationTaskDTO = {
  id: string;
  platform: ImageGenerationPlatform;
  model: ImageGenerationModel;
  name: string;
  status: ImageGenerationStatus;
  stage: number;
  progress: number;
  total: number;
  completed: number;
  outputDirectory: string | null;
  outputs: ImageGenerationOutputDTO[];
  error: string | null;
  pageUrl: string | null;
  tabId: number | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type ImageGenerationJob = {
  jobId: string;
  attempt: number;
  request: ImageGenerationRequest;
};

export type ImageGenerationJobEvent = {
  type: "generation.event";
  jobId: string;
  event: {
    status?: ImageGenerationStatus;
    stage?: number;
    progress?: number;
    completed?: number;
    message?: string | null;
    pageUrl?: string | null;
    tabId?: number | null;
  };
};

export type ImageGenerationResultAsset = {
  promptIndex: number;
  outputIndex: number;
  src: string;
  width: number;
  height: number;
};

export type ImageGenerationJobResult = {
  type: "generation.result";
  jobId: string;
  result: {
    status: "success" | "quota_exhausted" | "unknown" | "failed" | "cancelled";
    outputs: ImageGenerationResultAsset[];
    error?: string | null;
    pageUrl?: string | null;
    tabId?: number | null;
  };
};

export type ExtensionJob = {
  jobId: string;
  attempt: number;
  snapshot: PublishSnapshotDTO;
};

export type ExtensionJobEvent = {
  type: "job.event";
  jobId: string;
  event: {
    status?: TaskStatus;
    stage?: number;
    progress?: number;
    message?: string | null;
    pageUrl?: string | null;
    tabId?: number | null;
  };
};

export type ExtensionJobResult = {
  type: "job.result";
  jobId: string;
  result: {
    status: "success" | "awaiting_confirm" | "unknown" | "failed" | "cancelled";
    url?: string | null;
    urlSource?: "auto" | "manual" | null;
    noPublicUrl?: boolean;
    pageUrl?: string | null;
    tabId?: number | null;
    error?: string | null;
  };
};

export type UploadCacheQuery = {
  platformId: string;
  accountUid: string;
  contentHash: string;
  kind: string;
  scope: string;
};

export type UploadCacheRef = {
  id: string;
  url: string | null;
  payload: Record<string, unknown>;
  updatedAt: string;
};

const accountTextSchema = z.string().trim().min(1).max(200);
const accountOptionalTextSchema = z.string().trim().max(200).nullable();
const accountUrlSchema = z.string().trim().url().max(4096).refine(
  (value) => /^https?:\/\//i.test(value),
  "只接受 HTTP(S) URL",
).nullable();

export const extensionRssFeedSchema = z.object({
  url: z.string().trim().url().max(4096).refine(
    (value) => /^https?:\/\//i.test(value),
    "只接受 HTTP(S) RSS 地址",
  ),
  title: z.string().trim().min(1).max(300),
  episodeCount: z.number().int().nonnegative().nullable(),
  status: z.string().trim().max(120).nullable(),
}).strict();
export type ExtensionRssFeedDTO = z.infer<typeof extensionRssFeedSchema>;

export const extensionAccountChannelSchema = z.object({
  id: accountTextSchema,
  name: accountTextSchema,
  coverUrl: accountUrlSchema.optional().default(null),
}).strict();

export const extensionAccountProfileSchema = z.object({
  uid: accountTextSchema,
  name: accountOptionalTextSchema,
  avatarUrl: accountUrlSchema,
  authExpiresAt: z.string().trim().max(80).nullable(),
  channels: z.array(extensionAccountChannelSchema).max(200).default([]),
}).strict();
export type ExtensionAccountProfileDTO = z.infer<typeof extensionAccountProfileSchema>;

export const extensionAccountRequestSchema = z.object({
  type: z.enum(["account.verify", "account.open-login"]),
  requestId: z.string().uuid(),
  platformId: z.string().trim().min(1).max(80),
  includeRss: z.boolean().optional(),
});
export type ExtensionAccountRequest = z.infer<typeof extensionAccountRequestSchema>;

export const extensionAccountResultSchema = z.object({
  type: z.literal("account.result"),
  requestId: z.string().uuid(),
  platformId: z.string().trim().min(1).max(80),
  state: z.enum(["ok", "needs_login", "failed"]),
  error: z.string().trim().max(2000).nullable().default(null),
  profile: extensionAccountProfileSchema.nullable(),
  rssFeeds: z.array(extensionRssFeedSchema).max(100).default([]),
}).strict().superRefine((value, context) => {
  if (value.state === "ok" && !value.profile) {
    context.addIssue({ code: "custom", path: ["profile"], message: "登录成功结果必须包含账号资料" });
  }
  if (value.state !== "ok" && value.profile) {
    context.addIssue({ code: "custom", path: ["profile"], message: "未登录或失败结果不得携带账号资料" });
  }
  if (
    value.profile
    && new TextEncoder().encode(JSON.stringify(value.profile)).byteLength > 64 * 1024
  ) {
    context.addIssue({ code: "custom", path: ["profile"], message: "账号资料超过 64 KiB 限制" });
  }
  if (value.rssFeeds.length > 0 && value.state !== "ok") {
    context.addIssue({ code: "custom", path: ["rssFeeds"], message: "未登录或失败结果不得携带 RSS 数据" });
  }
});
export type ExtensionAccountResult = z.infer<typeof extensionAccountResultSchema>;

export const extensionLoginOpenedSchema = z.object({
  type: z.literal("account.login-opened"),
  requestId: z.string().uuid(),
  platformId: z.string().trim().min(1).max(80),
  ok: z.boolean(),
  error: z.string().trim().max(2000).nullable().default(null),
}).strict();
export type ExtensionLoginOpened = z.infer<typeof extensionLoginOpenedSchema>;

export type ExtensionDTO = {
  clientId: string;
  installationId: string;
  browserLabel: string;
  userAgent: string;
  version: string;
  connected: boolean;
  revoked: boolean;
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DirectoryEntryDTO = {
  name: string;
  path: string;
  isVault: boolean;
  writable: boolean;
};

export type DirectoryListingDTO = {
  path: string;
  parent: string | null;
  isVault: boolean;
  writable: boolean;
  entries: DirectoryEntryDTO[];
};

/* ---------- API envelope ---------- */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };
