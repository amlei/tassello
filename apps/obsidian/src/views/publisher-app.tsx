import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Notice, TFile } from "obsidian";
import { createSourceDraft, readActiveSource } from "../core/source/source-resolver";
import { parseImageEmbeds } from "../core/source/image-embeds";
import { platformSupportsType, previewHtmlForPlatform, renderForPlatform } from "../core/render/renderers";
import {
  PLATFORMS,
  PLATFORM_BY_ID,
  type ContentType,
  type Finding,
  type PlatformCapability,
  type PlatformId,
  type PublishTask,
  type SourceDraft,
} from "../core/types";
import type { BackendApi } from "../core/api/client";
import { PlatformMark } from "@tassello/ui/platform-icons";
import type { PodcastRssClaimDTO, PodcastRssDTO } from "@tassello/shared";
import type { PublisherServices } from "./publisher-view";

type ViewMode = "preview" | "defaults";
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

function platformCatalogSignature(platforms: PlatformCapability[]): string {
  return platforms
    .map((platform) => [
      platform.id,
      platform.syncPhase,
      platform.syncReason ?? "",
      platform.accountName ?? "",
    ].join("\u0000"))
    .join("\u0001");
}

function contentTypeLabel(type: ContentType): string {
  return CONTENT_LABELS[type];
}

