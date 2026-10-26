import React from "react";

export function SettingRow({
  leading,
  title,
  description,
  meta,
  status,
  action,
  className = "",
}: {
  leading: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  status?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"grid min-h-16 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-hover " + className}>
      <span className="flex h-[34px] w-[34px] flex-none items-center justify-center">{leading}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 text-[12px] font-bold text-ink">
          {title}
          {status}
        </span>
        {description ? <span className="truncate text-[11.5px] text-ink2">{description}</span> : null}
        {meta ? <span className="truncate text-[11px] text-ink2">{meta}</span> : null}
      </span>
      {action ? <span className="flex flex-none items-center justify-end">{action}</span> : null}
    </div>
  );
}
