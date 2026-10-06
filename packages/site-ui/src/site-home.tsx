"use client";

import { Spinner, Tabs } from "@heroui/react";
import Link from "next/link";
import React from "react";
import { PlatformPhysics } from "./platform-physics";
import { useLatestRelease } from "./use-latest-release";
import { assetUrl } from "./site-paths";

const SURFACES = [
  {
    key: "desktop",
    version: "",
    title: "桌面工作台",
    description: "适合从零整理文章、贴图、视频和音频，并在发布前检查手机观感与平台适配。",
    points: ["统一内容库", "多平台队列", "手机预览"],
  },
  {
    key: "obsidian",
    version: "",
    title: "Obsidian 插件",
    description: "笔记已经留在 Obsidian 时，当前 Markdown 直接变成平台 payload，不需要先导入桌面库。",
    points: ["当前笔记", "Frontmatter", "状态写回"],
  },
];

const OBSIDIAN_SHOTS = [
  {
    key: "preview",
    title: "Payload 预览",
    image: assetUrl("/assets/screenshots/obsidian-publisher-4k.png"),
    alt: "Obsidian 插件在当前笔记右侧展示 Publisher payload 预览",
  },
  {
    key: "publish",
    title: "发布目标",
    image: assetUrl("/assets/screenshots/obsidian-publisher-publish-4k.png"),
    alt: "Obsidian 插件展示发布目标选择与 Chrome 授权提示",
  },
];

const WORKFLOW_STEPS = [
  {
    title: "创作与手机预览",
    detail: "写作、素材和移动端观感在同一内容项里完成。",
    image: assetUrl("/assets/screenshots/01-editor-preview.png"),
    alt: "Onda 编辑器界面，左侧编辑内容，右侧实时显示手机预览效果",
  },
  {
    title: "多平台适配",
    detail: "选择平台后自动处理排版、素材上传和字段填写。",
    image: assetUrl("/assets/screenshots/02-multi-platform-publish.png"),
    alt: "Onda 多平台发布设置界面，正在为一条内容选择多个目标平台",
  },
  {
    title: "发布队列",
    detail: "阶段、进度和需要人工确认的平台集中呈现。",
    image: assetUrl("/assets/screenshots/03-publish-queue.png"),
    alt: "Onda 发布队列界面，展示多个发布任务的阶段、进度和状态",
  },
];

const CONTROL_POINTS = [
  { title: "内容与账号先确认", detail: "发布前检查内容、素材和目标账号，降低误发风险。" },
  { title: "等待不是故障", detail: "扫码、验证或人工点击发布时，任务会停在明确确认位。" },
  { title: "进度集中可见", detail: "不用逐个平台打开后台，也能知道每条内容走到哪里。" },
];

