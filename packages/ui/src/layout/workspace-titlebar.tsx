import React from "react";
import { Layout, Search } from "reicon-react";
import { IconButton } from "../primitives";

export function WorkspaceTitleBar({
  title,
  collapsed,
  onToggle,
  onSearch,
  action,
}: {
  title: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  onSearch: () => void;
  action?: React.ReactNode;
}) {
  return (
    <header
      className={"workspace-titlebar" + (collapsed ? " workspace-titlebar-collapsed" : "")}
      aria-label="窗口栏"
    >
      <div className="workspace-safe" aria-hidden="true" />
      <IconButton
        className="workspace-toggle data-[hovered=true]:bg-hover data-[hovered=true]:text-ink"
        aria-expanded={!collapsed}
        aria-controls="workspace-rail"
        label={collapsed ? "展开侧栏" : "收起侧栏"}
        onPress={onToggle}
      >
        <Layout size={15} strokeWidth={1.9} />
      </IconButton>
      <IconButton
        className="workspace-search data-[hovered=true]:bg-hover data-[hovered=true]:text-ink"
        label="搜索稿子"
        onPress={onSearch}
      >
        <Search size={15} strokeWidth={2.2} />
      </IconButton>
      <div className="workspace-rail-indent" aria-hidden="true" />
      <div className="workspace-context">
        <h1 className="workspace-context-title">{title}</h1>
      </div>
      <div className="workspace-drag" aria-hidden="true" />
      {action}
    </header>
  );
}
