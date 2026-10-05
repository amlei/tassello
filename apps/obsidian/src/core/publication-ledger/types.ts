import type { PlatformId, PublishStatus } from "../types";

export type PublicationPlatformStatus =
  | "待确认"
  | "完成"
  | "失败"
  | "已取消";

export type PublicationOverallStatus =
  | PublicationPlatformStatus
  | "部分完成";

export type PublicationLedgerStatus = Extract<
  PublishStatus,
  "awaiting_confirm" | "success" | "failed" | "cancelled"
>;

export type PlatformPublicationMeta = {
  status: PublicationPlatformStatus;
  draftUrl?: string | null;
  publishUrl?: string | null;
  finishedAt?: string | null;
  failReason?: string | null;
  sourceChanged?: boolean;
};

/** 默认放在 Vault 根，文件名与插件名保持一致。 */
export const DEFAULT_PUBLICATION_BASE_PATH = "Tassello Publisher.base";

export type PublicationSettings = {
  basePath: string;
  autoCreate: boolean;
  includeFailReason: boolean;
};

export const PUBLICATION_STATUSES = new Set<PublicationLedgerStatus>([
  "awaiting_confirm",
  "success",
  "failed",
  "cancelled",
]);

export const PLATFORM_STATUS_BY_TASK_STATUS: Record<
  PublicationLedgerStatus,
  PublicationPlatformStatus
> = {
  awaiting_confirm: "待确认",
  success: "完成",
  failed: "失败",
  cancelled: "已取消",
};
