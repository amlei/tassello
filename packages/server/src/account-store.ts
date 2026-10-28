import { PLATFORM_METAS } from "@tassello/platform-core";
import type {
  AccountDTO,
  AccountState,
  AccountSyncDTO,
  ChannelDTO,
  ExtensionAccountProfileDTO,
  PlatformDTO,
} from "@tassello/shared";
import { readJsonFile, statePath, writeJsonAtomic } from "./state";

export type AccountLastOutcome = "ok" | "needs_login" | "failed";

export type StoredAccount = {
  platformId: string;
  state: AccountState;
  failReason: string | null;
  name: string | null;
  uid: string | null;
  avatarUrl: string | null;
  authExpiresAt: string | null;
  lastCheckedAt: string | null;
  /** 只保存归一化后的频道，平台原始 profile 不入库。 */
  profile: { channels: ChannelDTO[] };
  extensionClientId?: string | null;
  browserLabel?: string | null;
  lastOutcome?: AccountLastOutcome;
  updatedAt: string;
};

function accountFile(platformId: string): string {
  return statePath("accounts", `${platformId}.json`);
}

function channels(profile: StoredAccount["profile"] | Record<string, unknown> | null | undefined): ChannelDTO[] {
  if (!profile || !Array.isArray(profile.channels)) return [];
  return profile.channels.flatMap((raw): ChannelDTO[] => {
    if (!raw || typeof raw !== "object") return [];
    const value = raw as { id?: unknown; name?: unknown; title?: unknown; coverUrl?: unknown };
    const id = typeof value.id === "string" && value.id ? value.id : null;
    const name = typeof value.name === "string" && value.name
      ? value.name
      : typeof value.title === "string" && value.title
        ? value.title
        : null;
    if (!id && !name) return [];
    const coverUrl = typeof value.coverUrl === "string" && /^https?:\/\//i.test(value.coverUrl)
      ? value.coverUrl
      : null;
    return [{
      id: id || name!,
      name: name || id!,
      coverUrl,
    }];
  });
}

export function toAccountDTO(account: StoredAccount): AccountDTO {
  return {
    id: account.platformId,
    platformId: account.platformId,
    state: account.state,
    failReason: account.failReason,
    name: account.name,
    uid: account.uid,
    avatarUrl: account.avatarUrl,
    authExpiresAt: account.authExpiresAt,
    lastCheckedAt: account.lastCheckedAt,
    channels: channels(account.profile),
  };
}

export async function getStoredAccount(platformId: string): Promise<StoredAccount | null> {
  return readJsonFile<StoredAccount | null>(accountFile(platformId), null);
}

export async function saveStoredAccount(account: StoredAccount): Promise<StoredAccount> {
  await writeJsonAtomic(accountFile(account.platformId), account);
  return account;
}

export async function saveAccountVerification(input: {
  platformId: string;
  outcome: AccountLastOutcome;
  error: string | null;
  profile: ExtensionAccountProfileDTO | null;
  extensionClientId: string;
  browserLabel: string;
}): Promise<StoredAccount> {
  const checkedAt = new Date().toISOString();
  const ok = input.outcome === "ok" && !!input.profile;
  const previous = await getStoredAccount(input.platformId);
  const sameSource = previous?.extensionClientId === input.extensionClientId
    && previous.browserLabel === input.browserLabel;
  const account: StoredAccount = {
    platformId: input.platformId,
    state: ok ? "ok" : "fail",
    failReason: ok ? null : input.error ?? (
      input.outcome === "needs_login" ? "需要在浏览器中登录该平台" : "账号检查失败"
    ),
    name: ok ? input.profile!.name : sameSource ? previous?.name ?? null : null,
    uid: ok ? input.profile!.uid : sameSource ? previous?.uid ?? null : null,
    avatarUrl: ok ? input.profile!.avatarUrl : sameSource ? previous?.avatarUrl ?? null : null,
    authExpiresAt: ok ? input.profile!.authExpiresAt : sameSource ? previous?.authExpiresAt ?? null : null,
    lastCheckedAt: checkedAt,
    profile: { channels: ok ? input.profile!.channels : sameSource ? channels(previous?.profile) : [] },
    extensionClientId: input.extensionClientId,
    browserLabel: input.browserLabel,
    lastOutcome: input.outcome,
    updatedAt: checkedAt,
  };
  return saveStoredAccount(account);
}

function baseSync(meta: { status: "active" | "planned"; authMode: string }, account: StoredAccount | null): AccountSyncDTO {
  if (meta.status !== "active" || meta.authMode !== "extension") {
    return { phase: "unsupported", reason: "该平台尚未接入浏览器扩展账号验证" };
  }
  if (!account) return { phase: "unverified", reason: null };
  if (!account.extensionClientId || !account.browserLabel) {
    return { phase: "source_changed", reason: "账号来源已变化，请重新验证" };
  }
  if (account.lastOutcome === "needs_login" || (account.state === "fail" && /登录|login/i.test(account.failReason ?? ""))) {
    return { phase: "needs_login", reason: account.failReason };
  }
  if (account.state !== "ok" || account.lastOutcome === "failed") {
    return { phase: "failed", reason: account.failReason };
  }
  return { phase: "connected", reason: null };
}

export async function listPlatforms(): Promise<PlatformDTO[]> {
  return await Promise.all(PLATFORM_METAS.map(async (meta) => {
    const stored = await getStoredAccount(meta.id);
    return {
      ...meta,
      account: toStoredAccountOrNull(stored),
      sync: baseSync(meta, stored),
    };
  }));
}

function toStoredAccountOrNull(account: StoredAccount | null): AccountDTO | null {
  return account ? toAccountDTO(account) : null;
}

export async function verifyAllAccounts(): Promise<void> {
  // verify 由扩展连接后按需执行；服务端不再启动专用浏览器。
}

export function verifyAllAccountsOnBoot(): void {
  // 启动时不启动浏览器，也不复制 profile。
}
