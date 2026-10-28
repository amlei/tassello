import { randomUUID } from "node:crypto";
import { getPlatformMeta, PLATFORM_METAS } from "@tassello/platform-core";
import {
  extensionAccountResultSchema,
  extensionLoginOpenedSchema,
  type AccountDTO,
  type ExtensionAccountRequest,
  type ExtensionAccountResult,
  type ExtensionLoginOpened,
  type PlatformDTO,
} from "@tassello/shared";
import {
  getStoredAccount,
  listPlatforms,
  saveAccountVerification,
  toAccountDTO,
  type StoredAccount,
} from "./account-store";
import { getPublishCapability } from "./extensions";
import { needsRssProbe, recordRssDiscovery } from "./podcast-rss";

const VERIFY_TIMEOUT_MS = 45_000;
const LOGIN_TIMEOUT_MS = 10_000;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

type ExtensionAccountConnection = {
  clientId: string;
  browserLabel: string;
  accountProtocolVersion: number;
};

type PendingRequest =
  | {
    type: "account.verify";
    requestId: string;
    platformId: string;
    resolve: (result: ExtensionAccountResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
  | {
    type: "account.open-login";
    requestId: string;
    platformId: string;
    resolve: (result: ExtensionLoginOpened) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };

let connection: ExtensionAccountConnection | null = null;
let dispatcher: ((request: ExtensionAccountRequest) => boolean) | null = null;
let reconcilePromise: Promise<void> | null = null;
let verificationTail: Promise<void> = Promise.resolve();
const pending = new Map<string, PendingRequest>();
const activeVerifications = new Map<string, Promise<AccountDTO>>();
const checkingPlatforms = new Set<string>();
const listeners = new Set<() => void>();

export class AccountSyncError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 503 = 409,
  ) {
    super(message);
    this.name = "AccountSyncError";
  }
}

function notifyAccountsChanged(): void {
  for (const listener of listeners) listener();
}

function rejectPending(message: string): void {
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(new AccountSyncError(message, 409));
  }
  pending.clear();
  checkingPlatforms.clear();
}

function assertConnected(): ExtensionAccountConnection {
  if (!connection) {
    throw new AccountSyncError("浏览器扩展未连接", 409);
  }
  if (
    !Number.isInteger(connection.accountProtocolVersion)
    || connection.accountProtocolVersion < 1
    || connection.accountProtocolVersion > 1000
  ) {
    throw new AccountSyncError("请更新浏览器扩展后再获取平台账号", 409);
  }
  if (!dispatcher) {
    throw new AccountSyncError("账号同步通道尚未就绪", 503);
  }
  return connection;
}

function requestExtension<T extends ExtensionAccountResult | ExtensionLoginOpened>(
  type: "account.verify" | "account.open-login",
  platformId: string,
  timeoutMs: number,
  includeRss = false,
): Promise<T> {
  assertConnected();
  const requestId = randomUUID();
  const request: ExtensionAccountRequest = {
    type,
    requestId,
    platformId,
    ...(includeRss ? { includeRss: true } : {}),
  };
  const result = new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      if (type === "account.verify") checkingPlatforms.delete(platformId);
      reject(new AccountSyncError(type === "account.verify" ? "账号检查超时，请重试" : "打开登录页超时，请重试", 409));
      notifyAccountsChanged();
    }, timeoutMs);
    const entry = {
      type,
      requestId,
      platformId,
      resolve,
      reject,
      timer,
    } as PendingRequest;
    pending.set(requestId, entry);
    let sent = false;
    try {
      sent = dispatcher?.(request) === true;
    } catch {
      sent = false;
    }
    if (!sent) {
      clearTimeout(timer);
      pending.delete(requestId);
      if (type === "account.verify") checkingPlatforms.delete(platformId);
      reject(new AccountSyncError("浏览器扩展未连接", 409));
    }
  });
  return result;
}

function enqueueVerification<T>(run: () => Promise<T>): Promise<T> {
  const result = verificationTail.catch(() => undefined).then(run);
  verificationTail = result.then(() => undefined, () => undefined);
  return result;
}

export function setExtensionAccountRequestDispatcher(
  next: ((request: ExtensionAccountRequest) => boolean) | null,
): void {
  dispatcher = next;
}

