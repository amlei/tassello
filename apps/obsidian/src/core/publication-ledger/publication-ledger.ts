import { Notice, TFile, TFolder, normalizePath, type App } from "obsidian";
import { parse as parseYaml } from "yaml";
import type { PublishTask } from "../types";
import { PLATFORMS, PLATFORM_BY_ID } from "../types";
import { publicationBaseTemplate } from "./base-template";
import { deriveOverallStatus, isPlatformStatus } from "./status";
import {
  DEFAULT_PUBLICATION_BASE_PATH,
  PLATFORM_STATUS_BY_TASK_STATUS,
  PUBLICATION_STATUSES,
  type PlatformPublicationMeta,
  type PublicationSettings,
} from "./types";

type PublicationFrontmatter = Record<string, unknown>;

/** 发布台账只写回源笔记属性，并维护一个用户可见的 .base 视图。 */
export class PublicationLedger {
  constructor(
    private readonly app: App,
    private settings: PublicationSettings,
  ) {}

  updateSettings(settings: PublicationSettings): void {
    this.settings = settings;
  }

  static accepts(task: PublishTask): boolean {
    return PUBLICATION_STATUSES.has(task.status as Parameters<typeof PUBLICATION_STATUSES.has>[0]);
  }

  async applyTask(task: PublishTask): Promise<boolean> {
    if (!PublicationLedger.accepts(task)) return false;
    const file = this.app.vault.getAbstractFileByPath(normalizePath(task.filePath));
    if (!(file instanceof TFile)) return false;

    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        this.updateFrontmatter(frontmatter, task);
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`发布库写入失败：${message}`);
      return false;
    }
  }

  async ensureBase(): Promise<TFile | null> {
    const path = normalizePath(this.settings.basePath);
    if (!path || path === "/" || path.endsWith("/")) {
      new Notice("发布库路径无效；请在设置里填写一个 .base 文件路径。");
      return null;
    }

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      if (await this.isManagedBase(existing)) {
        await this.writeBase(existing);
      }
      return existing;
    }
    if (existing) {
      new Notice("发布库路径已被文件夹占用；请在设置里改成一个 .base 文件路径。");
      return null;
    }
    if (!this.settings.autoCreate) return null;

    await this.ensureParentFolder(path);
    const created = await this.app.vault.create(path, publicationBaseTemplate(this.settings));
    return created;
  }

  private async writeBase(file: TFile): Promise<void> {
    await this.app.vault.process(file, () => publicationBaseTemplate(this.settings));
  }

  private async isManagedBase(file: TFile): Promise<boolean> {
    // 先识别标记再解析：插件早期生成的 Base 若有语法错误，也要允许自动修复。
    const raw = await this.app.vault.cachedRead(file);
    if (!raw.match(/^\s*tassello-managed:\s*publication-ledger\/v1\s*(?:#.*)?$/m)) return false;
    try {
      const parsed = (parseYaml(raw) ?? {}) as Record<string, unknown>;
      return parsed["tassello-managed"] === "publication-ledger/v1";
    } catch {
      return true;
    }
  }

  private async ensureParentFolder(path: string): Promise<void> {
    const parentPath = normalizePath(path.split("/").slice(0, -1).join("/"));
    if (!parentPath || parentPath === "/") return;
    if (this.app.vault.getAbstractFileByPath(parentPath)) return;

    const segments = parentPath.split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      const existing = this.app.vault.getAbstractFileByPath(normalizePath(current));
      if (!existing) await this.app.vault.createFolder(normalizePath(current));
      else if (!(existing instanceof TFolder)) {
        throw new Error(`无法创建发布库目录：${current} 已被文件占用`);
      }
    }
  }

  private updateFrontmatter(frontmatter: PublicationFrontmatter, task: PublishTask): void {
    const platformId = task.platformId;
    const platform = PLATFORM_BY_ID.get(platformId);
    if (!platform) return;

    frontmatter["tassello-publish"] = true;

    const currentPlatforms = new Set(
      Array.isArray(frontmatter["tassello-platforms"])
        ? frontmatter["tassello-platforms"].filter((item): item is typeof platformId => item === platformId)
        : [],
    );
    currentPlatforms.add(platformId);
    frontmatter["tassello-platforms"] = PLATFORMS
      .map((item) => item.id)
      .filter((id) => currentPlatforms.has(id));

    const status = PLATFORM_STATUS_BY_TASK_STATUS[task.status as keyof typeof PLATFORM_STATUS_BY_TASK_STATUS];
    const draftUrl = task.pageUrl || null;
    const publishUrl = task.url && task.url !== task.pageUrl ? task.url : task.status === "success" ? task.url || null : null;

    const platformMeta: PlatformPublicationMeta = {
      status,
      draftUrl,
      publishUrl,
      finishedAt: task.finishedAt || null,
      failReason: task.failReason || null,
      sourceChanged: Boolean(task.sourceChangedAfterStart),
    };
    frontmatter[`tassello-${platformId}-status`] = platformMeta.status;
    frontmatter[`tassello-${platformId}-draft-url`] = platformMeta.draftUrl;
    frontmatter[`tassello-${platformId}-publish-url`] = platformMeta.publishUrl;
    frontmatter[`tassello-${platformId}-finished-at`] = platformMeta.finishedAt;
    frontmatter[`tassello-${platformId}-source-changed`] = platformMeta.sourceChanged;
    if (this.settings.includeFailReason) {
      frontmatter[`tassello-${platformId}-fail-reason`] = platformMeta.failReason;
    }

    const byPlatform: Partial<Record<typeof platformId, PlatformPublicationMeta>> = {};
    for (const item of PLATFORMS) {
      const value = frontmatter[`tassello-${item.id}-status`];
      if (!isPlatformStatus(value)) continue;
      byPlatform[item.id] = {
        status: value,
        draftUrl: typeof frontmatter[`tassello-${item.id}-draft-url`] === "string"
          ? frontmatter[`tassello-${item.id}-draft-url`] as string
          : null,
        publishUrl: typeof frontmatter[`tassello-${item.id}-publish-url`] === "string"
          ? frontmatter[`tassello-${item.id}-publish-url`] as string
          : null,
      };
    }
    frontmatter["tassello-status"] = deriveOverallStatus(byPlatform);
    frontmatter["tassello-updated-at"] = task.updatedAt;
  }
}
