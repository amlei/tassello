/* @tassello/shared —— 领域类型 + zod schema（UI / 服务 / 未来 Agent 共用） */
import { z } from "zod";

/* ---------- 内容类型 ---------- */
export const CONTENT_TYPES = ["article", "image", "video", "audio"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

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
export const AUTH_MODES = ["api", "cdp", "rss-downstream"] as const;
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
export const TASK_STATUSES = ["queued", "running", "success", "failed"] as const;
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
  color?: string | null;
};

export type PostDTO = {
  id: string;
  type: ContentType;
  title: string;
  body: string;
  bodyHtml: string;
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
  /** 最近一次 verify 使用的 profile 版本；用于判断是否可以跳过启动浏览器 */
  profileGeneration?: string | null;
  /** 播客账号的发布目标：小宇宙节目 / 喜马拉雅专辑 / 荔枝播单 */
  channels?: ChannelDTO[];
};

export type PlatformDTO = PlatformMeta & {
  account: AccountDTO | null;
};

export type TaskDTO = {
  id: string;
  postId: string;
  postTitle: string;
  platformId: string;
  accountUid: string | null;
  channelId: string | null;
  channelName: string | null;
  status: TaskStatus;
  stage: number;
  progress: number;
  failReason: string | null;
  url: string | null;
  createdAt: string;
  finishedAt: string | null;
};

/* ---------- API 输入 schema ---------- */
export const postCreateSchema = z.object({
  type: z.enum(CONTENT_TYPES),
  title: z.string().max(200).optional().default(""),
  body: z.string().optional().default(""),
});

export const postUpdateSchema = z.object({
  title: z.string().max(200).optional(),
  body: z.string().optional(),
  bodyHtml: z.string().optional(),
  durationSec: z.number().int().nonnegative().nullable().optional(),
  order: z.array(z.string()).optional(), // 拖拽排序：可见稿子的新顺序
});

export const publishRequestSchema = z.object({
  postId: z.string().min(1),
  platformIds: z.array(z.string().min(1)).min(1),
  /** 平台 → 发布频道；播客账号有多个节目/专辑/播单时必选 */
  channelIds: z.record(z.string(), z.string().min(1)).optional(),
});

export const settingsUpdateSchema = z.object({
  defaultTargets: z.partialRecord(z.enum(CONTENT_TYPES), z.array(z.string())).optional(),
  importBrowser: z.enum(["chrome", "edge"]).optional(),
});

/* 登录态导入源：获取账号时从哪个日常浏览器复制登录态。
   全局单选是技术约束（整个 Cookies 库复制 + 单一 os_crypt 密钥），不支持按平台混用 */
export type ImportBrowserId = "chrome" | "edge";
export const IMPORT_BROWSERS: { id: ImportBrowserId; name: string }[] = [
  { id: "chrome", name: "Google Chrome" },
  { id: "edge", name: "Microsoft Edge" },
];
export type ImportBrowserDTO = { id: ImportBrowserId; name: string; detected: boolean };

export type AppSettings = {
  defaultTargets: Record<ContentType, string[]>;
  importBrowser: ImportBrowserId;
};

export const DEFAULT_SETTINGS: AppSettings = {
  defaultTargets: {
    article: ["wechat", "weibo"],
    image: ["weibo"],
    video: ["weibo"],
    audio: [],
  },
  importBrowser: "chrome",
};

/* ---------- API envelope ---------- */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };
