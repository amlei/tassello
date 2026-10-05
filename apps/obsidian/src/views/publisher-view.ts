import { ItemView, Notice, WorkspaceLeaf, type App } from "obsidian";
import { parseImageEmbeds } from "../core/source/image-embeds";
import { createSourceDraft, readActiveSource } from "../core/source/source-resolver";
import { platformSupportsType, previewHtmlForPlatform, renderForPlatform } from "../core/render/renderers";
import { PLATFORMS, PLATFORM_BY_ID, type BrowserStatus, type Finding, type PlatformId, type PublishTask, type SourceDraft } from "../core/types";
import type { DefaultChromeManager } from "../core/browser/default-chrome";
import { renderPlatformGlyph } from "../core/ui/platform-icons";
import type { TaskEngine } from "../core/tasks/task-engine";

export const PUBLISHER_VIEW_TYPE = "tassello-publisher-view";

export type PublisherServices = {
  app: App;
  browser: DefaultChromeManager;
  engine: TaskEngine;
  getSelectedPlatforms(): PlatformId[];
  setSelectedPlatforms(values: PlatformId[]): Promise<void>;
  getDefaultPlatforms(type: SourceDraft["type"]): PlatformId[];
  openPublicationBase(): Promise<void>;
};

export class PublisherView extends ItemView {
  private mode: "preview" | "publish" = "preview";
  private activePlatform: PlatformId = "weibo";
  private selected = new Set<PlatformId>();
  private preview: SourceDraft | null = null;
  private findings: Finding[] = [];
  private unsubscribeTasks: (() => void) | null = null;
  private unsubscribeBrowser: (() => void) | null = null;
  private previewGeneration = 0;
  private previewDebounce: number | null = null;
  private latestTasks: PublishTask[] = [];
  private completionTask: PublishTask | null = null;
  private completionUrl = "";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly services: PublisherServices,
  ) {
    super(leaf);
    this.selected = new Set(services.getSelectedPlatforms());
    this.activePlatform = this.selected.values().next().value ?? "weibo";
    this.navigation = false;

    const debounce = () => {
      if (this.previewDebounce) window.clearTimeout(this.previewDebounce);
      this.previewDebounce = window.setTimeout(() => void this.refreshPreview(), 220);
    };
    const events = this.app.workspace;
    this.registerEvent(events.on("active-leaf-change", debounce));
    this.registerEvent(events.on("file-open", debounce));
    this.registerEvent(events.on("editor-change", debounce));
    this.registerEvent(this.app.vault.on("modify", debounce));
    this.registerEvent(this.app.vault.on("rename", debounce));
    this.registerEvent(this.app.vault.on("delete", debounce));
    this.registerEvent(this.app.metadataCache.on("resolved", debounce));

  }

  override getViewType(): string {
    return PUBLISHER_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "Tassello Publisher";
  }

  override getIcon(): string {
    return "send";
  }

  override async onOpen(): Promise<void> {
    this.unsubscribeTasks = this.services.engine.subscribe((tasks) => this.renderTasks(tasks));
    this.unsubscribeBrowser = this.services.browser.onStatus(() => this.renderChrome());
    this.contentEl.empty();
    this.contentEl.addClass("tassello-publisher");
    this.renderShell();
    await this.refreshPreview();
  }

  override async onClose(): Promise<void> {
    if (this.previewDebounce) window.clearTimeout(this.previewDebounce);
    this.unsubscribeTasks?.();
    this.unsubscribeBrowser?.();
  }

  private renderShell(): void {
    this.contentEl.empty();
    this.contentEl.addClass("tassello-publisher");

    const head = this.contentEl.createDiv({ cls: "panel-head" });
    const top = head.createDiv({ cls: "head-top" });
    const mark = top.createDiv({ cls: "mark" });
    for (let index = 0; index < 4; index += 1) mark.createEl("i");
    top.createDiv({ text: "Publisher", cls: "panel-title" });

    const chrome = head.createDiv({ cls: "conn" });
    chrome.dataset.role = "chrome-status";
    const mode = head.createDiv({ cls: "mode" });
    const previewButton = mode.createEl("button", { text: "预览", cls: this.mode === "preview" ? "active" : "" });
    const publishButton = mode.createEl("button", { text: "发布", cls: this.mode === "publish" ? "active" : "" });
    const count = publishButton.createSpan({ text: String(this.selected.size), cls: "mode-count" });
    if (this.mode !== "publish") count.addClass("hidden");
    previewButton.addEventListener("click", () => {
      this.mode = "preview";
      this.renderShell();
      void this.refreshPreview();
    });
    publishButton.addEventListener("click", () => {
      this.mode = "publish";
      this.renderShell();
    });

    const connectButton = chrome.createEl("button", { text: "连接" });
    connectButton.addEventListener("click", () => {
      void this.services.browser.connect().catch((error) => {
        new Notice(error instanceof Error ? error.message : String(error));
      });
    });

    this.renderChrome();
    this.contentEl.createDiv({ cls: "panel-body" });
    // 预览模式没有底部动作：内容刷新由事件驱动自动完成
    if (this.mode !== "publish") {
      const body = this.contentEl.querySelector<HTMLElement>(".panel-body");
      if (body) this.renderPreview(body);
      return;
    }

    const footer = this.contentEl.createDiv({ cls: "panel-foot" });
    const cta = footer.createEl("button", {
      cls: "primary-cta",
      text: `发布当前笔记到 ${this.selected.size} 个平台`,
    });
    cta.disabled = this.selected.size === 0;
    cta.addEventListener("click", () => void this.publishCurrent());
    footer.createDiv({
      text: "每个平台执行时读取 Obsidian 当前最新内容",
      cls: "foot-note",
    });

    const body = this.contentEl.querySelector<HTMLElement>(".panel-body");
    this.renderPublish(body!);
    this.renderCompletionModal();
  }

  private renderChrome(): void {
    const el = this.contentEl.querySelector<HTMLElement>('[data-role="chrome-status"]');
    if (!el) return;
    const status = this.services.browser.getStatus();
    const detail = this.services.browser.getDetail();
    el.className = `conn ${status === "connected" ? "on" : status === "checking" || status === "waiting-approval" ? "wait" : status === "denied" ? "bad" : ""}`;
    el.empty();
    el.createSpan({ cls: "dot" });
    const labels: Record<BrowserStatus, string> = {
      disconnected: "默认 Chrome 未连接",
      checking: "正在检查 Chrome…",
      "waiting-approval": "等待 Chrome 授权…",
      connected: "默认 Chrome · 已授权",
      denied: "Chrome 拒绝了连接",
      unsupported: "当前 Chrome 不支持审批模式",
    };
    el.createSpan({ text: labels[status] });
    if (detail && status !== "connected") {
      // 失败原因直接可见，不再藏进 tooltip
      el.createSpan({ text: ` · ${detail}`, cls: "conn-detail" });
      el.title = detail;
    }
  }

  private renderPreview(root: HTMLElement): void {
    root.empty();
    const title = root.createDiv({ cls: "section-title" });
    title.createSpan({ text: "转换检查" });
    title.createSpan({ text: "整篇文件", cls: "hint" });
    const findings = root.createDiv({ cls: "findings" });
    this.renderFindings(findings);

    const platformTitle = root.createDiv({ cls: "section-title" });
    platformTitle.createSpan({ text: "平台 payload" });
    platformTitle.createSpan({ text: "同一输入", cls: "hint" });

    const chips = root.createDiv({ cls: "chips" });
    for (const platform of PLATFORMS) {
      const button = chips.createEl("button", { cls: `chip icon-only ${this.activePlatform === platform.id ? "selected" : ""}` });
      button.setAttribute("title", platform.name);
      button.setAttribute("aria-label", platform.name);
      renderPlatformGlyph(button, platform, 19);
      button.addEventListener("click", () => {
        this.activePlatform = platform.id;
        this.renderShell();
        void this.refreshPreview();
      });
    }

    const card = root.createDiv({ cls: "preview-frame" });
    card.dataset.role = "preview-card";
    if (!this.preview) {
      card.addClass("empty");
      card.textContent = "没有活动 Markdown 文件";
      return;
    }
    const platform = PLATFORM_BY_ID.get(this.activePlatform)!;
    if (!platformSupportsType(platform.id, this.preview.type)) {
      card.addClass("empty");
      card.textContent = `${platform.name} 不支持当前内容类型 ${this.preview.type}`;
      return;
    }
    const rendered = renderForPlatform(this.preview, platform.id);
    const errors = rendered.findings.filter((finding) => finding.level === "error");
    if (errors.length) {
      card.addClass("empty");
      card.textContent = errors.map((finding) => finding.message).join("；");
      return;
    }
    const frame = card.createDiv({ cls: "rich" });
    frame.innerHTML = previewHtmlForPlatform(this.preview, platform.id);
  }

  private renderFindings(root: HTMLElement): void {
    root.empty();
    if (!this.findings.length) {
      root.createDiv({ cls: "finding ok", text: "当前文件已读取，未发现转换问题" });
      return;
    }
    for (const finding of this.findings) {
      const className = finding.level === "error" ? "bad" : finding.level === "warning" ? "warn" : "ok";
      const item = root.createDiv({ cls: `finding ${className}` });
      item.createSpan({ text: finding.level === "error" ? "×" : finding.level === "warning" ? "!" : "✓", cls: "icon" });
      item.createSpan({ text: finding.message });
    }
  }

  private renderPublish(root: HTMLElement): void {
    root.empty();
    const title = root.createDiv({ cls: "section-title" });
    title.createSpan({ text: "发布目标" });
    title.createSpan({ text: `${this.selected.size} / ${PLATFORMS.length}`, cls: "hint" });
    const ledgerButton = title.createEl("button", { text: "发布库", cls: "ledger-link" });
    ledgerButton.addEventListener("click", () => {
      void this.services.openPublicationBase().catch((error) => {
        new Notice(error instanceof Error ? error.message : String(error));
      });
    });

    const targets = root.createDiv({ cls: "targets" });
    for (const platform of PLATFORMS) {
      const selected = this.selected.has(platform.id);
      // 图标即平台标识：真实品牌 SVG，名称收进 title/aria-label
      const item = targets.createDiv({ cls: `target ${selected ? "selected" : "disabled"}` });
      item.setAttribute("title", platform.name);
      const check = item.createEl("button", { cls: "check", text: selected ? "✓" : "" });
      check.setAttribute("aria-label", `选择 ${platform.name}`);
      check.addEventListener("click", async () => {
        if (this.selected.has(platform.id)) this.selected.delete(platform.id);
        else this.selected.add(platform.id);
        await this.services.setSelectedPlatforms([...this.selected]);
        this.renderShell();
      });

      const main = item.createDiv({ cls: "target-main" });
      const top = main.createDiv({ cls: "target-top" });
      renderPlatformGlyph(top, platform, 20);
      main.createDiv({ text: platform.description, cls: "target-desc" });
    }

    const taskTitle = root.createDiv({ cls: "section-title" });
    taskTitle.createSpan({ text: "任务" });
    const taskList = root.createDiv({ cls: "targets" });
    taskList.dataset.role = "task-list";
    this.renderTasksInto(taskList, this.latestTasks);
  }

  private renderTasks(tasks: PublishTask[]): void {
    this.latestTasks = tasks;
    const root = this.contentEl.querySelector<HTMLElement>('[data-role="task-list"]');
    if (!root) return;
    this.renderTasksInto(root, tasks);
  }

  private renderTasksInto(root: HTMLElement, tasks: PublishTask[]): void {
    root.empty();
    const activeOrFailed = tasks.filter((task) =>
      task.status === "queued" ||
      task.status === "running" ||
      task.status === "awaiting_confirm" ||
      task.status === "failed",
    );
    if (!activeOrFailed.length) {
      root.createDiv({ cls: "target disabled", text: "暂无活跃任务；历史发布见发布库" });
      return;
    }

    for (const task of activeOrFailed.slice(0, 50)) {
      const platform = PLATFORM_BY_ID.get(task.platformId)!;
      const item = root.createDiv({ cls: `target ${task.status === "failed" ? "failed" : ""}` });
      item.setAttribute("title", platform.name);
      const main = item.createDiv({ cls: "target-main" });
      const top = main.createDiv({ cls: "target-top" });
      renderPlatformGlyph(top, platform, 20);
      const statusClass = task.status === "running" ? "running" : task.status === "awaiting_confirm" ? "waiting" : task.status === "success" ? "success" : task.status === "failed" ? "failed" : "";
      top.createSpan({ text: statusLabel(task.status), cls: `status ${statusClass}` });
      main.createDiv({ text: task.message || task.failReason || task.filePath, cls: "target-desc" });

      if (task.sourceChangedAfterStart) {
        main.createDiv({ text: "源文件在发布开始后已修改；平台内容不会自动更新。", cls: "target-desc warning" });
      }

      const actions = main.createDiv({ cls: "target-actions" });
      if (task.pageUrl) {
        const open = actions.createEl("button", { text: "打开页面", cls: "mini" });
        open.addEventListener("click", () => void this.services.engine.openPage(task.id));
      }
      if (task.status === "awaiting_confirm") {
        const complete = actions.createEl("button", { text: "标记完成", cls: "mini primary" });
        complete.addEventListener("click", () => this.showCompletionModal(task));
      }
      if (task.status === "queued") {
        const cancel = actions.createEl("button", { text: "取消", cls: "mini" });
        cancel.addEventListener("click", () => void this.services.engine.cancel(task.id));
      }
      if (task.status === "failed" || task.status === "success") {
        const retry = actions.createEl("button", { text: "按最新内容重试", cls: "mini" });
        retry.addEventListener("click", () => void this.services.engine.retry(task.id));
      }
    }
  }

  private showCompletionModal(task: PublishTask): void {
    this.completionTask = task;
    this.completionUrl = "";
    this.renderCompletionModal();
  }

  private renderCompletionModal(): void {
    this.contentEl.querySelector<HTMLElement>('[data-role="completion-modal"]')?.remove();
    if (!this.completionTask) return;

    const backdrop = this.contentEl.createDiv({ cls: "completion-backdrop" });
    backdrop.dataset.role = "completion-modal";
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) this.closeCompletionModal();
    });
    const modal = backdrop.createDiv({ cls: "completion-modal" });
    modal.createEl("h3", { text: "标记完成" });
    modal.createDiv({
      text: "如果已在平台完成发布，可以粘贴最终链接。没有链接时也会标记完成。",
      cls: "completion-desc",
    });
    modal.createEl("label", { text: "发布链接（可选）" });
    const input = modal.createEl("input", { type: "url" });
    input.placeholder = "https://...";
    input.value = this.completionUrl;
    input.addEventListener("input", () => {
      this.completionUrl = input.value;
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void this.submitCompletion();
    });

    const actions = modal.createDiv({ cls: "completion-actions" });
    const cancel = actions.createEl("button", { text: "取消", cls: "mini" });
    const submit = actions.createEl("button", { text: "保存到发布库", cls: "mini primary" });
    cancel.addEventListener("click", () => {
      this.closeCompletionModal();
    });
    submit.addEventListener("click", () => void this.submitCompletion());
    window.setTimeout(() => input.focus(), 0);
  }

  private closeCompletionModal(): void {
    this.completionTask = null;
    this.completionUrl = "";
    this.contentEl.querySelector<HTMLElement>('[data-role="completion-modal"]')?.remove();
  }

  private async submitCompletion(): Promise<void> {
    const task = this.completionTask;
    if (!task) return;
    const url = this.completionUrl.trim();
    this.closeCompletionModal();
    await this.services.engine.markComplete(task.id, url || undefined);
  }

  private async refreshPreview(): Promise<void> {
    const generation = ++this.previewGeneration;
    try {
      const live = readActiveSource(this.app);
      if (!live) {
        this.preview = null;
        this.findings = [{ level: "warning", message: "没有活动 Markdown 文件" }];
        this.renderShell();
        return;
      }
      if (live.raw === "" && live.origin === "vault") {
        live.raw = await this.app.vault.cachedRead(live.file);
      }
      const inferredType = /!\[\[|!\[[^\]]*\]\([^)]+\)/.test(live.raw) ? "image" as const : "article" as const;
      const source = await createSourceDraft(this.app, live, this.services.getDefaultPlatforms(inferredType));
      if (generation !== this.previewGeneration) return;
      this.preview = source;
      const images = source.assets.filter((asset) => asset.kind === "image");
      const rawEmbeds = parseImageEmbeds(live.raw);
      const bodyEmbeds = parseImageEmbeds(source.body);
      const imageSummary = images.length
        ? `已解析图片 ${images.length} 张`
        : `Markdown 图片 ${rawEmbeds.length} 张，但未生成附件`;
      this.findings = [
        { level: images.length ? "ok" : "warning", message: imageSummary },
        ...renderForPlatform(source, this.activePlatform).findings,
      ];
      this.findings = [
        {
          level: rawEmbeds.length && images.length === 0 ? "error" : images.length ? "ok" : "warning",
          message: imageSummary,
        },
        ...renderForPlatform(source, this.activePlatform).findings,
      ];
      if (this.mode !== "preview") this.renderShell();
      else {
        const root = this.contentEl.querySelector<HTMLElement>(".panel-body");
        if (root) this.renderPreview(root);
      }
    } catch (error) {
      if (generation !== this.previewGeneration) return;
      this.preview = null;
      this.findings = [{
        level: "error",
        message: error instanceof Error ? error.message : String(error),
      }];
      this.renderShell();
    }
  }

  async publishCurrent(): Promise<void> {
    const live = readActiveSource(this.app);
    if (!live) {
      new Notice("没有活动 Markdown 文件");
      return;
    }
    if (live.raw === "" && live.origin === "vault") {
      live.raw = await this.app.vault.cachedRead(live.file);
    }
    const source = await createSourceDraft(this.app, live, this.services.getDefaultPlatforms(/!\[\[|!\[[^\]]*\]\([^)]+\)/.test(live.raw) ? "image" : "article"));
    const selected = [...this.selected].filter((platformId) => platformSupportsType(platformId, source.type));
    if (!selected.length) {
      new Notice("没有可用于当前内容类型的发布目标");
      return;
    }
    await this.services.engine.enqueue(source, selected);
    this.mode = "publish";
    this.renderShell();
  }

  selectPlatforms(values: PlatformId[]): void {
    this.selected = new Set(values);
    if (!this.selected.has(this.activePlatform)) {
      this.activePlatform = values[0] ?? "weibo";
    }
  }
}

function statusLabel(status: PublishTask["status"]): string {
  const labels: Record<PublishTask["status"], string> = {
    queued: "排队",
    running: "执行中",
    awaiting_confirm: "待确认",
    success: "完成",
    failed: "失败",
    cancelled: "已取消",
  };
  return labels[status];
}
