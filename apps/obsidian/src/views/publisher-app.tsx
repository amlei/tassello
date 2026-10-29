import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FileSystemAdapter, Notice, TFile } from "obsidian";
import { createSourceDraft, readActiveSource, saveOpenEditor } from "../core/source/source-resolver";
import { ensureTasselloMetadata } from "../core/source/frontmatter";
import { sha256Text } from "../core/source/hash";
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

type ViewMode = "overview" | "defaults";
type PublisherAppProps = { services: PublisherServices; host: HTMLElement };
type PublishFeedback = { tone: "running" | "done" | "failed"; text: string };

function taskStatusLabel(status: PublishTask["status"]): string {
  if (status === "queued") return "排队";
  if (status === "running") return "执行中";
  if (status === "awaiting_confirm") return "等待完成";
  if (status === "waiting_extension") return "等待扩展";
  if (status === "unknown") return "结果未知";
  if (status === "failed") return "失败";
  if (status === "success") return "完成";
  return "已取消";
}

function taskStatusClass(status: PublishTask["status"]): string {
  if (status === "running") return "running";
  if (status === "awaiting_confirm" || status === "waiting_extension" || status === "unknown") return "waiting";
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  return "";
}

function latestTasksForDocument(tasks: PublishTask[], filePath: string): PublishTask[] {
  const latest = new Map<string, PublishTask>();
  for (const task of tasks) {
    if (task.filePath !== filePath || latest.has(task.platformId)) continue;
    latest.set(task.platformId, task);
  }
  return [...latest.values()];
}

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

