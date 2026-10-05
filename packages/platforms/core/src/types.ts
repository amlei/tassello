/* @tassello/platform-core —— PlatformAdapter 接口 + 平台注册表（唯一不放具体平台实现的地方） */
import type { ZodType } from "zod";
import type { PlatformMeta, StageEvent } from "@tassello/shared";

/* ---------- 发布稿子的输入（服务层从 Post + Asset 组装） ---------- */
export type PostDraft = {
  id: string;
  type: string;
  title: string;
  body: string;
  bodyHtml: string;
  durationSec: number | null;
  assets: { id: string; kind: string; path: string; color?: string | null }[];
};

/* ---------- 账号引用（服务层从 PlatformAccount 组装） ---------- */
export type AdapterAccount<TProfile = unknown> = {
  id: string;
  uid: string | null;
  profile?: TProfile;
};

/* ---------- 适配器上下文（服务层注入，适配器不直接碰数据库） ---------- */
export type SecretBox = {
  get(ref: string): Promise<string | null>;
  set(ref: string, plain: string): Promise<void>;
};

/** 宿主无关的 CDP 连接：web 和 Obsidian 分别注入自己的具体连接实现。 */
export type CdpLike = {
  send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    options?: { sessionId?: string; timeoutMs?: number },
  ): Promise<T>;
};

export type BrowserRunMode = "headless" | "visible";

export type PageRunOptions = {
  url: string;
  keepOpen?: boolean;
  activate?: boolean;
  /** web shared pool 支持；Obsidian 默认 Chrome runner 永远保持 visible。 */
  mode?: BrowserRunMode;
};

/** 宿主注入一次页面任务；adapter 不得自己选择浏览器。 */
export type PlatformPageRunner = <T>(
  platformId: string,
  options: PageRunOptions,
  handler: (cdp: CdpLike, sessionId: string) => Promise<T>,
) => Promise<T>;

export type PublishIntent = "auto" | "draft";

export type AdapterPublishOptions = {
  intent?: PublishIntent;
  /** 平台主通道；当前知乎支持 article / pin。 */
  channel?: string;
};

export type AdapterCtx = {
  secrets?: SecretBox;
  /** 结构化事件/日志（web 写 PublishLog；Obsidian 可写本地日志）。 */
  log: (event: string, payload?: unknown) => void;
  runPage: PlatformPageRunner;
};

export type StageReporter = (e: { stage: number; progress: number; message?: string | null }) => void;

export type PublishResult = {
  /** 回执链接（未拿到时 null） */
  url: string | null;
  /** true = 停在人工确认：编辑器已填好，等用户在浏览器里点发布 */
  needsManualConfirm: boolean;
  /** 平台侧草稿 id / media_id 等回执凭据 */
  receipt?: Record<string, string>;
};

export type VerifyResult<TProfile = unknown> = {
  state: "ok" | "fail";
  failReason?: string;
  /** 刷新后的 profile（verify 会把 sessionToken 等可变字段写回） */
  profile?: TProfile;
  name?: string | null;
  uid?: string | null;
  avatarUrl?: string | null;
  authExpiresAt?: string | null;
};

export interface PlatformAdapter<TProfile = unknown> {
  meta: PlatformMeta;
  account: {
    /** profile JSON 校验，schema 归平台包所有 */
    profileSchema: ZodType<TProfile>;
    /** 校验：拿 profile → 派生展示字段 → 服务层写回 PlatformAccount。
     *  登录态来自导入的用户浏览器 Profile，应用内不承担登录 */
    verify(acct: AdapterAccount<TProfile>, ctx: AdapterCtx): Promise<VerifyResult<TProfile>>;
  };
  publish(
    post: PostDraft,
    acct: AdapterAccount<TProfile> | undefined,
    ctx: AdapterCtx,
    onStage: StageReporter,
    options?: AdapterPublishOptions,
  ): Promise<PublishResult>;
}
