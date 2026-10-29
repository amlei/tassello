import { MarkdownView, normalizePath, TFile, type App } from "obsidian";
import { splitNote } from "./frontmatter";
import { digestText, resolveCoverImage, resolveImageEmbeds } from "./assets";
import { mergeCoverAsset } from "./cover-assets";
import {
  markdownToHtml,
  plainFromMarkdown,
  stripLeadingTitleHeading,
  titleFromMarkdown,
} from "./markdown";
import { PLATFORMS, type PlatformId, type SourceDraft } from "../types";

export type LiveSource = {
  file: TFile;
  raw: string;
  origin: "active-editor" | "vault";
};

/** 活动编辑器的未保存 buffer 优先；只有离开编辑器上下文时才读 Vault 缓存。 */
export function readActiveSource(app: App): LiveSource | null {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (view?.file && isMarkdownFile(view.file)) {
    return { file: view.file, raw: view.editor.getValue(), origin: "active-editor" };
  }

  const file = app.workspace.getActiveFile();
  if (!file || !isMarkdownFile(file)) return null;
  return { file, raw: "", origin: "vault" };
}

export async function readVaultSource(app: App, file: TFile): Promise<LiveSource> {
  if (!isMarkdownFile(file)) throw new Error(`只能读取 Markdown 文件：${file.path}`);
  return { file, raw: await app.vault.cachedRead(file), origin: "vault" };
}

function findMarkdownView(app: App, filePath: string): MarkdownView | null {
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (view instanceof MarkdownView && view.file && isMarkdownFile(view.file) && view.file.path === filePath) {
      return view;
    }
  }
  return null;
}

/** 发布 worker 用：优先找同一路径仍打开的 MarkdownView，避免读取落后于未保存编辑器。 */
export function findOpenEditor(app: App, filePath: string): LiveSource | null {
  const view = findMarkdownView(app, filePath);
  return view?.file ? { file: view.file, raw: view.editor.getValue(), origin: "active-editor" } : null;
}

/** 发布前把同一路径的 MarkdownView buffer 通过官方 API 强制落盘。 */
export async function saveOpenEditor(app: App, filePath: string): Promise<boolean> {
  const view = findMarkdownView(app, filePath);
  if (!view) return false;
  await view.save();
  return true;
}

export async function resolveLiveFile(app: App, filePath: string): Promise<LiveSource> {
  const normalized = normalizePath(filePath);
  const open = findOpenEditor(app, normalized);
  if (open) return open;

  const file = app.vault.getAbstractFileByPath(normalized);
  if (!(file instanceof TFile)) {
    throw new Error(`源文件不存在或已删除：${normalized}`);
  }
  if (!isMarkdownFile(file)) throw new Error(`只能读取 Markdown 文件：${file.path}`);
  return readVaultSource(app, file);
}

export function isMarkdownFile(file: TFile): boolean {
  return file.extension.toLowerCase() === "md";
}

export async function createSourceDraft(
  app: App,
  input: LiveSource,
  defaultPlatformIds?: PlatformId[],
  options?: { sourceType?: import("../types").ContentType },
): Promise<SourceDraft> {
  const { frontmatter, body } = splitNote(input.raw);
  const file = input.file;
  const title = (frontmatter.title || titleFromMarkdown(body, file.basename) || file.basename).trim();
  const bodyForPayload = stripLeadingTitleHeading(body, title);
  const type = options?.sourceType ?? frontmatter.type ?? "article";
  const html = await markdownToHtml(bodyForPayload);
  const plain = plainFromMarkdown(bodyForPayload);
  const coverReference = frontmatter.cover;
  const { assets: resolvedAssets, findings } = await resolveImageEmbeds(app, file.path, bodyForPayload);
  const resolvedCover = await resolveCoverImage(app, file.path, coverReference);
  if (resolvedCover.finding) findings.push(resolvedCover.finding);
  if (findings.some((f) => f.level === "error")) {
    const error = findings.find((f) => f.level === "error");
    throw new Error(error?.message ?? "附件解析失败");
  }

  const dedupedAssets = Array.from(new Map(resolvedAssets.map((asset) => [asset.vaultPath, asset])).values());
  const { assets, cover } = mergeCoverAsset(
    dedupedAssets,
    resolvedCover.cover ?? dedupedAssets[0] ?? null,
  );
  const supportedIds = PLATFORMS.filter((platform) => platform.supports.includes(type)).map((platform) => platform.id);
  const requested = frontmatter.platforms?.filter((id) => supportedIds.includes(id));
  const defaults = (defaultPlatformIds ?? []).filter((id) => supportedIds.includes(id));
  const platformIds: PlatformId[] = requested?.length ? requested : defaults.length ? defaults : supportedIds;
  const contentDigest = digestText(
    JSON.stringify({
      path: file.path,
      raw: input.raw,
      assets: assets.map((asset) => [asset.vaultPath, asset.alt]),
      cover: cover?.vaultPath ?? null,
    }),
  );

  return {
    id: frontmatter.id ?? "",
    filePath: file.path,
    contentDigest,
    title,
    type,
    body: bodyForPayload,
    html,
    plain,
    assets,
    cover,
    platformIds,
    options: frontmatter.options ?? {},
  };
}
