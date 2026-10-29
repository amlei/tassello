"use client";

import { Accordion, Button, Link } from "@heroui/react";
import { Download, Puzzle } from "reicon-react";
import NextLink from "next/link";
import React from "react";
import { ChromeIcon, EdgeIcon } from "./browser-icons";
import { useLatestRelease } from "./use-latest-release";
import { assetUrl } from "./site-paths";

type DownloadKey = "macos-arm" | "macos-intel" | "windows-x64" | "linux-x64" | "github";
type DownloadTarget = { platform: string; format: string; href: string | null };

type NavigatorUAData = {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, string>>;
};

const DOWNLOAD_TARGETS: Record<DownloadKey, DownloadTarget> = {
  "macos-arm": { platform: "macOS（Apple Silicon）", format: "DMG 安装包", href: null },
  "macos-intel": { platform: "macOS（Intel）", format: "DMG 安装包", href: null },
  "windows-x64": { platform: "Windows x64", format: "EXE 安装包", href: null },
  "linux-x64": { platform: "Linux x64", format: "AppImage", href: null },
  github: { platform: "GitHub Releases", format: "历史版本", href: "https://github.com/amlei/tassello/releases" },
};

const DOWNLOAD_CARDS = [
  { key: "macos-arm", title: "macOS", detail: "Apple Silicon · DMG", format: "DMG" },
  { key: "windows-x64", title: "Windows", detail: "x64 · 安装包", format: "EXE" },
] as const;

const RELEASES_URL = "https://github.com/amlei/tassello/releases";

function getWebGLRenderer(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  } catch {
    return "";
  }
}

async function detectDesktop(): Promise<DownloadKey> {
  const ua = navigator.userAgent || "";
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  let platform = uaData?.platform || navigator.platform || "";
  let architecture = "";

  if (typeof uaData?.getHighEntropyValues === "function") {
    try {
      const hints = await uaData.getHighEntropyValues(["architecture", "platform"]);
      platform = hints.platform || platform;
      architecture = hints.architecture || "";
    } catch {
      /* 探测失败时回退到 UA / GPU。 */
    }
  }

  if (platform === "Windows" || /Win/i.test(ua)) return "windows-x64";

  if (platform === "macOS" || /Mac|iPhone|iPad|iPod/i.test(ua)) {
    const renderer = getWebGLRenderer().toLowerCase();
    const evidence = [architecture, platform, navigator.platform || "", renderer].join(" ").toLowerCase();
    if (/\b(arm|aarch64)\b/.test(evidence) || renderer.includes("apple")) return "macos-arm";
    if (/\b(x86|x86-64|x64|intel)\b/.test(evidence)) return "macos-intel";
    return "macos-arm";
  }

  if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return "linux-x64";
  return "github";
}

function AppleMark(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor" aria-hidden="true">
      <path d="M16.7 12.9c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.1-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3.1 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.6-1-2.7-3.8zM14.4 5.3c.7-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.5z" />
    </svg>
  );
}

function WindowsMark(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden="true">
      <path d="M3 5.5l7.6-1v7.1H3V5.5zm0 13l7.6 1v-7H3v6zm8.9 1.1L21 21v-8.4h-9.1v7zm0-15.2v7.1H21V3l-9.1 1.4z" />
    </svg>
  );
}

