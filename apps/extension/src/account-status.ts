import type { PlatformDTO } from "@tassello/shared";

export type AccountStatusPresentation = {
  label: string;
  tone: "ok" | "wait" | "bad";
};

export function platformAccountStatus(
  phase: PlatformDTO["sync"]["phase"],
  checking = false,
): AccountStatusPresentation {
  if (checking || phase === "checking") return { label: "检查中", tone: "wait" };
  if (phase === "connected") return { label: "已连接", tone: "ok" };
  if (phase === "needs_login") return { label: "需要登录", tone: "wait" };
  if (phase === "extension_offline") return { label: "等待扩展", tone: "wait" };
  if (phase === "failed" || phase === "source_changed") {
    return { label: "检查失败", tone: "bad" };
  }
  return { label: "待检查", tone: "wait" };
}
