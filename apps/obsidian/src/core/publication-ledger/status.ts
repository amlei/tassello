import type { PlatformId } from "../types";
import type { PlatformPublicationMeta, PublicationOverallStatus, PublicationPlatformStatus } from "./types";

const VALID_PLATFORM_STATUSES = new Set<PublicationPlatformStatus>([
  "待确认",
  "完成",
  "失败",
  "已取消",
]);

export function isPlatformStatus(value: unknown): value is PublicationPlatformStatus {
  return typeof value === "string" && VALID_PLATFORM_STATUSES.has(value as PublicationPlatformStatus);
}

/** 整体状态只用于人工浏览：异常优先，其次是需要处理的事项，最后才是完成。 */
export function deriveOverallStatus(
  byPlatform: Partial<Record<PlatformId, PlatformPublicationMeta>>,
): PublicationOverallStatus {
  const statuses = Object.values(byPlatform)
    .map((item) => item?.status)
    .filter((status): status is PublicationPlatformStatus => Boolean(status));

  if (!statuses.length) return "已取消";
  if (statuses.every((status) => status === "完成")) return "完成";
  if (statuses.some((status) => status === "失败")) return "失败";
  if (statuses.some((status) => status === "待确认")) return "待确认";
  if (statuses.some((status) => status === "完成")) return "部分完成";
  return "已取消";
}
