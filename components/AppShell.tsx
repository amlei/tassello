"use client";

// 应用外壳：状态提供者 + 左栏固定导航 + 顶部全局进度条。
// 窄屏下左栏收为顶部横向导航。

import type { ReactNode } from "react";
import { AppProvider } from "@/lib/store";
import { Sidebar } from "./Sidebar";
import { GlobalProgress } from "./GlobalProgress";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <GlobalProgress />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </AppProvider>
  );
}
