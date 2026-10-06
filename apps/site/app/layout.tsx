import type { Metadata } from "next";
import { ThemeScript } from "@tassello/site-ui/theme";
import { DesktopChrome } from "../../../apps/web/components/desktop-chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "九漾 Onda · 写一次，两端发布",
  description:
    "Onda 提供桌面工作台和 Obsidian 插件两个入口：统一管理内容，适配多平台 payload，并保留关键发布确认。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeScript />
        <DesktopChrome />
        {children}
      </body>
    </html>
  );
}
