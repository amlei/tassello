import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "铺稿 · 写一次，铺到多个平台",
  description: "铺稿是一个多平台内容发布工作台：创作者写一次，铺到多个平台。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full font-sans">
      <body className="min-h-full bg-bg font-sans text-ink antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
