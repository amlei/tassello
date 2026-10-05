/* workspace-shell —— 全局工作台壳：唯一拥有窗口栏、拖拽区、侧栏折叠开关。
 * 页面只提供内容与上下文；不再各自模拟标题栏或处理红绿灯让位。 */
"use client";

import React from "react";
import type { PlatformDTO } from "@tassello/shared";
import { Rail } from "./rail";
import { setSidebarCollapsed, toggleSidebar, useSidebarCollapsed } from "./sidebar-toggle";

export type WorkspaceContext = {
  title: string;
  meta?: string;
};

function PanelIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.8" y="2.4" width="12.4" height="11.2" rx="2.2" />
      <path d="M6.2 2.4v11.2" />
    </svg>
  );
}

export function WorkspaceShell({
  active,
  counts,
  runningCount,
  queueCount,
  platforms,
  guard,
  context,
  screenLabel,
  children,
}: {
  active: string;
  counts: Record<string, number>;
  runningCount: number;
  queueCount: number;
  platforms: PlatformDTO[];
  /** 导航守卫（编辑器脏状态时由外层弹确认）：包住 Rail 内所有会离开当前页的入口 */
  guard?: (nav: () => void) => void;
  context: WorkspaceContext;
  screenLabel?: string;
  children: React.ReactNode;
}) {
  const collapsed = useSidebarCollapsed();

  /* ⌘\（Windows Ctrl+\）与 TitleBar 开关共享同一个唯一入口 */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* 离开编辑器时恢复；进入编辑器由 EditorScreen 显式设为专注态 */
  React.useEffect(() => () => setSidebarCollapsed(false), []);

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden" data-screen-label={screenLabel}>
      <header
        className={"workspace-titlebar" + (collapsed ? " workspace-titlebar-collapsed" : "")}
        aria-label="窗口栏"
      >
        {/* macOS 桌面壳里这是 hiddenInset 红绿灯的保留区；Web/Windows 宽度为 0 */}
        <div className="workspace-safe" aria-hidden="true" />
        <button
          type="button"
          onClick={toggleSidebar}
          className="workspace-toggle"
          aria-expanded={!collapsed}
          aria-controls="workspace-rail"
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
          title={collapsed ? "展开侧栏 (⌘\\)" : "收起侧栏 (⌘\\)"}
        >
          <PanelIcon />
        </button>

        {/* 展开态把上下文推到侧栏右边界；折叠态为 0，让它紧跟窗口开关。 */}
        <div className="workspace-rail-indent" aria-hidden="true" />

        {/* 当前视图的轻量上下文：页面大标题不再重复占内容区左上角 */}
        <div className="workspace-context">
          <h1 className="workspace-context-title">{context.title}</h1>
          {context.meta && <span className="workspace-context-meta">{context.meta}</span>}
        </div>

        {/* 唯一的窗口拖拽热区：永远只落在空白条上，不覆盖任何交互控件 */}
        <div className="workspace-drag" aria-hidden="true" />
      </header>

      <div className="flex min-h-0 flex-1">
        <Rail
          active={active}
          counts={counts}
          runningCount={runningCount}
          queueCount={queueCount}
          platforms={platforms}
          guard={guard}
        />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