export function setExtensionAccountConnection(next: ExtensionAccountConnection | null): void {
  connection = next
    ? {
      ...next,
      accountProtocolVersion: Number.isInteger(next.accountProtocolVersion)
        && next.accountProtocolVersion >= 1
        && next.accountProtocolVersion <= 1000
        ? next.accountProtocolVersion
        : 0,
    }
    : null;
  if (!next) {
    rejectPending("浏览器扩展已断开，账号检查已取消");
  }
  notifyAccountsChanged();
}

export function onAccountsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function accountReason(platformId: string): string {
  return getPlatformMeta(platformId)?.name ?? "平台";
}

export async function verifyAccountThroughExtension(platformId: string): Promise<AccountDTO> {
  const meta = getPlatformMeta(platformId);
  if (!meta) throw new AccountSyncError(`未知平台：${platformId}`, 404);
  if (meta.status !== "active" || meta.authMode !== "extension") {
    throw new AccountSyncError(`${meta.name} 尚未接入浏览器扩展`, 409);
  }
  const existing = activeVerifications.get(platformId);
  if (existing) return existing;

  checkingPlatforms.add(platformId);
  notifyAccountsChanged();
  const task = enqueueVerification(async () => {
    try {
      assertConnected();
      const previous = await getStoredAccount(platformId);
      /* 首次验证和缺少 RSS 快照的旧账号各补一次；取得正向结果后不再重复请求。 */
      const includeRss = await needsRssProbe(platformId, previous?.uid ?? "pending-account");
      let result: ExtensionAccountResult;
      try {
        result = await requestExtension<ExtensionAccountResult>(
          "account.verify",
          platformId,
          VERIFY_TIMEOUT_MS,
          includeRss,
        );
      } catch (error) {
        const current = connection;
        if (current) {
          await saveAccountVerification({
            platformId,
            outcome: "failed",
            error: error instanceof Error ? error.message : String(error),
            profile: null,
            extensionClientId: current.clientId,
            browserLabel: current.browserLabel,
          });
          notifyAccountsChanged();
        }
        throw error;
      }
      const current = connection;
      if (!current) throw new AccountSyncError("浏览器扩展已断开", 409);
      const profile = result.state === "ok" ? result.profile : null;
      const outcome = result.state === "ok" && profile ? "ok" : result.state === "needs_login" ? "needs_login" : "failed";
      const stored = await saveAccountVerification({
        platformId,
        outcome,
        error: result.error ?? (outcome === "ok" ? null : `${accountReason(platformId)}账号检查失败`),
        profile,
        extensionClientId: current.clientId,
        browserLabel: current.browserLabel,
      });
      if (profile && result.rssFeeds.length > 0) {
        try {
          await recordRssDiscovery(platformId, profile.uid, result.rssFeeds);
        } catch {
          /* RSS 发现失败不能把一个已确认可登录的平台降级为失败。 */
        }
      }
      notifyAccountsChanged();
      return toAccountDTO(stored);
    } finally {
      checkingPlatforms.delete(platformId);
      notifyAccountsChanged();
    }
  });
  activeVerifications.set(platformId, task);
  try {
    return await task;
  } finally {
    if (activeVerifications.get(platformId) === task) activeVerifications.delete(platformId);
  }
}

export async function openAccountLoginThroughExtension(platformId: string): Promise<{ opened: true }> {
  const meta = getPlatformMeta(platformId);
  if (!meta) throw new AccountSyncError(`未知平台：${platformId}`, 404);
  if (meta.status !== "active" || meta.authMode !== "extension") {
    throw new AccountSyncError(`${meta.name} 尚未接入浏览器扩展`, 409);
  }
  const result = await requestExtension<ExtensionLoginOpened>("account.open-login", platformId, LOGIN_TIMEOUT_MS);
  if (!result.ok) throw new AccountSyncError(result.error ?? "无法打开登录页", 409);
  return { opened: true };
}

