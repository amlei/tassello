import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CONTENT_TYPES,
  DEFAULT_SETTINGS,
  type AppSettings,
  type ContentType,
} from "@tassello/shared";

const writeQueues = new Map<string, Promise<void>>();

export type InstallationIdentity = {
  installationId: string;
  createdAt: string;
};

export function resolveDataDir(): string {
  if (process.env.TASSELLO_DATA_DIR) return path.resolve(process.env.TASSELLO_DATA_DIR);
  return path.join(os.homedir(), ".onda");
}

export function resolveStateDir(): string {
  return path.join(resolveDataDir(), "state");
}

/** 浏览器 Native Messaging Host 的稳定发现文件；不依赖安装包的动态数据目录。 */
export function resolveRuntimeDiscoveryPath(): string {
  return path.resolve(
    process.env.TASSELLO_RUNTIME_FILE ??
    path.join(os.homedir(), ".onda", "runtime.json"),
  );
}

export function resolveDefaultVaultPath(): string {
  return path.resolve(
    process.env.TASSELLO_VAULT_DIR ??
    path.join(os.homedir(), "Documents", "Onda"),
  );
}

export async function resolveVaultPath(): Promise<string> {
  const settings = await getSettings();
  return path.resolve(expandHomePath(settings.vaultPath ?? resolveDefaultVaultPath()));
}

export function resolveAttachmentDir(vaultPath: string, attachmentPath: string): string {
  const resolvedPath = expandHomePath(attachmentPath);
  return path.isAbsolute(resolvedPath)
    ? path.resolve(resolvedPath)
    : path.resolve(vaultPath, resolvedPath);
}

export function statePath(...parts: string[]): string {
  return path.join(resolveStateDir(), ...parts);
}

export async function ensureStateLayout(): Promise<void> {
  await Promise.all([
    fs.mkdir(resolveStateDir(), { recursive: true }),
    ...["accounts", "extensions", "tasks", "logs", "uploads", "locks"].map((dir) =>
      fs.mkdir(statePath(dir), { recursive: true }),
    ),
  ]);
}

export async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const previous = writeQueues.get(file) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
    const handle = await fs.open(temp, "w");
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temp, file);
  });
  writeQueues.set(file, next);
  try {
    await next;
  } finally {
    if (writeQueues.get(file) === next) writeQueues.delete(file);
  }
}

export async function getInstallationIdentity(): Promise<InstallationIdentity> {
  await ensureStateLayout();
  const file = statePath("identity.json");
  const existing = await readJsonFile<InstallationIdentity | null>(file, null);
  if (existing?.installationId) return existing;
  const created = { installationId: randomUUID(), createdAt: new Date().toISOString() };
  await writeJsonAtomic(file, created);
  return created;
}

function expandHomePath(value: string): string {
  const normalized = value.trim().replace(/^~(?=$|[\\/])/, os.homedir());
  return path.normalize(normalized);
}

function normalizeAttachmentPath(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_SETTINGS.attachmentPath;
  const trimmed = value.trim().replace(/\\/g, "/");
  if (path.isAbsolute(trimmed) || trimmed.startsWith("~/")) {
    const normalized = path.normalize(trimmed).replace(/\\/g, "/");
    const root = path.parse(normalized).root.replace(/\\/g, "/");
    return normalized === root ? normalized : normalized.replace(/\/+$/, "");
  }
  const relative = trimmed.replace(/^\.\/+/, "").replace(/\/+$/, "");
  return relative || DEFAULT_SETTINGS.attachmentPath;
}

function normalizeSettings(value: Partial<AppSettings> | null | undefined): AppSettings {
  const defaultTargets = Object.fromEntries(CONTENT_TYPES.map((type) => {
    const candidates = value?.defaultTargets?.[type as ContentType];
    const fallback = DEFAULT_SETTINGS.defaultTargets[type];
    return [
      type,
      Array.isArray(candidates)
        ? candidates.filter((id): id is string => typeof id === "string" && id.length > 0)
        : fallback,
    ];
  })) as Record<ContentType, string[]>;
  return {
    defaultTargets,
    vaultPath: typeof value?.vaultPath === "string" && value.vaultPath.trim()
      ? path.resolve(expandHomePath(value.vaultPath))
      : null,
    attachmentPath: normalizeAttachmentPath(value?.attachmentPath),
    theme: value?.theme === "light" || value?.theme === "dark" ? value.theme : "system",
  };
}

export async function getSettings(): Promise<AppSettings> {
  await ensureStateLayout();
  return normalizeSettings(await readJsonFile<Partial<AppSettings> | null>(statePath("settings.json"), null));
}

export async function saveSettings(patch: {
  defaultTargets?: Partial<Record<ContentType, string[]>>;
  vaultPath?: string | null;
  attachmentPath?: string;
  theme?: AppSettings["theme"];
}): Promise<AppSettings> {
  const current = await getSettings();
  const next = normalizeSettings({
    defaultTargets: { ...current.defaultTargets, ...(patch.defaultTargets ?? {}) },
    vaultPath: patch.vaultPath !== undefined ? patch.vaultPath : current.vaultPath,
    attachmentPath: patch.attachmentPath ?? current.attachmentPath,
    theme: patch.theme ?? current.theme,
  });
  const vaultPath = next.vaultPath ?? resolveDefaultVaultPath();
  await Promise.all([
    fs.mkdir(vaultPath, { recursive: true }),
    fs.mkdir(resolveAttachmentDir(vaultPath, next.attachmentPath), { recursive: true }),
  ]);
  await writeJsonAtomic(statePath("settings.json"), next);
  return next;
}
