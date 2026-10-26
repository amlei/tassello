import type React from "react";
import type { StatusTone } from "./status-dot";

const CHIP: Record<StatusTone, string> = {
  neutral: "border-line text-ink2",
  success: "border-[#B7E3CD] text-green",
  warning: "border-warning/35 text-warning",
  danger: "border-error/30 text-error",
};

export function StatusChip({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={"inline-flex flex-none items-center rounded-full border px-[9px] py-0.5 font-mono text-[10px] font-bold " + CHIP[tone] + " " + className}>
      {children}
    </span>
  );
}
