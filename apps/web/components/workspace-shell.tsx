/* workspace-shell —— 全局工作台壳：唯一拥有窗口栏、拖拽区、侧栏折叠开关。
 * 页面只提供内容与上下文；不再各自模拟标题栏或处理红绿灯让位。 */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { TYPE_META, type ContentType, type PlatformDTO } from "@tassello/shared";
import { Button } from "@heroui/react";
import { Rail } from "./rail";
import { SearchModal } from "./search-modal";
import { Add, Layout, Search } from "reicon-react";
import { setSidebarCollapsed, toggleSidebar, useSidebarCollapsed } from "./sidebar-toggle";

export type WorkspaceContext = {
  title: string;
};

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
  newScope,
  onNew,
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
  /** 内容库传入后才在标题栏右侧显示当前类型的新建按钮 */
  newScope?: ContentType;
  onNew?: (type: ContentType) => void | Promise<void>;
}) {
  const collapsed = useSidebarCollapsed();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = React.useState(false);

  /* ⌘\ 切侧栏；⌘K 打开全局搜索弹窗。 */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
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
        <Button
          variant="ghost"
          className="workspace-toggle data-[hovered=true]:bg-hover data-[hovered=true]:text-ink"
          aria-expanded={!collapsed}
          aria-controls="workspace-rail"
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
          onPress={toggleSidebar}
        >
          <Layout size={15} strokeWidth={1.9} />
        </Button>

        <Button
          variant="ghost"
          className="workspace-search data-[hovered=true]:bg-hover data-[hovered=true]:text-ink"
          aria-label="搜索稿子"
          onPress={() => setSearchOpen(true)}
        >
          <Search size={15} strokeWidth={2.2} />
        </Button>

        {/* 展开态把上下文推到侧栏右边界；折叠态为 0，让它紧跟窗口开关。 */}
        <div className="workspace-rail-indent" aria-hidden="true" />

        {/* 当前视图的轻量上下文：页面大标题不再重复占内容区左上角 */}
        <div className="workspace-context">
          <h1 className="workspace-context-title">{context.title}</h1>
        </div>

        {/* 唯一的窗口拖拽热区：永远只落在空白条上，不覆盖任何交互控件 */}
        <div className="workspace-drag" aria-hidden="true" />
        {newScope && onNew && (
          <Button
            className="flex-none gap-2 whitespace-nowrap rounded-full px-[15px] py-[7px] text-[13px] font-black text-white transition-[translate,filter] duration-150 data-[hovered=true]:-translate-y-px data-[hovered=true]:brightness-105"
            style={{ background: TYPE_META[newScope].color }}
            onPress={() => void onNew(newScope)}
          >
            <Add size={13} strokeWidth={3.3} /> 新建{TYPE_META[newScope].zh}
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 bg-rail">
        <Rail
          active={active}
          counts={counts}
          runningCount={runningCount}
          queueCount={queueCount}
          platforms={platforms}
          guard={guard}
        />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col rounded-tl-[14px] bg-paper">{children}</main>
      </div>

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
        onOpen={(post) => {
          setSearchOpen(false);
          const open = () => router.push(`/editor/${post.id}`);
          if (guard) guard(open);
            else open();
          }}
        />
      )}
    </div>
  );
}