function SourceTypePicker({
  sourceType,
  onChange,
}: {
  sourceType: ContentType | null;
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
            aria-pressed={active}
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
  contentType,
  onChoose,
  onUpload,
}: {
  source: SourceDraft;
  contentType: ContentType;
  onChoose: (vaultPath: string) => void;
  onUpload: (file: File) => void;
}) {
  const meta = COVER_LABELS[contentType as keyof typeof COVER_LABELS];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const images = source.assets.filter((asset) => asset.kind === "image");
  const cover = source.cover;
  if (!meta) return null;
  return (
    <div className="cover-row" data-role="cover-row">
      <span className={"cover-thumb " + contentType}>
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

export function PublisherApp({ services, host }: PublisherAppProps) {
  const { app, api, engine } = services;
  const [mode, setMode] = useState<ViewMode>("overview");
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishType, setPublishType] = useState<ContentType | null>(null);
  const [defaultsType, setDefaultsType] = useState<ContentType>("article");
  const [defaults, setDefaults] = useState<Record<ContentType, PlatformId[]>>(() => {
    const initial = Object.fromEntries(CONTENT_TYPES.map((type) => [type, services.getDefaultPlatforms(type)]));
    return initial as Record<ContentType, PlatformId[]>;
  });
  const [selected, setSelected] = useState<PlatformId[]>([]);
  const [source, setSource] = useState<SourceDraft | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [platformCatalog, setPlatformCatalog] = useState<PlatformCapability[]>(PLATFORMS);
  const [rss, setRss] = useState<PodcastRssDTO | null>(null);
  const [rssOpen, setRssOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<PublishFeedback | null>(null);
  const [sessionTasks, setSessionTasks] = useState<PublishTask[]>([]);
  const sourceGeneration = useRef(0);
  const refreshTimer = useRef<number | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const acceptedSourceKey = useRef<string | null>(null);

  const rssTargets = publishType === "audio"
    ? (rss?.claims ?? []).flatMap((claim) => {
        const platform = platformCatalog.find((candidate) => candidate.id === claim.platformId);
        return platform ? [{ claim, platform }] : [];
      })
    : [];
  const rssClaimedIds = new Set(rssTargets.map(({ platform }) => platform.id));
  const publishPlatforms = publishType
    ? platformCatalog.filter((platform) =>
        platform.status === "active"
        && platform.authMode === "extension"
        && platform.supports.includes(publishType)
        && !rssClaimedIds.has(platform.id)
      )
    : [];
  const publishAvailableIds = useMemo(
    () => new Set(publishPlatforms.filter((platform) => platform.syncPhase === "connected").map((platform) => platform.id)),
    [publishPlatforms],
  );
  const selectedPlatforms = selected.filter((platformId) => publishAvailableIds.has(platformId));
  const selectedCount = selectedPlatforms.length;
  const settingsPlatforms = platformCatalog.filter((platform) =>
    platform.status === "active"
    && platform.authMode === "extension"
    && platform.supports.includes(defaultsType)
  );
  const settingsAvailableIds = new Set(
    settingsPlatforms.filter((platform) => platform.syncPhase === "connected").map((platform) => platform.id),
  );
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

  const refreshSource = useCallback(async () => {
    const generation = ++sourceGeneration.current;
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
      const draft = await createSourceDraft(app, live);
      if (generation !== sourceGeneration.current) return;
      const sourceKey = [draft.filePath, draft.contentDigest].join("\0");
      if (acceptedSourceKey.current === sourceKey) {
        setSourceError(null);
        return;
      }
      acceptedSourceKey.current = sourceKey;
      setSource(draft);
      setSourceError(null);
    } catch (error) {
      if (generation !== sourceGeneration.current) return;
      acceptedSourceKey.current = null;
      setSource(null);
      setSourceError(error instanceof Error ? error.message : String(error));
    }
  }, [app]);

  const setCover = useCallback(async (vaultPath: string) => {
    if (!activeSource) return;
    const activeFile = app.vault.getAbstractFileByPath(activeSource.filePath);
    if (!(activeFile instanceof TFile)) return;
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
  }, [activeSource, app, refreshSource]);

  const uploadCover = useCallback(async (file: File) => {
    if (!activeSource) return;
    const activeFile = app.vault.getAbstractFileByPath(activeSource.filePath);
    if (!(activeFile instanceof TFile)) return;
    try {
      const target = await app.fileManager.getAvailablePathForAttachment(file.name, activeFile.path);
      await app.vault.createBinary(target, await file.arrayBuffer());
      await setCover(target);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }, [activeSource, app, setCover]);

  useEffect(() => {
    const schedule = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => void refreshSource(), 220);
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
      for (const event of workspaceEvents) app.workspace.offref(event);
      for (const event of vaultEvents) app.vault.offref(event);
      app.metadataCache.offref(metadataEvent);
    };
  }, [app, refreshSource]);

  useEffect(() => {
    const filePath = activeSource?.filePath;
    if (!filePath) {
      setSessionTasks([]);
      return;
    }
    return engine.subscribe((tasks) => {
      setSessionTasks(latestTasksForDocument(tasks, filePath));
    });
  }, [engine, activeSource?.filePath]);

  useEffect(() => () => {
    if (feedbackTimer.current !== null) host.win.clearTimeout(feedbackTimer.current);
  }, [host]);

  const selectPublishType = useCallback((type: ContentType) => {
    const claimed = new Set(
      type === "audio" ? (rss?.claims ?? []).map((claim) => claim.platformId) : [],
    );
    const supportedIds = platformCatalog
      .filter((platform) =>
        platform.status === "active"
        && platform.authMode === "extension"
        && platform.supports.includes(type)
        && platform.syncPhase === "connected"
        && !claimed.has(platform.id)
      )
      .map((platform) => platform.id);
    setPublishType(type);
    setSelected((defaults[type] ?? []).filter((platformId) => supportedIds.includes(platformId)));
  }, [defaults, platformCatalog, rss]);

  const togglePublishPlatform = useCallback((platformId: PlatformId) => {
    if (!publishAvailableIds.has(platformId)) return;
    setSelected((previous) => previous.includes(platformId)
      ? previous.filter((value) => value !== platformId)
      : [...previous, platformId]);
  }, [publishAvailableIds]);

  const toggleDefault = useCallback((platformId: PlatformId) => {
    if (!settingsAvailableIds.has(platformId)) return;
    setDefaults((previous) => {
      const current = previous[defaultsType] ?? [];
      const next = current.includes(platformId)
        ? current.filter((value) => value !== platformId)
        : [...current, platformId];
      const updated = { ...previous, [defaultsType]: next };
      void services.setDefaultPlatforms(defaultsType, next);
      return updated;
    });
  }, [defaultsType, services, settingsAvailableIds]);

  const openPublishDialog = useCallback(() => {
    selectPublishType("article");
    setFeedback(null);
    setPublishOpen(true);
  }, [selectPublishType]);

  const publishCurrent = useCallback(async () => {
    if (!publishType) {
      new Notice("请选择发布类型");
      return;
    }
    if (!activeSource) {
      new Notice("没有活动 Markdown 文件");
      return;
    }
    const publishable = selected.filter((platformId) => publishAvailableIds.has(platformId));
    if (!publishable.length) {
      new Notice("请选择至少一个发布平台");
      return;
    }
    const activeFile = app.vault.getAbstractFileByPath(activeSource.filePath);
    if (!(activeFile instanceof TFile)) {
      new Notice("当前 Markdown 不存在");
      return;
    }

    setRunning(true);
    setSessionTasks([]);
    setFeedback({ tone: "running", text: `正在发布到 ${publishable.length} 个平台` });
    try {
      await saveOpenEditor(app, activeSource.filePath);
      let documentId = activeSource.id;
      await app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
        documentId = ensureTasselloMetadata(frontmatter, publishType);
      });
      if (!documentId) throw new Error("无法生成稿件 ID");
      const adapter = app.vault.adapter;
      if (!(adapter instanceof FileSystemAdapter)) {
        throw new Error("当前 Vault 不是本地文件系统，无法交给本机发布服务");
      }
      const markdown = await app.vault.read(activeFile);
      const createdTasks = await engine.enqueue({
        id: documentId,
        filePath: activeSource.filePath,
        vaultPath: adapter.getBasePath(),
        markdown,
        fingerprint: await sha256Text(markdown),
      }, publishable);
      setSessionTasks(createdTasks);
      await refreshSource();
      setPublishOpen(false);
      setFeedback({
        tone: "done",
        text: `已提交到 ${publishable.length} 个平台`,
      });
      if (feedbackTimer.current !== null) host.win.clearTimeout(feedbackTimer.current);
      feedbackTimer.current = host.win.setTimeout(() => {
        feedbackTimer.current = null;
        setFeedback(null);
      }, 4500);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback({ tone: "failed", text: message });
      new Notice(message);
    } finally {
      setRunning(false);
    }
  }, [activeSource, app, engine, host, publishAvailableIds, publishType, refreshSource, selected]);

  useEffect(() => {
    const handler = () => openPublishDialog();
    host.addEventListener("tassello:publish-current", handler);
    return () => host.removeEventListener("tassello:publish-current", handler);
  }, [host, openPublishDialog]);

  const images = activeSource?.assets.filter((asset) => asset.kind === "image") ?? [];
  const findings = useMemo<Finding[]>(() => {
    if (sourceError) return [{ level: "error", message: sourceError }];
    if (!activeSource) return [{ level: "warning", message: "没有活动 Markdown 文件" }];
    return [
      { level: "ok", message: `Markdown 已读取：${activeSource.filePath}` },
      ...(images.length ? [{ level: "ok" as const, message: `已解析图片 ${images.length} 张` }] : []),
      { level: "warning", message: "仅支持 CommonMark + GFM；wiki link、callout 和专有语法不会发布。" },
    ];
  }, [activeSource, images.length, sourceError]);

  const toggleDefaults = useCallback(() => {
    if (mode === "defaults") {
      setMode("overview");
      return;
    }
    if (activeSource?.type) setDefaultsType(activeSource.type);
    setMode("defaults");
  }, [activeSource, mode]);

  return (
    <>
      <div className="panel-head">
        <div className="head-top">
          <div className="mark"><i /><i /><i /><i /></div>
          <div className="panel-title">九漾 Onda</div>
          <RuntimeStatus api={api} />
          <button
            type="button"
            className={`panel-icon-button ${mode === "defaults" ? "active" : ""}`}
            onClick={toggleDefaults}
            title="默认发布设置"
            aria-label="默认发布设置"
          >
            ⚙
          </button>
        </div>
      </div>

      <div className="panel-body">
        {mode === "overview" ? (
          <>
            <div className="current-doc">
              <span className="current-doc-mark">MD</span>
              <div className="current-doc-copy">
                <h2>{activeSource?.title ?? "没有活动 Markdown 文件"}</h2>
                <p>{activeSource?.filePath ?? "打开一篇 Markdown 后即可发布"}</p>
                <div className="current-doc-meta">
                  <span>Markdown</span>
                  <span>发布时选择类型与平台</span>
                </div>
              </div>
            </div>

            <div className="publish-action">
              <button
                type="button"
                className="primary-cta"
                disabled={!activeSource || running}
                onClick={openPublishDialog}
              >
                {running ? "发布任务执行中…" : "发布"}
              </button>
              <div className="foot-note">发布前会先保存当前 Markdown</div>
            </div>

            <FindingsPanel findings={findings} />

            {feedback && (
              <div className={`publish-feedback ${feedback.tone}`} aria-live="polite">
                <span className="pulse" />
                <span>{feedback.text}</span>
              </div>
            )}

            {sessionTasks.length > 0 && (
              <div className="live-tasks" aria-label="本次发布进度">
                {sessionTasks.map((task) => {
                  const platform = PLATFORM_BY_ID.get(task.platformId);
                  if (!platform) return null;
                  const targetUrl = task.url ?? task.pageUrl;
                  return (
                    <div className="live-task" key={task.id}>
                      <span className="glyph" style={{ background: platform.color, color: platform.fg || "white" }}>
                        <PlatformMark id={platform.id} char={platform.glyph} size={19} tone="lit" />
                      </span>
                      <span className="live-task-copy">
                        <b>{platform.name}</b>
                        <span>{task.message || task.failReason || (task.status === "awaiting_confirm" ? "内容已填入，等待你在平台完成发布" : "已加入发布队列")}</span>
                        <span className="live-task-bar"><i style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }} /></span>
                      </span>
                      <span className={`live-task-state ${taskStatusClass(task.status)}`}>{taskStatusLabel(task.status)}</span>
                      {targetUrl && <button type="button" className="mini" onClick={() => activeWindow.open(targetUrl, "_blank", "noopener,noreferrer")}>打开</button>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="selector-card default-targets">
              <div className="selector-row">
                <span className="selector-label">类型</span>
                <SourceTypePicker sourceType={defaultsType} onChange={setDefaultsType} />
              </div>
              <div className="selector-row">
                <span className="selector-label">平台</span>
                <div className="platform-options">
                  {settingsPlatforms.map((platform) => {
                    const connected = settingsAvailableIds.has(platform.id);
                    const active = (defaults[defaultsType] ?? []).includes(platform.id);
                    return (
                      <button
                        key={platform.id}
                        type="button"
                        className={`platform-option ${active ? "active selected" : ""}`}
                        style={{
                          background: connected ? platform.color : "var(--tp-hover)",
                          color: connected ? (platform.fg || "white") : "var(--tp-ink3)",
                          opacity: connected ? 1 : 0.55,
                          cursor: connected ? "pointer" : "not-allowed",
                        }}
                        title={`${platform.name}${connected ? "" : ` · ${platform.syncReason ?? "账号未连接"}`}`}
                        aria-label={`保存 ${platform.name} 为默认平台`}
                        aria-pressed={active}
                        aria-disabled={!connected}
                        onClick={() => toggleDefault(platform.id)}
                      >
                        <PlatformMark
                          id={platform.id}
                          char={platform.glyph}
                          size={19}
                          tone={connected ? "lit" : "off"}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="notice">这里只保存各稿件类型的默认勾选，不创建发布任务。</div>
          </>
        )}
      </div>

      {publishOpen && (
        <div className="publish-dialog-backdrop" onClick={() => setPublishOpen(false)}>
          <div
            className="publish-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="publish-dialog-kicker">CURRENT NOTE</div>
            <h3 id="publish-dialog-title">发布当前稿件</h3>
            <p>{activeSource?.title ?? "当前 Markdown"}</p>

            <section className="publish-field">
              <div className="publish-field-head">
                <b>内容类型</b>
                <span>写入 frontmatter</span>
              </div>
              <SourceTypePicker sourceType={publishType} onChange={selectPublishType} />
            </section>

            {publishType && activeSource && (
              <CoverControl
                source={activeSource}
                contentType={publishType}
                onChoose={(path) => void setCover(path)}
                onUpload={(file) => void uploadCover(file)}
              />
            )}
            {publishType === "audio" && rss && rssTargets.length > 0 && (
              <RssSyncStrip rss={rss} targets={rssTargets} open={rssOpen} onToggle={() => setRssOpen((open) => !open)} />
            )}

            <section className="publish-field">
              <div className="publish-field-head">
                <b>发布平台</b>
                <span>已选 {selectedCount} / {publishPlatforms.length}</span>
              </div>
              {publishType && publishPlatforms.length === 0 && (
                <div className="publish-platform-empty">该类型暂无可用平台</div>
              )}
              <div className="publish-platforms">
                {publishPlatforms.map((platform) => {
                  const connected = publishAvailableIds.has(platform.id);
                  const active = selectedPlatforms.includes(platform.id);
                  return (
                    <button
                      key={platform.id}
                      type="button"
                      className={`publish-platform ${active ? "selected" : ""} ${connected ? "" : "off"}`}
                      style={{ "--platform-color": platform.color } as CSSProperties}
                      title={`${platform.name}${connected ? "" : ` · ${platform.syncReason ?? "账号未连接"}`}`}
                      aria-pressed={active}
                      aria-disabled={!connected}
                      onClick={() => togglePublishPlatform(platform.id)}
                    >
                      <span className="glyph" style={{ background: connected ? platform.color : "var(--tp-hover)", color: connected ? (platform.fg || "white") : "var(--tp-ink3)" }}>
                        <PlatformMark id={platform.id} char={platform.glyph} size={19} tone={connected ? "lit" : "off"} />
                      </span>
                      <span className="publish-platform-name">{platform.name}</span>
                      <span className="checkmark">✓</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="publish-dialog-actions">
              <button type="button" className="mini" onClick={() => setPublishOpen(false)}>取消</button>
              <button
                type="button"
                className="mini primary"
                disabled={!publishType || selectedCount === 0 || running}
                onClick={() => void publishCurrent()}
              >
                发布到 {selectedCount} 个平台
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
