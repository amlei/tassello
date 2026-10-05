import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Notice } from "obsidian";
import { createSourceDraft, readActiveSource } from "../core/source/source-resolver";
import { parseImageEmbeds } from "../core/source/image-embeds";
import { platformSupportsType, previewHtmlForPlatform, renderForPlatform } from "../core/render/renderers";
import {
  PLATFORMS,
  PLATFORM_BY_ID,
  type BrowserStatus,
  type ContentType,
  type Finding,
  type PlatformCapability,
  type PlatformId,
  type PublishTask,
  type SourceDraft,
} from "../core/types";
import type { DefaultChromeManager } from "../core/browser/default-chrome";
import type { TaskEngine } from "../core/tasks/task-engine";
import { sharedAdapter } from "../core/platform/shared-registry";
import { PlatformMark } from "@tassello/ui/platform-icons";
import type { PublisherServices } from "./publisher-view";

type ViewMode = "preview" | "publish" | "defaults";
type PublisherAppProps = { services: PublisherServices; host: HTMLElement };

const CONTENT_TYPES: ContentType[] = ["article", "image", "video", "audio"];
const CONTENT_LABELS: Record<ContentType, string> = {
  article: "文章",
  image: "贴图",
  video: "视频",
  audio: "音频",
};
const CONTENT_COLORS: Record<ContentType, string> = {
  article: "#2C6FF0",
  image: "#D52088",
  video: "#FD8D11",
  audio: "#0EC3D4",
};

function contentTypeLabel(type: ContentType): string {
  return CONTENT_LABELS[type];
}

function BrowserStatus({ browser }: { browser: DefaultChromeManager }) {
  const [status, setStatus] = useState<BrowserStatus>(browser.getStatus());
  const [detail, setDetail] = useState<string | undefined>(browser.getDetail());

  useEffect(() => browser.onStatus((next, nextDetail) => {
    setStatus(next);
    setDetail(nextDetail);
  }), [browser]);

  const labels: Record<BrowserStatus, string> = {
    disconnected: "默认 Chrome 未连接",
    checking: "正在检查 Chrome…",
    "waiting-approval": "等待 Chrome 授权…",
    connected: "默认 Chrome · 已授权",
    denied: "Chrome 拒绝了连接",
    unsupported: "当前 Chrome 不支持审批模式",
  };
  const stateClass = status === "connected"
    ? "on"
    : status === "checking" || status === "waiting-approval"
      ? "wait"
      : status === "denied" ? "bad" : "";

  return (
    <div className={`conn ${stateClass}`} data-role="chrome-status">
      <span className="dot" />
      <span>{labels[status]}</span>
      {detail && status !== "connected" && <span className="conn-detail"> · {detail}</span>}
      {status !== "connected" && (
        <button onClick={() => void browser.connect().catch((error) => {
          new Notice(error instanceof Error ? error.message : String(error));
        })}>
          连接
        </button>
      )}
    </div>
  );
}

function PlatformGlyph({
  platform,
  size,
  available = true,
}: {
  platform: PlatformCapability;
  size: number;
  available?: boolean;
}) {
  return (
    <span
      className="glyph"
      style={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
        overflow: "hidden",
        borderRadius: Math.max(5, Math.round(size * 0.24)),
        background: available ? platform.color : "var(--tp-hover)",
        color: available ? (platform.fg || "white") : "var(--tp-ink3)",
      }}
      title={platform.name}
    >
      <PlatformMark
        id={platform.id}
        char={platform.glyph}
        size={size}
        imgScale={1}
        tone="lit"
      />
    </span>
  );
}

function SourceTypePicker({
  sourceType,
  onChange,
}: {
  sourceType: ContentType;
  onChange: (type: ContentType) => void;
}) {
  return (
    <div className="type-options">
      {CONTENT_TYPES.map((type) => {
        const color = CONTENT_COLORS[type];
        const active = sourceType === type;
        return (
          <button
            key={type}
            type="button"
            className={`type-option ${active ? "active" : ""}`}
            style={active
              ? { background: color, color: "white", borderColor: "transparent" }
              : {
                  background: `color-mix(in srgb, ${color} 14%, var(--tp-card))`,
                  color: "var(--tp-ink)",
                  borderColor: `color-mix(in srgb, ${color} 24%, transparent)`,
                }}
            title={CONTENT_LABELS[type]}
            onClick={() => onChange(type)}
          >
            {CONTENT_LABELS[type]}
          </button>
        );
      })}
    </div>
  );
}

