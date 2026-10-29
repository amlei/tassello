import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ContentType } from "@tassello/shared";
import {
  splitFrontmatter,
  stringifyDocument,
  type TasselloFrontmatter,
} from "./frontmatter";
import {
  extractMedia,
  normalizeMediaOrder,
  plainFromMarkdown,
  stripLeadingTitle,
  titleFromMarkdown,
  unsupportedMarkdownFeatures,
  type MediaRef,
} from "./markdown";

export type DocumentStatus = "ready" | "missing" | "identity_conflict" | "invalid_frontmatter";

export type VaultDocument = {
  id: string;
  type: ContentType;
  title: string;
  filePath: string;
  relativePath: string;
  createdAt: string;
  updatedAt: string;
  manualOrder: number;
  platforms: string[];
  cover: string | null;
  options: Record<string, unknown>;
  markdown: string;
  bodyMarkdown: string;
  plain: string;
  media: MediaRef[];
  fingerprint: string;
  status: DocumentStatus;
  issues: string[];
  rawFrontmatter: Record<string, unknown>;
};

export type DocumentQuery = {
  type?: ContentType;
  query?: string;
  sort?: "recent" | "oldest" | "title" | "manual";
};

const TYPE_DIR: Record<ContentType, string> = {
  article: "articles",
  image: "images",
  video: "videos",
  audio: "audios",
};

const IGNORED_DIRS = new Set([".git", ".obsidian", ".onda", ".tassello", "node_modules"]);

function fingerprint(stat: { mtimeMs: number; size: number }, raw: string): string {
  return `${Math.round(stat.mtimeMs)}:${stat.size}:${createHash("sha256").update(raw).digest("hex")}`;
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join("/");
}

async function walkMarkdown(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "zh"))) {
    if (entry.name.startsWith(".") && IGNORED_DIRS.has(entry.name)) continue;
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkMarkdown(target)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(target);
  }
  return files;
}

export function parseDocumentContent(
  vaultPath: string,
  filePath: string,
  raw: string,
  stat: { mtimeMs: number; size: number; birthtimeMs?: number },
): VaultDocument {
  const parsed = splitFrontmatter(raw);
  const relativePath = normalizeRelativePath(path.relative(vaultPath, filePath));
  const fallbackTitle = path.basename(filePath, path.extname(filePath));
  const type = parsed.data.type ?? "article";
  const title = titleFromMarkdown(parsed.body, fallbackTitle);
  const markdown = parsed.body.trim();
  const bodyMarkdown = stripLeadingTitle(markdown, title);
  const id = parsed.data.id ?? `invalid:${relativePath}`;
  const createdAt = new Date(stat.birthtimeMs ?? stat.mtimeMs).toISOString();
  const updatedAt = new Date(stat.mtimeMs).toISOString();
  const issues = [
    ...(parsed.error ? [parsed.error] : []),
    ...unsupportedMarkdownFeatures(markdown),
  ];
  const bodyMedia = normalizeMediaOrder(type, extractMedia(markdown));
  const cover = parsed.data.cover ?? null;
  const media = [...bodyMedia];
  if (cover) {
    const coverRef = extractMedia(`![封面](${cover})`).find((item) => item.kind === "image");
    if (
      coverRef
      && !media.some((item) =>
        item.kind === "image"
        && item.source === coverRef.source
        && item.resolved === coverRef.resolved
      )
    ) {
      media.push({ ...coverRef, order: media.length, role: "cover" });
    }
  }
  return {
    id,
    type,
    title: title || fallbackTitle,
    filePath,
    relativePath,
    createdAt,
    updatedAt,
    manualOrder: parsed.data.manualOrder ?? 0,
    platforms: parsed.data.platforms ?? [],
    cover,
    options: parsed.data.options ?? {},
    markdown,
    bodyMarkdown,
    plain: plainFromMarkdown(bodyMarkdown),
    media,
    fingerprint: fingerprint(stat, raw),
    status: parsed.error ? "invalid_frontmatter" : "ready",
    issues,
    rawFrontmatter: parsed.rawData,
  };
}

export async function parseDocumentFile(vaultPath: string, filePath: string): Promise<VaultDocument> {
  const raw = await fs.readFile(filePath, "utf8");
  const stat = await fs.stat(filePath);
  return parseDocumentContent(vaultPath, filePath, raw, stat);
}

export async function scanDocuments(vaultPath: string): Promise<VaultDocument[]> {
  await fs.mkdir(vaultPath, { recursive: true });
  const files = await walkMarkdown(vaultPath);
  const documents = await Promise.all(files.map((file) => parseDocumentFile(vaultPath, file)));
  const counts = new Map<string, number>();
  for (const document of documents) {
    if (document.status === "ready") counts.set(document.id, (counts.get(document.id) ?? 0) + 1);
  }
  return documents.map((document) => {
    if (document.status !== "ready" || (counts.get(document.id) ?? 0) < 2) return document;
    return {
      ...document,
      status: "identity_conflict",
      issues: [...document.issues, `稿件 ID 重复：${document.id}`],
    };
  });
}

