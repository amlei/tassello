"use client";

import Link from "next/link";
import { Button } from "@heroui/react";
import { Moon, Sun } from "reicon-react";
import React from "react";
import { setThemePref } from "./theme";
import { assetUrl } from "./site-paths";

const NAV_ITEMS = [
  { href: "/changelog", label: "更新日志" },
];

function applySiteTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  const frame = document.querySelector<HTMLIFrameElement>("#mosaicFrame");
  try {
    frame?.contentWindow?.localStorage.setItem("onda-theme", theme);
    const root = frame?.contentDocument?.documentElement;
    if (root) root.dataset.theme = theme;
  } catch {
    /* 原型尚未就绪时忽略。 */
  }
}

export function SiteHeader() {
  const toggleTheme = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setThemePref(next);
    applySiteTheme(next);
  };

  return (
    <header className="header">
      <div className="shell header-shell">
        <Link className="brand" href="/" aria-label="九漾 Onda 首页">
          <img className="brand-logo" src={assetUrl("/logo.svg")} alt="" width={30} height={30} />
          <span>
            九漾 Onda<small>tassello</small>
          </span>
        </Link>
        <div className="header-actions">
          <nav className="nav" aria-label="页面导航">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <Link className="btn btn-primary header-cta" href="/download">
            下载
          </Link>
          <Button
            className="theme-toggle"
            isIconOnly
            aria-label="切换主题"
            variant="tertiary"
            onPress={toggleTheme}
          >
            <Moon className="theme-icon-light" size={19} strokeWidth={1.7} />
            <Sun className="theme-icon-dark" size={19} strokeWidth={1.7} />
          </Button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="shell footer-shell">
        <div className="footer-brand">
          <strong>九漾 Onda</strong>
          <span>让多平台发布更有序。</span>
        </div>
        <nav className="footer-nav" aria-label="页脚链接">
          <a href="https://github.com/amlei/tassello" target="_blank" rel="noopener">GitHub</a>
          <a href="mailto:lixiang.altr@qq.com">lixiang.altr@qq.com</a>
          <a href="https://github.com/amlei/amlei-skills" target="_blank" rel="noopener">amlei-skills</a>
          <Link href="/changelog">更新日志</Link>
          <a href="#top">返回顶部</a>
        </nav>
      </div>
    </footer>
  );
}

export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-page">
      <a className="skip-link" href="#main">跳到主要内容</a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