function RuntimeStatus({ api }: { api: BackendApi }) {
  const [state, setState] = useState<"ready" | "waiting" | "unavailable">("waiting");
  const [reason, setReason] = useState("正在检查发布服务");
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const capability = await api.capability();
        if (!disposed) {
          setState(capability.state);
          setReason(
            capability.state === "ready"
              ? "发布通道可用；桌面端和 Obsidian 共用同一扩展连接"
              : capability.reason ?? "等待浏览器扩展连接",
          );
        }
      } catch (error) {
        if (!disposed) {
          setState("unavailable");
          setReason(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [api]);
  return (
    <span
      className={`conn-indicator ${state === "ready" ? "on" : state === "waiting" ? "wait" : "bad"}`}
      title={reason}
      aria-label={reason}
      data-role="runtime-status"
    >
      <span className="dot" />
    </span>
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

const COVER_LABELS = {
  article: { title: "文章封面", ratio: "16:9", scope: "微信公众号 · 知乎" },
  audio: { title: "播客封面", ratio: "1:1", scope: "小红书必填 · 其他平台用专辑封面" },
  video: { title: "视频封面", ratio: "多比例", scope: "比例随发布平台适配" },
} as const;

function CoverControl({
  source,
  onChoose,
  onUpload,
}: {
  source: SourceDraft;
  onChoose: (vaultPath: string) => void;
  onUpload: (file: File) => void;
}) {
  const meta = COVER_LABELS[source.type as keyof typeof COVER_LABELS];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const images = source.assets.filter((asset) => asset.kind === "image");
  const cover = source.cover;
  if (!meta) return null;
  return (
    <div className="cover-row" data-role="cover-row">
      <span className={"cover-thumb " + source.type}>
        {cover
          ? <img src={cover.resourcePath} alt="" />
          : <span className="cover-empty">封面</span>}
      </span>
      <span className="cover-copy">
        <span className="cover-title">{meta.title}<em>{meta.ratio}</em></span>
        <span className="cover-meta">{cover ? `${cover.alt} · 已加入稿件资产` : "尚未设置；上传后自动加入稿件资产"}</span>
      </span>
      <span className="cover-scope">{meta.scope}</span>
      {images.length > 1 ? (
        <select
          className="cover-select"
          aria-label="选择稿件封面"
          value={cover?.vaultPath ?? ""}
          onChange={(event) => onChoose(event.target.value)}
        >
          {images.map((image, index) => (
            <option key={image.vaultPath} value={image.vaultPath}>第 {index + 1} 张 · {image.alt}</option>
          ))}
        </select>
      ) : null}
      <button type="button" className="cover-upload" onClick={() => inputRef.current?.click()}>
        {cover ? "更换" : "选择"}
      </button>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onUpload(file);
        }}
      />
    </div>
  );
}

function RssSyncStrip({
  rss,
  targets,
  open,
  onToggle,
}: {
  rss: PodcastRssDTO;
  targets: Array<{ claim: PodcastRssClaimDTO; platform: PlatformCapability }>;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rss-sync-strip" data-role="rss-sync">
      <button type="button" className="rss-sync-head" aria-expanded={open} onClick={onToggle}>
        <span className="rss-sync-badge">RSS</span>
        <b>{rss.title}</b>
        <span>{rss.episodeCount ?? 0} 期 · 自动同步 {targets.length} 个平台</span>
        <i className={`rss-sync-chev ${open ? "open" : ""}`} aria-hidden="true">⌄</i>
      </button>
      {open && (
        <div className="rss-sync-targets">
          {targets.map(({ claim, platform }) => (
            <span key={claim.platformId} className={`rss-sync-target ${claim.state}`} title={claim.evidenceUrl ?? platform.name}>
              <PlatformMark id={platform.id} char={platform.glyph} size={14} tone={claim.state === "claimed" ? "lit" : "dim"} />
              {platform.name}
              <em>{claim.label}</em>
            </span>
          ))}
        </div>
      )}
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
    "waiting_extension",
    "unknown",
    "success",
    "failed",
  ].includes(task.status)).slice(0, 50);

  if (!visible.length) {
    return <div className="target disabled">暂无发布任务</div>;
  }

  return (
    <>
      {visible.map((task) => {
        const platform = PLATFORM_BY_ID.get(task.platformId);
        const statusClass = task.status === "running"
          ? "running"
          : task.status === "awaiting_confirm" || task.status === "waiting_extension" || task.status === "unknown"
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
                    : task.status === "awaiting_confirm" ? "等待完成"
                    : task.status === "waiting_extension" ? "等待扩展"
                    : task.status === "unknown" ? "结果未知"
                    : task.status === "failed" ? "失败" : "完成"}
                </span>
              </div>
              <div className="target-desc">
                {task.status === "success"
                  ? task.url
                    ? task.urlSource === "manual" ? "人工回填发布链接" : "自动回执已确认"
                    : task.noPublicUrl ? "已确认发布，无公开链接" : "已确认发布"
                  : task.status === "waiting_extension"
                    ? "扩展重新连接后会继续执行"
                    : task.status === "unknown"
                      ? "已观察到提交动作，但未收到稳定回执"
                      : task.message || task.failReason || task.filePath}
              </div>
              {task.sourceChangedAfterStart && (
                <div className="target-desc warning">源文件在发布开始后已修改；平台内容不会自动更新。</div>
              )}
              <div className="target-actions">
                {task.pageUrl && (
                  <button className="mini" onClick={() => void services.engine.openPage(task.id)}>打开页面</button>
                )}
                {task.status === "success" && task.url && (
                  <button className="mini primary" onClick={() => window.open(task.url!, "_blank", "noopener,noreferrer")}>打开发布结果</button>
                )}
                {(task.status === "awaiting_confirm" || task.status === "unknown" || task.status === "waiting_extension") && (
                  <button className="mini primary" onClick={() => onComplete(task)}>补充链接</button>
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
  onSubmit: (url: string | null, noPublic: boolean) => void;
}) {
  const [url, setUrl] = useState("");
  const [noPublic, setNoPublic] = useState(false);
  const normalized = url.trim();
  const invalid = !!normalized && !/^https?:\/\/\S+$/i.test(normalized);
  const canSubmit = !invalid && (!!normalized || noPublic);
  return (
    <div className="completion-backdrop" onClick={onClose}>
      <div className="completion-modal" onClick={(event) => event.stopPropagation()}>
        <h3>补充发布结果</h3>
        <div className="completion-desc">自动回执缺失时才需要手动处理。填写最终链接，或明确确认该结果没有公开链接。</div>
        <label>发布链接</label>
        <input
          type="url"
          placeholder="https://..."
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        {invalid && <div className="completion-desc warning">请输入 http(s) 开头的完整链接。</div>}
        <label className="completion-check">
          <input
            type="checkbox"
            checked={noPublic}
            onChange={(event) => {
              setNoPublic(event.target.checked);
              if (event.target.checked) setUrl("");
            }}
          />
          <span>该结果没有公开链接，我已在平台确认完成</span>
        </label>
        <div className="completion-actions">
          <button className="mini" onClick={onClose}>取消</button>
          <button className="mini primary" disabled={!canSubmit} onClick={() => onSubmit(normalized || null, noPublic)}>保存发布结果</button>
        </div>
      </div>
    </div>
  );
}

export function PublisherApp({ services, host }: PublisherAppProps) {
  const { app, api, engine } = services;
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
  const [platformCatalog, setPlatformCatalog] = useState<PlatformCapability[]>(PLATFORMS);
  const [rss, setRss] = useState<PodcastRssDTO | null>(null);
  const [rssOpen, setRssOpen] = useState(false);
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
    () => platformCatalog.filter((platform) => platform.supports.includes(sourceType)),
    [platformCatalog, sourceType],
  );
  const rssTargets = sourceType === "audio"
    ? (rss?.claims ?? []).flatMap((claim) => {
        const platform = platformCatalog.find((candidate) => candidate.id === claim.platformId);
        return platform ? [{ claim, platform }] : [];
      })
    : [];
  const rssClaimedIds = new Set(rssTargets.map(({ platform }) => platform.id));
  const availablePlatforms = supportedPlatforms.filter((platform) =>
    platform.status === "active"
    && platform.authMode === "extension"
    && !rssClaimedIds.has(platform.id)
  );
  const activeSupported = availablePlatforms.some((platform) => platform.id === activePlatform);
  const active = activeSupported
    ? activePlatform
    : availablePlatforms[0]?.id ?? "zhihu";
  const availablePlatformIds = useMemo(
    () => new Set(availablePlatforms.filter((platform) => platform.syncPhase === "connected").map((platform) => platform.id)),
    [availablePlatforms],
  );
  const defaultTargets = (defaults[sourceType] ?? []).filter((platformId) => availablePlatformIds.has(platformId));
  const selectedPlatforms = selected.filter((platformId) => availablePlatformIds.has(platformId));
  const selectedCount = selectedPlatforms.length;
  const activeSource = source;

  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const live = await api.platforms();
        if (disposed) return;
        const next = PLATFORMS.map((base) => {
          const remote = live.find((platform) => platform.id === base.id);
          return remote
            ? {
              ...base,
              syncPhase: remote.sync.phase,
              syncReason: remote.sync.reason,
              accountName: remote.account?.name ?? null,
            }
            : base;
        });
        setPlatformCatalog((previous) =>
          platformCatalogSignature(previous) === platformCatalogSignature(next) ? previous : next,
        );
        const liveRss = await api.podcastRss();
        if (disposed) return;
        setRss((previous) =>
          JSON.stringify(previous) === JSON.stringify(liveRss) ? previous : liveRss
        );
      } catch {}
    };
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [api]);

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

  const setCover = useCallback(async (vaultPath: string) => {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) return;
    const attachment = app.vault.getAbstractFileByPath(vaultPath);
    const reference = attachment instanceof TFile
      ? app.metadataCache.fileToLinktext(attachment, activeFile.path, false)
      : vaultPath;
    try {
      await app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
        const current = frontmatter.tassello && typeof frontmatter.tassello === "object" && !Array.isArray(frontmatter.tassello)
          ? frontmatter.tassello as Record<string, unknown>
          : {};
        frontmatter.tassello = { ...current, cover: reference };
      });
      await refreshSource();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }, [app, refreshSource]);

  const uploadCover = useCallback(async (file: File) => {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) return;
    try {
      const target = await app.fileManager.getAvailablePathForAttachment(file.name, activeFile.path);
      await app.vault.createBinary(target, await file.arrayBuffer());
      await setCover(target);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }, [app, setCover]);

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
  }, [activeSupported, availablePlatforms]);

  // 切换稿件类型时，用该类型的默认通道初始化发布选择。
  // 注意：默认配置变更不应覆盖发布页里用户刚刚手动调整的 selected。
  useEffect(() => {
    setSelected((defaults[sourceType] ?? []).filter((platformId) => availablePlatformIds.has(platformId)));
  }, [availablePlatformIds, sourceType]);

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
    if (!availablePlatformIds.has(platformId)) return;
    setDefaults((previous) => {
      const current = previous[type] ?? [];
      const next = current.includes(platformId)
        ? current.filter((value) => value !== platformId)
        : [...current, platformId];
      const updated = { ...previous, [type]: next };
      void services.setDefaultPlatforms(type, next);
      return updated;
    });
  }, [availablePlatformIds, services]);

  const toggleSelected = useCallback((platformId: PlatformId) => {
    if (!availablePlatformIds.has(platformId)) return;
    setSelected((previous) => previous.includes(platformId)
      ? previous.filter((value) => value !== platformId)
      : [...previous, platformId]);
  }, [availablePlatformIds]);
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
    if (!activeSource?.id) {
      new Notice("当前 Markdown 缺少 tassello.id，无法创建发布快照");
      return;
    }
    if (!publishable.length) return;
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
        <RuntimeStatus api={api} />
        <div className="mode">
          <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}>预览</button>
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
                    (() => {
                      const connected = availablePlatformIds.has(platform.id);
                      return (
                        <button
                          key={platform.id}
                          type="button"
                          className={`platform-option ${selectedPlatforms.includes(platform.id) ? "selected" : ""}`}
                          style={{
                            background: connected ? platform.color : "var(--tp-hover)",
                            color: connected ? (platform.fg || "white") : "var(--tp-ink3)",
                            opacity: connected ? 1 : 0.55,
                            cursor: connected ? "pointer" : "not-allowed",
                          }}
                          title={`${platform.name}${connected
                            ? selectedPlatforms.includes(platform.id) ? " · 已选" : ""
                            : ` · ${platform.syncReason ?? "账号未连接"}`}`}
                          aria-label={`${selectedPlatforms.includes(platform.id) ? "移除" : "选择"} ${platform.name}`}
                          aria-pressed={selectedPlatforms.includes(platform.id)}
                          aria-disabled={!connected}
                          onClick={() => {
                            if (!connected) return;
                            setActivePlatform(platform.id);
                            toggleSelected(platform.id);
                          }}
                        >
                          <PlatformMark
                            id={platform.id}
                            char={platform.glyph}
                            size={19}
                            tone={connected ? "lit" : "off"}
                          />
                        </button>
                      );
                    })()
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
                <span className="summary-link" style={{ cursor: "default" }}>点击图标切换发布目标</span>
              </div>
            </div>

            {activeSource && <CoverControl source={activeSource} onChoose={(path) => void setCover(path)} onUpload={(file) => void uploadCover(file)} />}
            {sourceType === "audio" && rss && rssTargets.length > 0 && (
              <RssSyncStrip rss={rss} targets={rssTargets} open={rssOpen} onToggle={() => setRssOpen((open) => !open)} />
            )}
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
                  <>
                    {activeSource.type !== "image" && activeSource.cover && (
                      <img
                        className={"preview-cover " + activeSource.type}
                        src={activeSource.cover.resourcePath}
                        alt="封面预览"
                      />
                    )}
                    <div className="rich" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </>
                ) : (
                  <div className="plain">{sourceError ?? "没有活动 Markdown 文件"}</div>
                )}
              </div>
            </div>
            {tasks.length > 0 && (
              <div className="targets" data-role="task-list">
                <TaskList tasks={tasks} onComplete={(task) => setCompletionTask(task)} services={services} />
              </div>
            )}
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
                    (() => {
                      const connected = availablePlatformIds.has(platform.id);
                      return (
                        <button
                          key={platform.id}
                          type="button"
                          className={`platform-option ${defaultTargets.includes(platform.id) ? "active selected" : ""}`}
                          style={{
                            background: connected ? platform.color : "var(--tp-hover)",
                            color: connected ? (platform.fg || "white") : "var(--tp-ink3)",
                            opacity: connected ? 1 : 0.55,
                            cursor: connected ? "pointer" : "not-allowed",
                          }}
                          title={`${platform.name}${connected ? "" : ` · ${platform.syncReason ?? "账号未连接"}`}`}
                          aria-label={`保存 ${platform.name} 为默认平台`}
                          aria-pressed={defaultTargets.includes(platform.id)}
                          aria-disabled={!connected}
                          onPointerDown={() => {
                            if (connected) toggleDefault(sourceType, platform.id);
                          }}
                        >
                          <PlatformMark
                            id={platform.id}
                            char={platform.glyph}
                            size={19}
                            tone={connected ? "lit" : "off"}
                          />
                        </button>
                      );
                    })()
                  ))}
                </div>
              </div>
            </div>
            {activeSource && <CoverControl source={activeSource} onChoose={(path) => void setCover(path)} onUpload={(file) => void uploadCover(file)} />}
            {sourceType === "audio" && rss && rssTargets.length > 0 && (
              <RssSyncStrip rss={rss} targets={rssTargets} open={rssOpen} onToggle={() => setRssOpen((open) => !open)} />
            )}
            <div className="notice">这里只保存各稿件类型的默认勾选，不创建发布任务。</div>
          </>
        )}
      </div>

      {mode !== "defaults" && (
        <div className="panel-foot">
          <button
            className="primary-cta"
            disabled={!activeSource?.id || selectedCount === 0}
            onClick={() => void publishCurrent()}
          >
            发布到 {selectedCount} 个平台
          </button>
          <div className="foot-note">发布前会先保存当前 Markdown，再生成不可变发布快照</div>
        </div>
      )}

      {completionTask && (
        <CompletionModal
          task={completionTask}
          onClose={() => setCompletionTask(null)}
          onSubmit={(url, noPublic) => {
            void engine.markComplete(completionTask.id, url ?? undefined, noPublic);
            setCompletionTask(null);
          }}
        />
      )}
    </>
  );
}