function FindingsPanel({ findings }: { findings: Finding[] }) {
  const hasError = findings.some((finding) => finding.level === "error");
  const [open, setOpen] = useState(hasError);

  useEffect(() => {
    if (hasError) setOpen(true);
  }, [hasError]);

  return (
    <div className="findings-panel">
      <button
        type="button"
        className="findings-toggle"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
      >
        <span>转换检查</span>
        <span className="findings-state">{open ? "收起" : "展开"}</span>
      </button>
      {open && (
        <div className="findings">
          {findings.length === 0 && (
            <div className="finding ok">
              <span className="icon">✓</span>
              <span>当前文件已读取，未发现转换问题</span>
            </div>
          )}
          {findings.map((finding, index) => (
            <div
              key={`${finding.message}-${index}`}
              className={`finding ${finding.level === "error" ? "bad" : finding.level === "warning" ? "warn" : "ok"}`}
            >
              <span className="icon">{finding.level === "error" ? "×" : finding.level === "warning" ? "!" : "✓"}</span>
              <span>{finding.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskList({
  tasks,
  onComplete,
  services,
}: {
  tasks: PublishTask[];
  onComplete: (task: PublishTask) => void;
  services: PublisherServices;
}) {
  const visible = tasks.filter((task) => [
    "queued",
    "running",
    "awaiting_confirm",
    "failed",
  ].includes(task.status)).slice(0, 50);

  if (!visible.length) {
    return <div className="target disabled">暂无活跃任务；历史发布见发布库</div>;
  }

  return (
    <>
      {visible.map((task) => {
        const platform = PLATFORM_BY_ID.get(task.platformId);
        const statusClass = task.status === "running"
          ? "running"
          : task.status === "awaiting_confirm"
            ? "waiting"
            : task.status === "failed" ? "failed" : "success";
        return (
          <div key={task.id} className={`target ${task.status === "failed" ? "failed" : ""}`} title={platform?.name ?? task.platformId}>
            <div className="target-main">
              <div className="target-top">
                {platform && <PlatformGlyph platform={platform} size={20} />}
                <span className={`status ${statusClass}`}>
                  {task.status === "queued" ? "排队"
                    : task.status === "running" ? "执行中"
                    : task.status === "awaiting_confirm" ? "待确认"
                    : task.status === "failed" ? "失败" : "完成"}
                </span>
              </div>
              <div className="target-desc">{task.message || task.failReason || task.filePath}</div>
              {task.sourceChangedAfterStart && (
                <div className="target-desc warning">源文件在发布开始后已修改；平台内容不会自动更新。</div>
              )}
              <div className="target-actions">
                {task.pageUrl && (
                  <button className="mini" onClick={() => void services.engine.openPage(task.id)}>打开页面</button>
                )}
                {task.status === "awaiting_confirm" && (
                  <button className="mini primary" onClick={() => onComplete(task)}>标记完成</button>
                )}
                {task.status === "queued" && (
                  <button className="mini" onClick={() => void services.engine.cancel(task.id)}>取消</button>
                )}
                {(task.status === "failed" || task.status === "success") && (
                  <button className="mini" onClick={() => void services.engine.retry(task.id)}>按最新内容重试</button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function CompletionModal({
  task,
  onClose,
  onSubmit,
}: {
  task: PublishTask;
  onClose: () => void;
  onSubmit: (url?: string) => void;
}) {
  const [url, setUrl] = useState("");
  return (
    <div className="completion-backdrop" onClick={onClose}>
      <div className="completion-modal" onClick={(event) => event.stopPropagation()}>
        <h3>标记完成</h3>
        <div className="completion-desc">如果已在平台完成发布，可以粘贴最终链接。没有链接时也会标记完成。</div>
        <label>发布链接（可选）</label>
        <input
          type="url"
          placeholder="https://..."
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && onSubmit(url || undefined)}
        />
        <div className="completion-actions">
          <button className="mini" onClick={onClose}>取消</button>
          <button className="mini primary" onClick={() => onSubmit(url || undefined)}>保存到发布库</button>
        </div>
      </div>
    </div>
  );
}

export function PublisherApp({ services, host }: PublisherAppProps) {
  const { app, browser, engine } = services;
  const [mode, setMode] = useState<ViewMode>("preview");
  const [sourceType, setSourceType] = useState<ContentType>("article");
  const [activePlatform, setActivePlatform] = useState<PlatformId>("zhihu");
  const [defaults, setDefaults] = useState<Record<ContentType, PlatformId[]>>(() => {
    const initial = Object.fromEntries(CONTENT_TYPES.map((type) => [type, services.getDefaultPlatforms(type)]));
    return initial as Record<ContentType, PlatformId[]>;
  });
  const [selected, setSelected] = useState<PlatformId[]>(() => services.getDefaultPlatforms("article"));
  const [source, setSource] = useState<SourceDraft | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<PublishTask[]>([]);
  const [completionTask, setCompletionTask] = useState<PublishTask | null>(null);
  const previewGeneration = useRef(0);
  const refreshTimer = useRef<number | null>(null);
  const previewContentRef = useRef<HTMLDivElement | null>(null);
  const galleryDrag = useRef<{ pointerId: number; x: number; left: number } | null>(null);
  const galleryScrollLeft = useRef(0);
  const galleryScrollKey = useRef<string | null>(null);
  const galleryRefreshPending = useRef(false);
  const acceptedSourceKey = useRef<string | null>(null);

  const supportedPlatforms = useMemo(
    () => PLATFORMS.filter((platform) => platform.supports.includes(sourceType)),
    [sourceType],
  );
  const availablePlatforms = useMemo(
    () => supportedPlatforms.filter((platform) => sharedAdapter(platform.id) !== undefined),
    [supportedPlatforms],
  );
  const activeSupported = availablePlatforms.some((platform) => platform.id === activePlatform);
  const active = activeSupported
    ? activePlatform
    : availablePlatforms[0]?.id ?? "zhihu";
  const platformById = useMemo(() => new Map(PLATFORMS.map((platform) => [platform.id, platform])), []);
  const availablePlatformIds = useMemo(
    () => new Set(availablePlatforms.map((platform) => platform.id)),
    [availablePlatforms],
  );
  const defaultTargets = (defaults[sourceType] ?? []).filter((platformId) => availablePlatformIds.has(platformId));
  const selectedPlatforms = selected.filter((platformId) => availablePlatformIds.has(platformId));
  const selectedCount = selectedPlatforms.length;
  const activeSource = source;

  const refreshSource = useCallback(async (requestedType?: ContentType) => {
    const type = requestedType ?? sourceType;
    const generation = ++previewGeneration.current;
    try {
      const live = readActiveSource(app);
      if (!live) {
        acceptedSourceKey.current = null;
        setSource(null);
        setSourceError(null);
        return;
      }
      if (!live.raw && live.origin === "vault") {
        live.raw = await app.vault.cachedRead(live.file);
      }
      const draft = await createSourceDraft(app, live, defaultTargets, { sourceType: type });
      if (generation !== previewGeneration.current) return;

      // 同一稿件避免反复替换预览 DOM；图片条的滚动位置因此不会被刷新打断。
      const sourceKey = [
        draft.filePath,
        draft.type,
        draft.contentDigest,
        JSON.stringify(defaultTargets),
      ].join("\0");
      if (acceptedSourceKey.current === sourceKey) {
        setSourceType(type);
        setSourceError(null);
        return;
      }
      acceptedSourceKey.current = sourceKey;
      setSource(draft);
      setSourceType(type);
      setSourceError(null);
    } catch (error) {
      if (generation !== previewGeneration.current) return;
      acceptedSourceKey.current = null;
      setSource(null);
      setSourceError(error instanceof Error ? error.message : String(error));
    }
  }, [app, defaultTargets, sourceType]);

  // 输入/切文件防抖刷新。
  useEffect(() => {
    const schedule = () => {
      if (galleryDrag.current) {
        galleryRefreshPending.current = true;
        return;
      }
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        if (galleryDrag.current) {
          galleryRefreshPending.current = true;
          return;
        }
        void refreshSource();
      }, 220);
    };
    const workspaceEvents = [
      app.workspace.on("active-leaf-change", schedule),
      app.workspace.on("file-open", schedule),
      app.workspace.on("editor-change", schedule),
    ];
    const vaultEvents = [
      app.vault.on("modify", schedule),
      app.vault.on("rename", schedule),
      app.vault.on("delete", schedule),
    ];
    const metadataEvent = app.metadataCache.on("resolved", schedule);
    schedule();

    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      for (const event of [...workspaceEvents, ...vaultEvents, metadataEvent]) app.workspace.offref(event);
    };
  }, [app, refreshSource]);

  useEffect(() => engine.subscribe(setTasks), [engine]);
  useEffect(() => {
    if (!activeSupported) setActivePlatform(availablePlatforms[0]?.id ?? "zhihu");
  }, [activeSupported, supportedPlatforms]);

  // 切换稿件类型时，用该类型的默认通道初始化发布选择。
  // 注意：默认配置变更不应覆盖发布页里用户刚刚手动调整的 selected。
  useEffect(() => {
    setSelected((defaults[sourceType] ?? []).filter((platformId) => availablePlatformIds.has(platformId)));
  }, [sourceType]);

  const changeSourceType = useCallback(async (type: ContentType) => {
    if (type === sourceType) return;
    setSourceType(type);
    setSelected((defaults[type] ?? []).filter((platformId) => availablePlatformIds.has(platformId)));

    const file = app.workspace.getActiveFile();
    if (file) {
      try {
        await app.fileManager.processFrontMatter(file, (frontmatter) => {
          const current = typeof frontmatter.tassello === "object" && frontmatter.tassello && !Array.isArray(frontmatter.tassello)
            ? frontmatter.tassello as Record<string, unknown>
            : {};
          frontmatter.tassello = { ...current, type };
        });
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      }
    }
    void refreshSource(type);
  }, [app, defaults, refreshSource, sourceType]);

  const toggleDefault = useCallback((type: ContentType, platformId: PlatformId) => {
    setDefaults((previous) => {
      const current = previous[type] ?? [];
      const next = current.includes(platformId)
        ? current.filter((value) => value !== platformId)
        : [...current, platformId];
      const updated = { ...previous, [type]: next };
      void services.setDefaultPlatforms(type, next);
      return updated;
    });
  }, [services]);

  const toggleSelected = useCallback((platformId: PlatformId) => {
    if (!availablePlatformIds.has(platformId)) return;
    setSelected((previous) => previous.includes(platformId)
      ? previous.filter((value) => value !== platformId)
      : [...previous, platformId]);
  }, []);
  const lastSelectEvent = useRef(0);
  // pointerdown 服务真实鼠标；click 服务辅助功能/键盘触发。用时间窗避免双重切换。
  const toggleSelectedFromEvent = useCallback((platformId: PlatformId) => {
    const now = performance.now();
    if (now - lastSelectEvent.current < 350) return;
    lastSelectEvent.current = now;
    toggleSelected(platformId);
  }, [toggleSelected]);

  const publishCurrent = useCallback(async () => {
    const publishable = selected.filter((platformId) => availablePlatformIds.has(platformId));
    if (!activeSource || !publishable.length) return;
    await engine.enqueue(activeSource, publishable);
  }, [activeSource, availablePlatformIds, engine, selected]);

  useEffect(() => {
    const handler = () => void publishCurrent();
    host.addEventListener("tassello:publish-current", handler);
    return () => host.removeEventListener("tassello:publish-current", handler);
  }, [host, publishCurrent]);

  const previewHtml = useMemo(() => {
    if (!activeSource || !platformSupportsType(active, activeSource.type)) return "";
    return previewHtmlForPlatform(activeSource, active);
  }, [active, activeSource]);

  useEffect(() => {
    // host 稳定存在；capture 能覆盖模式切换后重建的 preview-content。
    const recordGalleryScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches('[data-role="preview-attachments"]')) {
        galleryScrollLeft.current = target.scrollLeft;
      }
    };
    host.addEventListener("scroll", recordGalleryScroll, true);
    return () => host.removeEventListener("scroll", recordGalleryScroll, true);
  }, [host]);

  useEffect(() => {
    const gallery = previewContentRef.current?.querySelector<HTMLElement>('[data-role="preview-attachments"]');
    if (!gallery) {
      galleryScrollKey.current = null;
      galleryScrollLeft.current = 0;
      return;
    }
    const key = `${active}:${activeSource?.contentDigest ?? ""}`;
    if (galleryScrollKey.current !== key) {
      galleryScrollKey.current = key;
      galleryScrollLeft.current = 0;
    }
    gallery.scrollLeft = galleryScrollLeft.current;
  }, [active, activeSource, previewHtml]);

  const rendered = useMemo(() => {
    if (!activeSource || !platformSupportsType(active, activeSource.type)) return null;
    return renderForPlatform(activeSource, active);
  }, [active, activeSource]);

  const images = activeSource?.assets.filter((asset) => asset.kind === "image") ?? [];
  const findings = useMemo<Finding[]>(() => {
    const imageFinding: Finding = images.length
      ? { level: "ok", message: `已解析图片 ${images.length} 张` }
      : sourceError
        ? { level: "error", message: sourceError }
        : { level: "warning", message: "未检测到图片" };
    return [imageFinding, ...(rendered?.findings ?? [])];
  }, [images.length, rendered, sourceError]);

  const sourcePicker = () => (
    <SourceTypePicker sourceType={sourceType} onChange={(type) => void changeSourceType(type)} />
  );

  return (
    <>
      <div className="panel-head">
        <div className="head-top">
          <div className="mark"><i /><i /><i /><i /></div>
          <div className="panel-title">Publisher</div>
        </div>
        <BrowserStatus browser={browser} />
        <div className="mode">
          <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}>预览</button>
          <button className={mode === "publish" ? "active" : ""} onClick={() => setMode("publish")}>
            发布
            <span className="mode-count">{selectedCount}</span>
          </button>
          <button className={mode === "defaults" ? "active" : ""} onClick={() => setMode("defaults")}>默认</button>
        </div>
      </div>

      <div className="panel-body">
        {mode === "preview" && (
          <>
            <div className="selector-card">
              <div className="selector-row">
                <span className="selector-label">类型</span>
                {sourcePicker()}
              </div>
              <div className="selector-row">
                <span className="selector-label">平台</span>
                <div className="platform-options">
                  {availablePlatforms.map((platform) => (
                    <button
                      key={platform.id}
                      type="button"
                      className={`platform-option ${active === platform.id ? "active" : ""}`}
                      style={{ background: platform.color, color: platform.fg || "white" }}
                      title={platform.name}
                      aria-label={platform.name}
                      aria-pressed={active === platform.id}
                      onClick={() => setActivePlatform(platform.id)}
                    >
                      <PlatformMark
                        id={platform.id}
                        char={platform.glyph}
                        size={19}
                        tone="lit"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <FindingsPanel findings={findings} />

            <div className="preview-frame" data-role="preview-card">
              <div
                ref={previewContentRef}
                className="preview-content"
                onPointerDown={(event) => {
                  if (!(event.target instanceof Element)) return;
                  const gallery = event.target.closest<HTMLElement>('[data-role="preview-attachments"]');
                  if (!gallery || (event.pointerType === "mouse" && event.button !== 0)) return;

                  event.preventDefault();
                  galleryScrollLeft.current = gallery.scrollLeft;
                  galleryDrag.current = { pointerId: event.pointerId, x: event.clientX, left: gallery.scrollLeft };
                  gallery.classList.add("dragging");
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const drag = galleryDrag.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  const gallery = previewContentRef.current?.querySelector<HTMLElement>('[data-role="preview-attachments"]');
                  if (!gallery) return;

                  const nextLeft = Math.max(0, drag.left - (event.clientX - drag.x));
                  gallery.scrollLeft = nextLeft;
                  galleryScrollLeft.current = nextLeft;
                }}
                onPointerUp={(event) => {
                  const drag = galleryDrag.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  const wrapper = event.currentTarget;
                  if (wrapper.hasPointerCapture(event.pointerId)) wrapper.releasePointerCapture(event.pointerId);
                  galleryDrag.current = null;

                  const gallery = previewContentRef.current?.querySelector<HTMLElement>('[data-role="preview-attachments"]');
                  gallery?.classList.remove("dragging");
                  if (galleryRefreshPending.current) {
                    galleryRefreshPending.current = false;
                    const timer = refreshTimer.current;
                    if (timer) window.clearTimeout(timer);
                    refreshTimer.current = window.setTimeout(() => void refreshSource(), 0);
                  }
                }}
                onPointerCancel={(event) => {
                  const drag = galleryDrag.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  const wrapper = event.currentTarget;
                  if (wrapper.hasPointerCapture(event.pointerId)) wrapper.releasePointerCapture(event.pointerId);
                  galleryDrag.current = null;
                  previewContentRef.current?.querySelector<HTMLElement>('[data-role="preview-attachments"]')?.classList.remove("dragging");
                }}
              >
                {activeSource ? (
                  <div className="rich" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                ) : (
                  <div className="plain">{sourceError ?? "没有活动 Markdown 文件"}</div>
                )}
              </div>
            </div>
          </>
        )}

        {mode === "publish" && (
          <>
            <div className="selector-card">
              <div className="selector-row">
                <span className="selector-label">类型</span>
                {sourcePicker()}
              </div>
              <div className="selector-row">
                <span className="selector-label">平台</span>
                <div className="platform-options">
                  {availablePlatforms.map((platform) => (
                    <button
                      key={platform.id}
                      type="button"
                      className={`platform-option ${selectedPlatforms.includes(platform.id) ? "active selected" : ""}`}
                      style={{ background: platform.color, color: platform.fg || "white" }}
                      title={platform.name}
                      aria-label={`选择 ${platform.name}`}
                      aria-pressed={selectedPlatforms.includes(platform.id)}
                      onPointerDown={() => toggleSelectedFromEvent(platform.id)}
                      onClick={() => toggleSelectedFromEvent(platform.id)}
                    >
                      <PlatformMark
                        id={platform.id}
                        char={platform.glyph}
                        size={19}
                        tone="lit"
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className="selector-summary">
                <span className="count">
                  已选
                  <strong>{selectedCount}</strong>
                  <span className="total">/ {availablePlatforms.length}</span>
                </span>
                <span className="divider"></span>
                <button className="summary-link" onClick={() => void services.openPublicationBase().catch((error) => {
                  new Notice(error instanceof Error ? error.message : String(error));
                })}>
                  发布库
                  <span className="arrow">↗</span>
                </button>
              </div>
            </div>

            <div className="section-title"><span>任务</span></div>
            <div className="targets" data-role="task-list">
              <TaskList tasks={tasks} onComplete={(task) => setCompletionTask(task)} services={services} />
            </div>
          </>
        )}

        {mode === "defaults" && (
          <>
            <div className="selector-card">
              <div className="selector-row">
                <span className="selector-label">类型</span>
                {sourcePicker()}
              </div>
              <div className="selector-row">
                <span className="selector-label">平台</span>
                <div className="platform-options">
                  {availablePlatforms.map((platform) => (
                    <button
                      key={platform.id}
                      type="button"
                      className={`platform-option ${defaultTargets.includes(platform.id) ? "active selected" : ""}`}
                      style={{ background: platform.color, color: platform.fg || "white" }}
                      title={platform.name}
                      aria-label={`保存 ${platform.name} 为默认平台`}
                      aria-pressed={defaultTargets.includes(platform.id)}
                      onPointerDown={() => toggleDefault(sourceType, platform.id)}
                    >
                      <PlatformMark
                        id={platform.id}
                        char={platform.glyph}
                        size={19}
                        tone="lit"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="notice">这里只保存各稿件类型的默认勾选，不创建发布任务。</div>
          </>
        )}
      </div>

      {mode !== "defaults" && (
        <div className="panel-foot">
          {mode === "preview" ? (
            <button
              className="primary-cta"
              onClick={() => setMode("publish")}
            >
              把当前预览发送到 Publish
            </button>
          ) : (
            <>
              <button
                className="primary-cta"
                disabled={!activeSource || selectedCount === 0}
                onClick={() => void publishCurrent()}
              >
                发布当前笔记到 {selectedCount} 个通道
              </button>
              <div className="foot-note">每个通道执行时读取 Obsidian 当前最新内容</div>
            </>
          )}
        </div>
      )}

      {completionTask && (
        <CompletionModal
          task={completionTask}
          onClose={() => setCompletionTask(null)}
          onSubmit={(url) => {
            void engine.markComplete(completionTask.id, url);
            setCompletionTask(null);
          }}
        />
      )}
    </>
  );
}
