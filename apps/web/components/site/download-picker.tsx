"use client";

import { Accordion, Button, Link } from "@heroui/react";
import { Download } from "reicon-react";
import NextLink from "next/link";
import React from "react";
import { ChromeIcon, EdgeIcon } from "@/components/browser-icons";
import { useLatestRelease } from "@/components/site/use-latest-release";

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
const CHROME_INSPECT_URL = "chrome://inspect/#remote-debugging";
const EDGE_INSPECT_URL = "edge://inspect/#remote-debugging";

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
          <p className="eyebrow">桌面工作台 · Obsidian 插件 v{releaseVersion}</p>
          <h1 id="download-title">下载 <em>Onda</em>，<br />让发布更有序。</h1>
          <p className="subtitle">桌面工作台与 Obsidian 插件的官方入口。桌面安装包按系统芯片推荐，Obsidian 插件复制到 Vault 后启用。</p>

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
          </div>

          <div className="download-meta">
            <span className="download-version-pill">桌面 v{releaseVersion}</span>
            <span className="download-version-pill">插件 v{releaseVersion}</span>
            <NextLink href="/changelog">更新日志</NextLink>
            <Link className="download-external-link" href={RELEASES_URL} target="_blank" rel="noopener">
              GitHub Releases
            </Link>
          </div>
        </div>

        <div className="download-visual" aria-hidden="true">
          <div className="download-desktop-shot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/screenshots/01-editor-preview.png" alt="" width={3840} height={2400} />
          </div>
          <span className="download-surface-chip">Desktop</span>
          <div className="download-obsidian-shot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/screenshots/obsidian-publisher-4k.png" alt="" width={3840} height={2400} />
          </div>
          <span className="download-surface-chip obsidian">Obsidian</span>
        </div>
      </div>

      <div className="download-picker">
        <div className="download-picker-head">
          <div>
            <h2>选择获取方式</h2>
            <p className="section-copy">桌面安装包按系统架构区分；Obsidian 插件目前通过插件目录手动安装。</p>
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
            <p>插件目前是桌面端 Obsidian 插件，安装后从命令或侧栏打开 Publisher。</p>

            <Accordion className="download-guide" hideSeparator>
              <Accordion.Item id="operation-guide">
                <Accordion.Heading>
                  <Accordion.Trigger className="download-guide-trigger">
                    操作方法
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel className="download-guide-panel">
                  <Accordion.Body className="download-guide-body">
                    <p>将插件目录复制到你的 Vault，然后启用 <strong>Tassello Publisher</strong>。</p>
                    <code>.obsidian/plugins/tassello-publisher/</code>
                    <p>授权前，先在浏览器打开 Remote debugging，并允许当前浏览器实例被外部应用控制。</p>
                    <div className="download-browser-actions">
                      <Link
                        className="download-browser-link chrome"
                        href={CHROME_INSPECT_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ChromeIcon size={16} />
                        Chrome
                      </Link>
                      <Link
                        className="download-browser-link edge"
                        href={EDGE_INSPECT_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <EdgeIcon size={16} />
                        Edge
                      </Link>
                    </div>
                    <figure className="download-chrome-shot">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/assets/screenshots/chrome-remote-debugging.png" alt="Chrome Remote debugging 页面，Allow remote debugging for this browser instance 已勾选" width={1472} height={802} decoding="async" />
                      <figcaption>在 Chrome 中勾选 Allow remote debugging，随后回到 Obsidian 完成连接。Edge 使用相同地址。</figcaption>
                    </figure>
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
        </div>
      </div>
    </>
  );
}