export function DownloadPicker() {
  const [detected, setDetected] = React.useState<DownloadKey | null>(null);
  const releaseVersion = useLatestRelease();

  React.useEffect(() => {
    let cancelled = false;
    detectDesktop().then((key) => {
      if (!cancelled) setDetected(key);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const startTarget = (key: DownloadKey) => {
    const href = DOWNLOAD_TARGETS[key].href;
    if (href) window.location.href = href;
  };

  const startDownload = () => {
    if (detected) startTarget(detected);
  };

  return (
    <>
      <div className="download-hero">
        <div>
          <p className="eyebrow">桌面工作台 · Obsidian 插件 · 浏览器扩展 v{releaseVersion}</p>
          <h1 id="download-title">下载 <em>Onda</em>，<br />让发布更有序。</h1>
          <p className="subtitle">桌面工作台、Obsidian 插件和 Chrome / Edge 发布扩展的官方入口。三者共用本机后端与同一条浏览器发布链路。</p>

          <div className="download-action-row">
            <Button
              className="download-primary"
              variant="tertiary"
              onPress={startDownload}
              aria-label="下载"
            >
              <span className="download-primary-icon" aria-hidden="true">
                <Download size={24} strokeWidth={1.9} />
              </span>
              <span className="download-primary-label">
                <strong>下载</strong>
              </span>
            </Button>
            <NextLink className="download-secondary" href="#obsidian-download">
              安装 Obsidian 插件
            </NextLink>
            <NextLink className="download-secondary" href="#extension-download">
              安装浏览器扩展
            </NextLink>
          </div>

          <div className="download-meta">
            <span className="download-version-pill">桌面 v{releaseVersion}</span>
            <span className="download-version-pill">Obsidian v{releaseVersion}</span>
            <span className="download-version-pill">扩展 v{releaseVersion}</span>
            <NextLink href="/changelog">更新日志</NextLink>
            <Link className="download-external-link" href={RELEASES_URL} target="_blank" rel="noopener">
              GitHub Releases
            </Link>
          </div>
        </div>

        <div className="download-visual" aria-hidden="true">
          <div className="download-desktop-shot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl("/assets/screenshots/01-editor-preview.png")} alt="" width={3840} height={2400} />
          </div>
          <span className="download-surface-chip">Desktop</span>
          <div className="download-obsidian-shot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl("/assets/screenshots/07-obsidian-publish-image.png")} alt="" width={1716} height={1606} />
          </div>
          <span className="download-surface-chip obsidian">Obsidian</span>
        </div>
      </div>

      <div className="download-picker">
        <div className="download-picker-head">
          <div>
            <h2>选择获取方式</h2>
            <p className="section-copy">桌面安装包按系统架构区分；Obsidian 插件通过插件目录安装；浏览器扩展由桌面端连接并自动完成本机配对。</p>
          </div>
        </div>

        <div className="download-grid">
          <article className="download-surface">
            <div className="download-surface-top">
              <span className="download-surface-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width={24} height={24} fill="none">
                  <rect x="2.75" y="4.75" width="18.5" height="12.5" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M9 20.25h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </span>
              <span className="download-version-pill">v{releaseVersion}</span>
            </div>
            <h3>桌面安装包</h3>
            <p>上方按钮已按你的系统与芯片推荐。也可以在下面手动切换目标。</p>

            <div className="download-cards" role="group" aria-label="桌面下载平台选择">
          {DOWNLOAD_CARDS.map((item) => {
            const Icon = item.key === "macos-arm" ? AppleMark : WindowsMark;
            return (
              <Button
                key={item.key}
                className="download-card"
                variant="tertiary"
                onPress={() => startTarget(item.key)}
                aria-label={`直接下载 ${DOWNLOAD_TARGETS[item.key].platform}`}
              >
                <span className="download-card-top">
                  <span className="download-os-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  {detected === item.key ? <span className="download-badge">推荐</span> : null}
                </span>
                <span className="download-card-title">{item.title}</span>
                <span className="download-card-detail">{item.detail}</span>
                <span className="download-card-divider" aria-hidden="true" />
                <span className="download-line">
                  直接下载
                  <span className="download-format">{item.format}</span>
                </span>
                <span className="download-availability">安装包整理中</span>
              </Button>
            );
          })}
        </div>
          </article>

          <article className="download-surface" id="obsidian-download">
            <div className="download-surface-top">
              <span className="download-surface-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width={24} height={24} fill="none">
                  <path d="M4.75 19.25V6.5c0-1.5 1-2.5 2.5-2.75L11 3v16.25l-4.5.75c-1 .16-1.75-.35-1.75-1.25Z" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M11 19.25V3l5.75 1.4c1.1.28 1.75.98 1.75 2.1v11.6c0 1.05-.65 1.75-1.75 1.75L11 19.25Z" stroke="currentColor" strokeWidth="1.7" />
                </svg>
              </span>
              <span className="download-version-pill">v{releaseVersion}</span>
            </div>
            <h3>Obsidian 插件</h3>
            <p>把当前 Vault 中的 Markdown 交给本机发布服务，发布状态和任务与桌面工作台共用。</p>

            <Accordion className="download-guide" hideSeparator>
              <Accordion.Item id="obsidian-operation-guide">
                <Accordion.Heading>
                  <Accordion.Trigger className="download-guide-trigger">
                    操作方法
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel className="download-guide-panel">
                  <Accordion.Body className="download-guide-body">
                    <p>将插件目录复制到你的 Vault，然后启用 <strong>Tassello Publisher</strong>。</p>
                    <code>.obsidian/plugins/tassello-publisher/</code>
                    <p>保持九漾 Onda 运行，然后在笔记右侧打开 <strong>九漾 Onda</strong> 面板。插件会通过本机 API 读取平台能力与账号状态。</p>
                    <p>选择内容类型和发布平台后创建任务；需要人工确认的平台会停在平台页面，不会由插件复制 Cookie 或维护第二套浏览器连接。</p>
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>

            <div className="download-github">
              <span>获取插件文件与安装说明</span>
              <Link className="download-external-link strong" href={RELEASES_URL} target="_blank" rel="noopener">
                GitHub Releases →
              </Link>
            </div>
          </article>

          <article className="download-surface" id="extension-download">
            <div className="download-surface-top">
              <span className="download-surface-icon" aria-hidden="true">
                <Puzzle size={24} strokeWidth={1.8} />
              </span>
              <span className="download-version-pill">v{releaseVersion}</span>
            </div>
            <h3>浏览器扩展</h3>
            <p>使用日常 Chrome 或 Edge 中的登录态发布。桌面工作台、Obsidian 和 CLI 共用这一条执行通道。</p>

            <Accordion className="download-guide" hideSeparator>
              <Accordion.Item id="extension-operation-guide">
                <Accordion.Heading>
                  <Accordion.Trigger className="download-guide-trigger">
                    安装与连接
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel className="download-guide-panel">
                  <Accordion.Body className="download-guide-body">
                    <p>打开九漾 Onda 的 <strong>设置 → 基础设置 → 浏览器扩展</strong>，选择 Chrome 或 Edge。</p>
                    <p>应用会打开对应浏览器的安装入口。安装完成后，扩展通过 Native Messaging 自动发现本机服务并连接。</p>
                    <p>无法访问扩展商店时，从 GitHub Releases 下载并解压扩展包，在开发者模式中“加载已解压的扩展程序”。</p>
                    <code>chrome://extensions · edge://extensions</code>
                    <div className="download-browser-actions" aria-label="支持的浏览器">
                      <span className="download-browser-link chrome">
                        <ChromeIcon size={16} />
                        Chrome
                      </span>
                      <span className="download-browser-link edge">
                        <EdgeIcon size={16} />
                        Edge
                      </span>
                    </div>
                    <figure className="download-extension-shot">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={assetUrl("/assets/screenshots/06-browser-extension-connected.png")} alt="九漾 Onda 浏览器扩展已连接，可以接收发布任务" width={708} height={510} decoding="async" />
                      <figcaption>连接成功后，popup 会显示当前浏览器与任务通道状态。</figcaption>
                    </figure>
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>

            <div className="download-github">
              <span>获取扩展包与版本说明</span>
              <Link className="download-external-link strong" href={RELEASES_URL} target="_blank" rel="noopener">
                GitHub Releases →
              </Link>
            </div>
          </article>
        </div>
      </div>
    </>
  );
}