export async function listDocuments(vaultPath: string, query: DocumentQuery = {}): Promise<VaultDocument[]> {
  let documents = await scanDocuments(vaultPath);
  if (query.type) documents = documents.filter((document) => document.type === query.type);
  const needle = query.query?.trim().toLowerCase();
  if (needle) {
    documents = documents.filter((document) =>
      `${document.title}\n${document.plain}\n${document.id}`.toLowerCase().includes(needle),
    );
  }
  const sort = query.sort ?? "recent";
  documents.sort((a, b) => {
    if (sort === "manual") return a.manualOrder - b.manualOrder;
    if (sort === "title") return a.title.localeCompare(b.title, "zh");
    const delta = Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
    return sort === "oldest" ? delta : -delta;
  });
  return documents;
}

export async function getDocument(vaultPath: string, id: string): Promise<VaultDocument | null> {
  return (await scanDocuments(vaultPath)).find((document) => document.id === id) ?? null;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return slug || "未命名";
}

async function uniqueTarget(dir: string, base: string): Promise<string> {
  for (let index = 1; index < 10_000; index += 1) {
    const suffix = index === 1 ? "" : `-${index}`;
    const target = path.join(dir, `${base}${suffix}.md`);
    try {
      await fs.access(target);
    } catch {
      return target;
    }
  }
  throw new Error("无法生成唯一文件名");
}

export async function createDocument(
  vaultPath: string,
  input: { type: ContentType; title?: string; markdown?: string; platforms?: string[]; options?: Record<string, unknown> },
): Promise<VaultDocument> {
  const id = `m${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const title = input.title?.trim() || "未命名";
  const dir = path.join(vaultPath, TYPE_DIR[input.type]);
  await fs.mkdir(dir, { recursive: true });
  const filePath = await uniqueTarget(dir, slugify(title));
  const body = (input.markdown ?? "").trim();
  const markdown = body.startsWith("# ") ? body : `# ${title}${body ? `\n\n${body}` : ""}`;
  const raw = stringifyDocument({
    id,
    type: input.type,
    platforms: input.platforms,
    options: input.options,
  }, markdown);
  await atomicWrite(filePath, raw);
  return parseDocumentFile(vaultPath, filePath);
}

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  const handle = await fs.open(temp, "w");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temp, filePath);
}

export async function updateDocument(
  vaultPath: string,
  id: string,
  patch: {
    title?: string;
    markdown?: string;
    platforms?: string[];
    cover?: string | null;
    options?: Record<string, unknown>;
    manualOrder?: number;
    expectedFingerprint?: string;
  },
): Promise<VaultDocument> {
  const current = await getDocument(vaultPath, id);
  if (!current) throw new Error("稿件不存在");
  if (patch.expectedFingerprint && current.fingerprint !== patch.expectedFingerprint) {
    throw new Error("稿件已被另一个应用修改，请重新加载后再保存");
  }
  const requestedTitle = patch.title?.trim();
  const bodyTitle = patch.markdown === undefined
    ? undefined
    : titleFromMarkdown(patch.markdown, "");
  const title = requestedTitle || bodyTitle || current.title;
  let markdown = patch.markdown ?? current.markdown;
  if (patch.markdown !== undefined && !bodyTitle) {
    markdown = `# ${title}\n\n${markdown.trimStart()}`;
  } else if (patch.title !== undefined && title !== bodyTitle) {
    const expression = /^ {0,3}#\s+.+$/m;
    markdown = expression.test(markdown)
      ? markdown.replace(expression, `# ${title}`)
      : `# ${title}\n\n${markdown}`;
  }
  const frontmatter: TasselloFrontmatter = {
    id: current.id,
    type: current.type,
    manualOrder: patch.manualOrder ?? current.manualOrder,
    platforms: patch.platforms ?? current.platforms,
    cover: patch.cover === undefined ? current.cover ?? undefined : patch.cover ?? undefined,
    options: patch.options ?? current.options,
  };
  await atomicWrite(current.filePath, stringifyDocument(frontmatter, markdown, current.rawFrontmatter));
  return parseDocumentFile(vaultPath, current.filePath);
}

export async function deleteDocument(vaultPath: string, id: string): Promise<void> {
  const current = await getDocument(vaultPath, id);
  if (!current) return;
  const trash = path.join(vaultPath, ".onda", "trash");
  await fs.mkdir(trash, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.rename(current.filePath, path.join(trash, `${stamp}-${path.basename(current.filePath)}`));
}

export function typeDirectory(type: ContentType): string {
  return TYPE_DIR[type];
}
