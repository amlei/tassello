import { Notice, normalizePath, type App } from "obsidian";
import { createSourceDraft, resolveLiveFile } from "../source/source-resolver";
import { renderForPlatform } from "../render/renderers";
import { digestText } from "../source/assets";
import type { AdapterCtx, PlatformPageRunner } from "@tassello/platform-core";
import { createObsidianPageRunner } from "../browser/platform-page-runner";
import { toPostDraft, toPublishOptions } from "../shared/post-draft";
import { sharedAdapter } from "../platform/shared-registry";
import { DefaultChromeManager } from "../browser/default-chrome";
import type { PlatformId, PublishTask, SourceDraft } from "../types";
import { PLATFORM_BY_ID } from "../types";
import type { PublicationLedger } from "../publication-ledger/publication-ledger";

const now = () => new Date().toISOString();

export type TaskEvent = (tasks: PublishTask[]) => void;

export class TaskEngine {
  private running = false;
  private platformQueues = new Map<PlatformId, Promise<void>>();
  private changeListeners = new Set<TaskEvent>();
  private readonly runPage: PlatformPageRunner;
  private readonly secrets: AdapterCtx["secrets"] = {
    get: async () => null,
    set: async () => {},
  };

  constructor(
    private readonly app: App,
    private readonly browser: DefaultChromeManager,
    private readonly store: {
      all(): PublishTask[];
      get(id: string): PublishTask | undefined;
      upsert(task: PublishTask): Promise<void>;
      remove(id: string): Promise<void>;
      replace(tasks: PublishTask[]): Promise<void>;
      renamePath(oldPath: string, newPath: string): Promise<boolean>;
    },
    private readonly ledger?: PublicationLedger,
  ) {
    this.runPage = createObsidianPageRunner(browser);
  }

  subscribe(listener: TaskEvent): () => void {
    this.changeListeners.add(listener);
    listener(this.store.all());
    return () => this.changeListeners.delete(listener);
  }

  private emit(): void {
    const tasks = this.store.all();
    for (const listener of this.changeListeners) listener(tasks);
  }

  private async patch(taskId: string, patch: Partial<PublishTask>): Promise<PublishTask | undefined> {
    const task = this.store.get(taskId);
    if (!task) return undefined;
    const next: PublishTask = { ...task, ...patch, updatedAt: now() };
    await this.store.upsert(next);
    this.emit();
    return next;
  }

  async enqueue(source: SourceDraft, platformIds: PlatformId[]): Promise<PublishTask[]> {
    // 同一文件+平台已有排队/执行中/待确认的任务时不重复排队，避免旧填充覆盖新填充
    const active = this.store.all().filter(
      (task) =>
        task.filePath === source.filePath &&
        platformIds.includes(task.platformId) &&
        (task.status === "queued" || task.status === "running" || task.status === "awaiting_confirm"),
    );
    const skipped = new Set(active.map((task) => task.platformId));
    const requested = platformIds.filter((platformId) => !skipped.has(platformId));
    if (skipped.size) {
      const names = [...skipped].map((id) => PLATFORM_BY_ID.get(id)?.name ?? id).join("、");
      new Notice(`${names} 已有未完成的发布任务，本次跳过；请在任务列表处理旧任务`);
    }
    if (!requested.length) return [];
    const created: PublishTask[] = [];
    for (const platformId of requested) {
      const task: PublishTask = {
        id: `${Date.now().toString(36)}-${platformId}-${Math.random().toString(36).slice(2, 7)}`,
        filePath: source.filePath,
        platformId,
        status: "queued",
        stage: 0,
        progress: 0,
        message: "已排队",
        sourceDigestAtStart: source.contentDigest,
        sourceChangedAfterStart: false,
        pageUrl: null,
        createdAt: now(),
        updatedAt: now(),
        finishedAt: null,
      };
      await this.store.upsert(task);
      created.push(task);
      this.emit();
      this.schedule(task.id, platformId);
    }
    return created;
  }

  private schedule(taskId: string, platformId: PlatformId): void {
    const previous = this.platformQueues.get(platformId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.runTask(taskId));
    this.platformQueues.set(platformId, next.catch(() => undefined));
  }

  async cancel(taskId: string): Promise<void> {
    const task = this.store.get(taskId);
    if (!task) return;
    if (task.status !== "queued") {
      new Notice("只有排队中的任务可以取消；已打开的平台页面请在平台里处理。");
      return;
    }
    const updated = await this.patch(taskId, {
      status: "cancelled",
      progress: 100,
      message: "已取消",
      finishedAt: now(),
    });
    if (updated) await this.writeLedger(updated, true);
  }

  async markComplete(taskId: string, url?: string): Promise<void> {
    const task = this.store.get(taskId);
    if (!task) return;
    const next = await this.patch(taskId, {
      status: "success",
      stage: 3,
      progress: 100,
      message: "已人工确认",
      url: url || null,
      finishedAt: now(),
    });
    if (next) await this.writeLedger(next, true);
    new Notice("已标记完成");
  }

  async retry(taskId: string): Promise<void> {
    const task = this.store.get(taskId);
    if (!task) return;
    await this.patch(taskId, {
      status: "queued",
      stage: 0,
      progress: 0,
      failReason: null,
      message: "已重新排队；执行时将读取当前最新内容",
      pageUrl: null,
      url: null,
      sourceChangedAfterStart: false,
      finishedAt: null,
    });
    this.schedule(taskId, task.platformId);
  }

