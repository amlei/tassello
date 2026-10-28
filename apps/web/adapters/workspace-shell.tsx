/* workspace-shell —— Next.js 工作台适配器：路由、搜索、快捷键与窗口交互。
 * 页面只提供内容与上下文；不再各自模拟标题栏或处理红绿灯让位。 */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { TYPE_META, type ContentType, type PlatformDTO } from "@tassello/shared";
import { AppButton } from "@tassello/ui/primitives";
import { WorkspaceShell as WorkbenchShell, WorkspaceTitleBar } from "@tassello/ui/layout";
import { Rail } from "../features/navigation/navigation-rail";
import { SearchModal } from "../features/search/search-modal";
import { Add } from "reicon-react";
import { setSidebarCollapsed, toggleSidebar, useSidebarCollapsed } from "./sidebar-state";

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
    <WorkbenchShell
      screenLabel={screenLabel}
      titleBar={(
        <WorkspaceTitleBar
          title={context.title}
          collapsed={collapsed}
          onToggle={toggleSidebar}
          onSearch={() => setSearchOpen(true)}
          action={newScope && onNew ? (
          <AppButton
            tone="primary"
            className="flex-none gap-2 whitespace-nowrap rounded-full px-[15px] py-[7px] text-[13px] font-black text-white transition-[translate,filter] duration-150 data-[hovered=true]:-translate-y-px data-[hovered=true]:brightness-105"
            style={{ background: TYPE_META[newScope].color }}
            onPress={() => void onNew(newScope)}
          >
            <Add size={13} strokeWidth={3.3} /> 新建{TYPE_META[newScope].zh}
          </AppButton>
          ) : undefined}
        />
      )}
      rail={(
        <Rail
          active={active}
          counts={counts}
          runningCount={runningCount}
          queueCount={queueCount}
          platforms={platforms}
          guard={guard}
        />
      )}
    >
      {children}

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
    </WorkbenchShell>
  );
}
