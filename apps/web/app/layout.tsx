import type { Metadata } from "next";
import { ThemeScript } from "@/components/theme";
import { DesktopChrome } from "@/components/desktop-chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "九漾 Onda",
  description: "稿子是主体，平台只是出口",
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