  async openPage(taskId: string): Promise<void> {
    const task = this.store.get(taskId);
    if (!task?.pageUrl) return;
    window.open(task.pageUrl, "_blank");
  }

  private async runTask(taskId: string): Promise<void> {
    const existing = this.store.get(taskId);
    if (!existing || existing.status !== "queued") return;

    let task = await this.patch(taskId, {
      status: "running",
      stage: 0,
      progress: 5,
      failReason: null,
      message: "读取 Obsidian 最新内容",
      finishedAt: null,
    });
    if (!task) return;

    const progress = (stage: number, value: number, message?: string) => {
      void this.patch(taskId, { stage, progress: value, message });
    };

    try {
      const live = await resolveLiveFile(this.app, normalizePath(task.filePath));
      const source = await createSourceDraft(this.app, live);
      const startDigest = digestText(JSON.stringify({ raw: live.raw, assets: source.assets.map((asset) => asset.vaultPath) }));
      await this.patch(taskId, { sourceDigestAtStart: startDigest, sourceChangedAfterStart: false });

      // 只用本地 renderer 做发布前快速校验；真正平台流程统一由 packages/platforms/* 执行。
      const rendered = renderForPlatform(source, task.platformId);
      const errors = rendered.findings.filter((finding) => finding.level === "error");
      if (errors.length) {
        throw new Error(errors.map((finding) => finding.message).join("；"));
      }

      const post = toPostDraft(source, task.platformId);
      const adapter = sharedAdapter(task.platformId);
      if (!adapter) throw new Error(`平台 ${task.platformId} 的共享适配器未注册`);
      await this.patch(taskId, { pageUrl: null });
      const result = await adapter.publish(
        post,
        undefined,
        {
          secrets: this.secrets,
          log: (event, payload) => console.debug("[tassello]", event, payload ?? ""),
          runPage: this.runPage,
        },
        (event) => progress(event.stage, event.progress, event.message ?? undefined),
        toPublishOptions(source, task.platformId, post.type),
      );

      if (result.needsManualConfirm) {
        await this.patch(taskId, {
          status: "awaiting_confirm",
          stage: 3,
          progress: 100,
          message: "请在浏览器中检查并手动完成发布",
          failReason: null,
          pageUrl: result.url,
          url: null,
        });
      } else {
        await this.patch(taskId, {
          status: "success",
          stage: 3,
          progress: 100,
          message: "已自动发送",
          failReason: null,
          pageUrl: result.url,
          url: result.url,
          finishedAt: now(),
        });
      }
      await this.checkSourceChange(taskId, existing.filePath, startDigest);
      await this.writeLedger(this.store.get(taskId), true);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.patch(taskId, {
        status: "failed",
        failReason: reason,
        message: null,
        finishedAt: now(),
      });
      await this.writeLedger(this.store.get(taskId));
    }
  }

  private async writeLedger(task: PublishTask | undefined, archive = false): Promise<void> {
    if (!task || !this.ledger) return;
    const saved = await this.ledger.applyTask(task);
    if (saved && archive && (task.status === "success" || task.status === "cancelled")) {
      await this.store.remove(task.id);
      this.emit();
    }
  }

  private async checkSourceChange(taskId: string, filePath: string, startDigest: string): Promise<void> {
    try {
      const live = await resolveLiveFile(this.app, normalizePath(filePath));
      const source = await createSourceDraft(this.app, live);
      const digest = digestText(JSON.stringify({ raw: live.raw, assets: source.assets.map((asset) => asset.vaultPath) }));
      if (digest !== startDigest) await this.patch(taskId, { sourceChangedAfterStart: true });
    } catch {
      await this.patch(taskId, { sourceChangedAfterStart: true });
    }
  }

  async markInterruptedOnLoad(): Promise<void> {
    const interrupted = this.store
      .all()
      .filter((task) => task.status === "queued" || task.status === "running")
      .map((task) => ({
        ...task,
        status: "failed" as const,
        failReason: task.status === "queued"
          ? "Obsidian 重启后排队任务未恢复"
          : "Obsidian 重启时任务被中断",
        updatedAt: now(),
        finishedAt: now(),
      }));
    if (!interrupted.length) return;
    const map = new Map(interrupted.map((task) => [task.id, task]));
    await this.store.replace(this.store.all().map((task) => map.get(task.id) ?? task));
    this.emit();
    for (const task of interrupted) await this.writeLedger(task);
  }

  async renamePath(oldPath: string, newPath: string): Promise<void> {
    await this.store.renamePath(oldPath, newPath);
    this.emit();
  }

  async markInterruptedOnUnload(): Promise<void> {
    const changed: PublishTask[] = [];
    for (const task of this.store.all()) {
      if (task.status === "queued" || task.status === "running") {
        changed.push({
          ...task,
          status: "failed",
          failReason: task.status === "queued" ? "Obsidian 退出时任务尚未执行" : "Obsidian 退出时任务被中断",
          updatedAt: now(),
          finishedAt: now(),
        });
      }
    }
    if (changed.length) {
      const map = new Map(changed.map((task) => [task.id, task]));
      await this.store.replace(this.store.all().map((task) => map.get(task.id) ?? task));
      for (const task of changed) await this.writeLedger(task);
    }
  }
}
