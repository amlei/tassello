import type { Metadata } from "next";
import { DownloadPicker } from "@tassello/site-ui/download-picker";

export const metadata: Metadata = {
  title: "下载九漾 Onda 桌面工作台",
  description:
    "下载 Onda 桌面工作台，或获取 Obsidian Publisher 插件，让当前笔记进入同一条多平台发布链路。",
};

export default function DownloadPage() {
  return (
    <section className="section" id="download" aria-labelledby="download-title">
      <div className="shell">
        <DownloadPicker />
      </div>
    </section>
  );
}
