/* DesktopChrome —— 桌面壳（Electron）适配：把运行环境标记到 <html>，
 * 布局/拖动行为全部由 globals.css 按 data-tassello-desktop 生效。
 * 用 UA 探测，不依赖 preload 注入时机；纯浏览器环境不挂标记，零影响 */
"use client";

import React from "react";

export function DesktopChrome() {
  React.useEffect(() => {
    const ua = navigator.userAgent;
    if (!ua.includes("Electron")) return;
    const root = document.documentElement;
    root.dataset.tasselloDesktop = /Macintosh/.test(ua) ? "darwin" : "other";
    return () => {
      delete root.dataset.tasselloDesktop;
    };
  }, []);
  return null;
}
