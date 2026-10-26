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
  path: string;
  url?: string | null;
  color?: string | null;
};

export type DocumentStatus = "ready" | "missing" | "identity_conflict" | "invalid_frontmatter";

export type MediaRefDTO = {
  raw: string;
  alt: string;
  kind: "image" | "video" | "audio";
  source: "relative" | "absolute" | "url";
  resolved: string;
  order: number;
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
  durationSec: z.number().int().nonnegative().nullable().optional(),
  order: z.array(z.string()).optional(), // 拖拽排序：可见稿子的新顺序
  expectedFingerprint: z.string().optional(),
});

export const publishRequestSchema = z.object({
  postId: z.string().min(1),
  platformIds: z.array(z.string().min(1)).min(1),
  /** 平台 → 发布频道；播客账号有多个节目/专辑/播单时必选 */
  channelIds: z.record(z.string(), z.string().min(1)).optional(),
});

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
  contentHash: string;
  platformId: string;
  accountUid: string | null;
  targetChannel: { id: string; name: string } | null;
  options: Record<string, unknown>;
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
});
export type ExtensionAccountRequest = z.infer<typeof extensionAccountRequestSchema>;

export const extensionAccountResultSchema = z.object({
  type: z.literal("account.result"),
  requestId: z.string().uuid(),
  platformId: z.string().trim().min(1).max(80),
  state: z.enum(["ok", "needs_login", "failed"]),
  error: z.string().trim().max(2000).nullable().default(null),
  profile: extensionAccountProfileSchema.nullable(),
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