export function handleExtensionAccountMessage(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || !("type" in raw)) return false;
  const type = (raw as { type?: unknown }).type;
  if (type !== "account.result" && type !== "account.login-opened") return false;

  if (type === "account.result") {
    const parsed = extensionAccountResultSchema.safeParse(raw);
    if (!parsed.success) {
      const requestId = (raw as { requestId?: unknown }).requestId;
      const item = typeof requestId === "string" ? pending.get(requestId) : undefined;
      if (item) {
        clearTimeout(item.timer);
        pending.delete(item.requestId);
        if (item.type === "account.verify") checkingPlatforms.delete(item.platformId);
        item.reject(new AccountSyncError("浏览器扩展返回的账号数据不合法", 409));
        notifyAccountsChanged();
      }
      return true;
    }
    const item = pending.get(parsed.data.requestId);
    if (!item || item.type !== "account.verify" || item.platformId !== parsed.data.platformId) return true;
    clearTimeout(item.timer);
    pending.delete(item.requestId);
    checkingPlatforms.delete(parsed.data.platformId);
    item.resolve(parsed.data);
    notifyAccountsChanged();
    return true;
  }

  const parsed = extensionLoginOpenedSchema.safeParse(raw);
  if (!parsed.success) {
    const requestId = (raw as { requestId?: unknown }).requestId;
    const item = typeof requestId === "string" ? pending.get(requestId) : undefined;
    if (item) {
      clearTimeout(item.timer);
      pending.delete(item.requestId);
      item.reject(new AccountSyncError("浏览器扩展返回的登录页结果不合法", 409));
    }
    return true;
  }
  const item = pending.get(parsed.data.requestId);
  if (!item || item.type !== "account.open-login" || item.platformId !== parsed.data.platformId) return true;
  clearTimeout(item.timer);
  pending.delete(item.requestId);
  item.resolve(parsed.data);
  return true;
}

function isStale(account: StoredAccount): boolean {
  if (!account.lastCheckedAt) return true;
  const checked = Date.parse(account.lastCheckedAt);
  return !Number.isFinite(checked) || Date.now() - checked >= STALE_AFTER_MS;
}

export async function listPlatformsWithAccountSync(): Promise<PlatformDTO[]> {
  const [platforms, capability] = await Promise.all([listPlatforms(), getPublishCapability()]);
  const currentClientId = capability.extension.clientId;
  const currentBrowser = capability.extension.browserLabel;
  return await Promise.all(platforms.map(async (platform) => {
    if (platform.status !== "active" || platform.authMode !== "extension") {
      return { ...platform, sync: { phase: "unsupported" as const, reason: "该平台尚未接入浏览器扩展" } };
    }
    if (!capability.extension.connected || !currentClientId || !currentBrowser) {
      return { ...platform, sync: { phase: "extension_offline" as const, reason: "等待浏览器扩展连接" } };
    }
    if (checkingPlatforms.has(platform.id)) {
      return { ...platform, sync: { phase: "checking" as const, reason: "正在读取浏览器登录态" } };
    }
    const stored = await getStoredAccount(platform.id);
    if (!stored) {
      return {
        ...platform,
        sync: {
          phase: "unverified" as const,
          reason: platform.verifyMode === "visible" ? "需要在浏览器中手动检查" : "等待首次账号检查",
        },
      };
    }
    if (
      stored.extensionClientId !== currentClientId ||
      stored.browserLabel !== currentBrowser
    ) {
      return { ...platform, sync: { phase: "source_changed" as const, reason: "浏览器或扩展来源已变化，请重新验证" } };
    }
    return platform;
  }));
}

export async function reconcileAccounts(): Promise<void> {
  if (reconcilePromise) return reconcilePromise;
  reconcilePromise = (async () => {
    const current = connection;
    if (!current || current.accountProtocolVersion < 1) return;
    for (const meta of PLATFORM_METAS) {
      if (meta.status !== "active" || meta.authMode !== "extension") continue;
      if (meta.verifyMode === "visible") continue;
      const account = await getStoredAccount(meta.id);
      const missing = !account;
      const changed = !!account && (
        account.extensionClientId !== current.clientId ||
        account.browserLabel !== current.browserLabel
      );
      const stale = !!account && account.state === "ok" && isStale(account);
      if (!missing && !changed && !stale) continue;
      try {
        await verifyAccountThroughExtension(meta.id);
      } catch {
        // 单平台失败写入账号结果或超时；继续扫描其他平台，不能阻断发布任务通道。
      }
    }
  })().finally(() => {
    reconcilePromise = null;
  });
  return reconcilePromise;
}