export function SiteHome() {
  const mosaicRef = React.useRef<HTMLIFrameElement>(null);
  const themeStageRef = React.useRef<HTMLDivElement>(null);
  const edgeLineRef = React.useRef<SVGLineElement>(null);
  const [activeStep, setActiveStep] = React.useState(0);
  const [activeObsidianShot, setActiveObsidianShot] = React.useState(0);
  const [demoReady, setDemoReady] = React.useState(false);
  const releaseVersion = useLatestRelease();

  React.useEffect(() => {
    const frame = mosaicRef.current;
    const applyFrameTheme = (theme: string) => {
      try {
        frame?.contentWindow?.localStorage.setItem("onda-theme", theme);
        const root = frame?.contentDocument?.documentElement;
        if (root) root.dataset.theme = theme;
      } catch { /* 原型加载前忽略。 */ }
    };
    const onFrameLoad = () => {
      applyFrameTheme(document.documentElement.dataset.theme || "light");
      setDemoReady(true);
    };
    if (frame?.contentDocument?.readyState === "complete") setDemoReady(true);
    frame?.addEventListener("load", onFrameLoad);
    applyFrameTheme(document.documentElement.dataset.theme || "light");

    return () => frame?.removeEventListener("load", onFrameLoad);
  }, []);

  React.useEffect(() => {
    const stage = themeStageRef.current;
    const edgeLine = edgeLineRef.current;
    const setEdge = (px: number, py: number) => {
      if (!stage) return;
      const x = Math.max(0, Math.min(1, px));
      const y = Math.max(0, Math.min(1, py));
      const slope = .16 * Math.sin(Math.PI * x);
      const top = x - slope * (1 - y);
      const bottom = x + slope * y;
      stage.style.setProperty("--edge-x-top", `${(top * 100).toFixed(3)}%`);
      stage.style.setProperty("--edge-x-bottom", `${(bottom * 100).toFixed(3)}%`);
      edgeLine?.setAttribute("x1", (top * 100).toFixed(3));
      edgeLine?.setAttribute("x2", (bottom * 100).toFixed(3));
    };
    const onStageMove = (event: PointerEvent) => {
      const rect = stage?.getBoundingClientRect();
      if (!rect) return;
      setEdge((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
    };
    stage?.addEventListener("pointermove", onStageMove);
    setEdge(.47, .5);
    return () => stage?.removeEventListener("pointermove", onStageMove);
  }, []);

  return (
    <>
      <section className="hero shell" id="top" aria-labelledby="hero-title">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">面向创作者与运营人员</p>
            <h1 id="hero-title">写一次，<br /><em>两端发布</em>。</h1>
            <p className="subtitle">桌面工作台管理素材、预览与队列；Obsidian 插件直接读取当前笔记并生成平台 payload。两条入口共享同一条发布链路。</p>
            <div className="cta-row">
              <Link className="btn btn-primary" href="/download">下载</Link>
              <Link className="btn btn-ghost" href="#obsidian">了解 Obsidian 插件</Link>
            </div>
          </div>

          <aside className="hero-surfaces" aria-label="两个产品入口">
            {SURFACES.map((surface, index) => (
              <Link
                key={surface.key}
                className={`hero-surface-card${index === 0 ? " primary" : ""}`}
                href={surface.key === "desktop" ? "/download" : "#obsidian"}
              >
                <span className="hero-surface-top">
                  <span className="surface-icon" aria-hidden="true">
                    {surface.key === "desktop" ? (
                      <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
                        <rect x="2.75" y="4.75" width="18.5" height="12.5" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
                        <path d="M9 20.25h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
                        <path d="M4.75 19.25V6.5c0-1.5 1-2.5 2.5-2.75L11 3v16.25l-4.5.75c-1 .16-1.75-.35-1.75-1.25Z" stroke="currentColor" strokeWidth="1.7" />
                        <path d="M11 19.25V3l5.75 1.4c1.1.28 1.75.98 1.75 2.1v11.6c0 1.05-.65 1.75-1.75 1.75L11 19.25Z" stroke="currentColor" strokeWidth="1.7" />
                      </svg>
                    )}
                  </span>
                  <span className="hero-surface-index">{String(index + 1).padStart(2, "0")}</span>
                </span>
                <span className="hero-surface-eyebrow">v{releaseVersion}</span>
                <strong className="hero-surface-title">{surface.title}</strong>
                <span className="hero-surface-text">
                  {surface.key === "desktop"
                    ? "适合从零整理素材，先检查观感，再进入平台适配。"
                    : "适合已有 Obsidian 笔记，直接转换 payload 并写回状态。"}
                </span>
                <span className="hero-surface-points">{surface.points.join(" · ")}</span>
                <span className="hero-surface-action">
                  {surface.key === "desktop" ? "下载桌面版" : "查看插件"}
                  <svg viewBox="0 0 24 24" width={15} height={15} fill="none" aria-hidden="true">
                    <path d="M5 12h14m0 0-5-5m5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            ))}
          </aside>
        </div>
      </section>

      <section className="section stage-section" id="motion" aria-label="产品动线演示">
        <div className="shell">
          <div className="stage motion-stage">
            <iframe src="/experience/intro-canvas/index.html" title="Onda 双端产品操作动画，展示内容准备、平台分发和发布确认" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="section stage-section" id="demo" aria-label="可交互产品演示">
        <div className="shell">
          <div className="stage">
            <iframe
              ref={mosaicRef}
              id="mosaicFrame"
              src="/experience/mosaic/index.html"
              title="Onda 编辑器可交互演示，可切换导航、编辑内容和查看手机预览"
              loading="lazy"
              onLoad={() => setDemoReady(true)}
            />
            <div className="proto-loading" hidden={demoReady}>
              <div>
                <Spinner size="sm" />
                <span>可交互演示加载中</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="workflow" aria-labelledby="workflow-title">
        <div className="shell">
          <div className="section-head">
            <div>
              <h2 id="workflow-title">三步完成发布</h2>
              <p className="section-copy">先确认观感，再完成平台适配，最后在同一个队列里掌握进度。</p>
            </div>
          </div>
          <div className="workflow-grid">
            <Tabs.Root
              className="workflow-tabs"
              orientation="vertical"
              selectedKey={String(activeStep)}
              onSelectionChange={(key) => setActiveStep(Number(key))}
            >
              <Tabs.List className="workflow-rail" aria-label="工作台使用步骤">
                {WORKFLOW_STEPS.map((step, index) => (
                  <Tabs.Tab
                    key={step.title}
                    id={String(index)}
                    className={`workflow-tab${index === activeStep ? " selected" : ""}`}
                  >
                    <span className="workflow-step-top">
                      <span className="workflow-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                      <span className="workflow-title">{step.title}</span>
                    </span>
                    <span className="workflow-copy"><span>{step.detail}</span></span>
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              <Tabs.Panel className="workflow-stage" id={String(activeStep)}>
                {WORKFLOW_STEPS.map((step, index) => (
                  <figure
                    key={step.title}
                    className={`workflow-panel${index === activeStep ? " current" : ""}`}
                    aria-hidden={index !== activeStep}
                  >
                    <img src={assetUrl(step.image)} width={3840} height={2400} alt={step.alt} decoding="async" />
                  </figure>
                ))}
              </Tabs.Panel>
            </Tabs.Root>
          </div>
        </div>
      </section>

      <section className="section" id="obsidian" aria-labelledby="obsidian-title">
        <div className="shell">
          <div className="section-head">
            <div>
              <h2 id="obsidian-title">Obsidian 里，笔记直接进入发布</h2>
              <p className="section-copy">当前 Markdown 读取为稿件，Frontmatter 决定类型与目标；预览展示真实 payload，而不是复刻平台客户端。</p>
            </div>
          </div>
          <Tabs.Root
            className="obsidian-tabs"
            selectedKey={String(activeObsidianShot)}
            onSelectionChange={(key) => setActiveObsidianShot(Number(key))}
          >
            <Tabs.List className="gallery-tabs" aria-label="Obsidian 插件演示">
              {OBSIDIAN_SHOTS.map((shot, index) => (
                <Tabs.Tab
                  key={shot.key}
                  id={String(index)}
                  className={`gallery-tab${index === activeObsidianShot ? " selected" : ""}`}
                >
                  {shot.title}
                </Tabs.Tab>
              ))}
            </Tabs.List>
            <Tabs.Panel className="gallery-panel" id={String(activeObsidianShot)}>
              {OBSIDIAN_SHOTS.map((shot, index) => (
                <figure
                  key={shot.key}
                  className={`gallery-shot-frame${index === activeObsidianShot ? " current" : ""}`}
                  aria-hidden={index !== activeObsidianShot}
                >
                  <img src={assetUrl(shot.image)} width={3840} height={2400} alt={shot.alt} decoding="async" />
                </figure>
              ))}
            </Tabs.Panel>
          </Tabs.Root>
        </div>
      </section>

      <section className="section" id="appearance" aria-label="主题观感对比">
        <div className="shell theme-compact">
          <div className="theme-stage" ref={themeStageRef}>
            <figure className="stage-layer light">
              <img src={assetUrl("/assets/screenshots/04-platform-settings-light.png")} width={3840} height={2400} alt="Onda 浅色主题的平台设置界面" />
            </figure>
            <figure className="stage-layer dark" aria-hidden="true">
              <img src={assetUrl("/assets/screenshots/05-platform-settings-dark.png")} width={3840} height={2400} alt="Onda 深色主题的平台设置界面" />
            </figure>
            <svg className="stage-edge" viewBox="0 0 100 62.5" preserveAspectRatio="none" aria-hidden="true">
              <line ref={edgeLineRef} x1="42" y1="0" x2="58" y2="62.5" />
            </svg>
          </div>
          <div>
            <h2>界面跟随你的工作光线。</h2>
            <p className="section-copy">移动左侧画面，检查同一设置页在浅色和深色下的层级、对比和焦点状态。</p>
          </div>
        </div>
      </section>

      <section className="section platform-section" id="platforms" aria-labelledby="platforms-title">
        <div className="shell">
          <div className="section-head">
            <div>
              <h2 id="platforms-title">覆盖你实际在用的平台</h2>
              <p className="section-copy">已接入的渠道直接可用，规划中渠道也会进入同一条发布流程。</p>
            </div>
          </div>
          <PlatformPhysics />
          <div className="platform-lists">
            <p className="platform-list"><strong>已支持：</strong>微信公众号、微博、小红书、知乎、X、即刻、豆瓣、小宇宙、喜马拉雅、荔枝播客。</p>
            <p className="platform-list"><span>规划中：抖音、B站、头条号、百家号。具体能力以设置页显示为准。</span></p>
          </div>
        </div>
      </section>

      <section className="section" id="control" aria-labelledby="control-title">
        <div className="shell">
          <div className="control-card">
            <div>
              <h2 id="control-title">系统搬运，<br />你确认关键动作。</h2>
              <p className="section-copy">Onda 不追求完全无人值守。它减少重复上传和复制粘贴，同时把发布责任留在你手里。</p>
              <div className="final-actions">
                <Link className="btn btn-primary" href="/download">下载</Link>
                <Link className="btn btn-ghost" href="/changelog">查看更新日志</Link>
              </div>
            </div>
            <div className="control-points">
              {CONTROL_POINTS.map((point) => (
                <article key={point.title} className="point">
                  <i aria-hidden="true">✓</i>
                  <div>
                    <strong>{point.title}</strong>
                    <span>{point.detail}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
