import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import {
  configuredExtensionIds,
  extensionOrigin,
  type ExtensionDTO,
  type PublishCapabilityDTO,
} from "@tassello/shared";
import { getInstallationIdentity, readJsonFile, statePath, writeJsonAtomic } from "./state";

type StoredExtension = ExtensionDTO & { tokenHash: string };
type PreferredBrowser = { browser: "chrome" | "edge"; updatedAt: string };

const connected = new Map<string, { lastHeartbeatAt: string }>();
const listeners = new Set<() => void>();

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function extensionFile(clientId: string): string {
  return statePath("extensions", `${clientId}.json`);
}

function preferenceFile(): string {
  return statePath("extension-preference.json");
}

function browserId(label: string): "chrome" | "edge" | null {
  if (/edge/i.test(label)) return "edge";
  if (/chrome/i.test(label)) return "chrome";
  return null;
}

async function preferredBrowser(): Promise<PreferredBrowser | null> {
  return readJsonFile<PreferredBrowser | null>(preferenceFile(), null);
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function onPublishCapabilityChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

export function isTrustedExtensionOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  return configuredExtensionIds(process.env).some((extensionId) =>
    normalized === normalizeOrigin(extensionOrigin(extensionId))
  );
}

export async function setPreferredExtensionBrowser(browser: "chrome" | "edge"): Promise<void> {
  await writeJsonAtomic(preferenceFile(), {
    browser,
    updatedAt: new Date().toISOString(),
  } satisfies PreferredBrowser);
  notify();
}

async function listStoredExtensions(): Promise<StoredExtension[]> {
  const dir = statePath("extensions");
  await fs.mkdir(dir, { recursive: true });
  const files = (await fs.readdir(dir)).filter((name) => name.endsWith(".json"));
  const records = await Promise.all(files.map((name) =>
    readJsonFile<StoredExtension | null>(statePath("extensions", name), null),
  ));
  return records.filter((record): record is StoredExtension => !!record && !record.revoked);
}

async function activeStoredExtension(): Promise<StoredExtension | null> {
  const records = await listStoredExtensions();
  records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return records[0] ?? null;
}

export async function autoPairExtension(input: {
  origin: string | null | undefined;
  extensionId: string;
  clientId?: string;
  browserLabel: string;
  userAgent: string;
  version: string;
}): Promise<{ token: string; extension: ExtensionDTO }> {
  const trustedIds = configuredExtensionIds(process.env);
  if (
    !trustedIds.includes(input.extensionId) ||
    !input.origin ||
    normalizeOrigin(input.origin) !== normalizeOrigin(extensionOrigin(input.extensionId))
  ) {
    throw new Error("扩展来源未获信任");
  }
  const selected = await preferredBrowser();
  const currentBrowser = browserId(input.browserLabel);
  if (selected && selected.browser !== currentBrowser) {
    throw new Error(`当前已选择 ${selected.browser === "edge" ? "Edge" : "Chrome"} 扩展`);
  }
  if (!selected && currentBrowser) {
    await setPreferredExtensionBrowser(currentBrowser);
  }
  const current = await activeStoredExtension();
  if (current) {
    await writeJsonAtomic(extensionFile(current.clientId), { ...current, revoked: true, updatedAt: new Date().toISOString() });
    connected.delete(current.clientId);
  }
  const token = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const clientId = input.clientId?.trim() || `ext-${randomUUID()}`;
  const installation = await getInstallationIdentity();
  const stored: StoredExtension = {
    clientId,
    installationId: installation.installationId,
    browserLabel: input.browserLabel,
    userAgent: input.userAgent,
    version: input.version,
    connected: false,
    revoked: false,
    lastHeartbeatAt: null,
    createdAt: now,
    updatedAt: now,
    tokenHash: digest(token),
  };
  await writeJsonAtomic(extensionFile(clientId), stored);
  notify();
  const { tokenHash: _tokenHash, ...extension } = stored;
  return { token, extension };
}

export async function authenticateExtension(clientId: string, token: string): Promise<StoredExtension> {
  const record = await readJsonFile<StoredExtension | null>(extensionFile(clientId), null);
  if (!record || record.revoked || record.tokenHash !== digest(token)) {
    throw new Error("扩展凭据无效或已撤销");
  }
  return record;
}

export async function connectExtension(clientId: string): Promise<void> {
  const current = await activeStoredExtension();
  if (current && current.clientId !== clientId && connected.has(current.clientId)) {
    throw new Error("当前安装已有另一个浏览器扩展连接");
  }
  const record = await readJsonFile<StoredExtension | null>(extensionFile(clientId), null);
  if (!record || record.revoked) throw new Error("扩展记录不存在");
  const selected = await preferredBrowser();
  if (selected && selected.browser !== browserId(record.browserLabel)) {
    throw new Error("该浏览器不是当前选择的扩展");
  }
  const now = new Date().toISOString();
  connected.set(clientId, { lastHeartbeatAt: now });
  await writeJsonAtomic(extensionFile(clientId), {
    ...record,
    connected: true,
    lastHeartbeatAt: now,
    updatedAt: now,
  });
  notify();
}

export async function heartbeatExtension(clientId: string): Promise<void> {
  if (!connected.has(clientId)) return;
  connected.set(clientId, { lastHeartbeatAt: new Date().toISOString() });
  notify();
}

export async function disconnectExtension(clientId: string): Promise<void> {
  connected.delete(clientId);
  const record = await readJsonFile<StoredExtension | null>(extensionFile(clientId), null);
  if (record) {
    await writeJsonAtomic(extensionFile(clientId), {
      ...record,
      connected: false,
      updatedAt: new Date().toISOString(),
    });
  }
  notify();
}

export async function revokeExtension(clientId: string): Promise<void> {
  const record = await readJsonFile<StoredExtension | null>(extensionFile(clientId), null);
  connected.delete(clientId);
  if (record) {
    await writeJsonAtomic(extensionFile(clientId), {
      ...record,
      connected: false,
      revoked: true,
      updatedAt: new Date().toISOString(),
    });
  }
  notify();
}

export async function getPublishCapability(): Promise<PublishCapabilityDTO> {
  const identity = await getInstallationIdentity();
  const record = await activeStoredExtension();
  if (!record) {
    return {
      installationId: identity.installationId,
      state: "waiting",
      extension: {
        connected: false,
        clientId: null,
        lastHeartbeatAt: null,
        browserLabel: null,
      },
      reason: "浏览器扩展尚未连接",
    };
  }
  const inMemory = connected.get(record.clientId);
  const lastHeartbeatAt = inMemory?.lastHeartbeatAt ?? record.lastHeartbeatAt;
  const heartbeatFresh = !!lastHeartbeatAt && Date.now() - Date.parse(lastHeartbeatAt) < 45_000;
  const ready = !!inMemory && heartbeatFresh;
  return {
    installationId: identity.installationId,
    state: ready ? "ready" : "waiting",
    extension: {
      connected: !!inMemory,
      clientId: record.clientId,
      lastHeartbeatAt,
      browserLabel: record.browserLabel,
    },
    reason: ready ? null : "浏览器扩展未连接或心跳已过期",
  };
}

export async function listExtensions(): Promise<ExtensionDTO[]> {
  return (await listStoredExtensions()).map(({ tokenHash: _tokenHash, ...record }) => record);
}
