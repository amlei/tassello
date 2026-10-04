/* 侧栏折叠状态 —— 专注编辑（⌘\ / 红绿灯旁按钮）。
 * 模块级 store：跨路由保持，Rail 与编辑器页共享 */
"use client";

import { useSyncExternalStore } from "react";

let collapsed = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function toggleSidebar(): void {
  collapsed = !collapsed;
  emit();
}

export function setSidebarCollapsed(v: boolean): void {
  if (collapsed === v) return;
  collapsed = v;
  emit();
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => collapsed,
    () => false,
  );
}
