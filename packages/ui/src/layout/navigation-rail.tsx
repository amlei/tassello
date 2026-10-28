import React from "react";

export function NavigationRail({
  collapsed = false,
  id,
  label,
  className = "",
  children,
}: {
  collapsed?: boolean;
  id?: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <aside
      id={id}
      className={`flex h-full min-h-0 flex-none flex-col overflow-hidden bg-rail pt-[18px] pb-3.5 transition-[width] duration-200 ease-out ${
        collapsed ? "w-0 px-0" : "w-[236px] px-3.5"
      } ${className}`}
      aria-label={label}
      aria-hidden={collapsed || undefined}
      inert={collapsed}
    >
      <div className="flex w-[208px] flex-none flex-col gap-3.5" style={{ minHeight: 0, flex: 1 }}>
        {children}
      </div>
    </aside>
  );
}
