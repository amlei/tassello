import type { ReactNode } from "react";
import { SiteChrome } from "@/components/site/site-chrome";
import "./site.css";

export const metadata = {
  title: "九漾 Onda · 写一次，两端发布",
  description:
    "Onda 提供桌面工作台和 Obsidian 插件两个入口：统一管理内容，适配多平台 payload，并保留关键发布确认。",
};

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
