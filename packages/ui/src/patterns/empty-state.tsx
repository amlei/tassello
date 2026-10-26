import React from "react";

export function EmptyState({
  children,
  action,
  className = "",
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"flex flex-col items-center gap-4 rounded-[14px] border border-dashed border-ink3 p-11 text-center font-mono text-[13px] text-ink2 " + className}>
      <span>{children}</span>
      {action}
    </div>
  );
}
