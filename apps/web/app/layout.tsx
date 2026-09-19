import type { Metadata } from "next";
import { ThemeScript } from "@/components/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "九漾 Onda · content workbench",
  description: "稿子是主体，平台只是出口",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeScript />
        {children}
      </body>
    </html>
  );
}
