/* accounts —— 平台列表（meta + 账号合并）、导入登录态、verify 编排 */
import { getPrisma } from "@tassello/db";
import { PLATFORM_METAS, getAdapter } from "@tassello/platform-core";
import { endBrowserMaintenance, withBrowserLease, withPage } from "@tassello/cdp";
import type { AccountDTO, ChannelDTO, PlatformDTO } from "@tassello/shared";
import { serverAdapterContext } from "./platform-runtime";
import { releaseLoginBrowser, retainLoginBrowser } from "./browser-runtime";
import { syncBrowserProfile } from "./profile";
import { getProfileGeneration, getSettings, rotateProfileGeneration } from "./settings";

function accountChannels(platformId: string, profileJson: string): ChannelDTO[] {
  try {
    const parsed = JSON.parse(profileJson) as { channels?: unknown };
    if (!Array.isArray(parsed.channels)) return [];
    return parsed.channels.flatMap((raw): ChannelDTO[] => {
      if (!raw || typeof raw !== "object") return [];
      const value = raw as { id?: unknown; name?: unknown; title?: unknown; coverUrl?: unknown };
      const id = typeof value.id === "string" && value.id ? value.id : null;
      const name = typeof value.name === "string" && value.name ? value.name : typeof value.title === "string" ? value.title : null;
      if (!id && !name) return [];
      return [{
        id: id || name!,
        name: name || id!,
        coverUrl: typeof value.coverUrl === "string" ? value.coverUrl : null,
      }];
    });
  } catch {
    return [];
  }
}

function toAccountDTO(a: {
  id: string; platformId: string; state: string; failReason: string | null;
  name: string | null; uid: string | null; avatarUrl: string | null;
  authExpiresAt: Date | null; lastCheckedAt: Date | null; profile?: unknown;
  profileGeneration?: string | null;
}): AccountDTO {
  return {
    id: a.id,
    platformId: a.platformId,
    state: a.state === "ok" ? "ok" : "fail",
    failReason: a.failReason,
    name: a.name,
    uid: a.uid,
    avatarUrl: a.avatarUrl,
    authExpiresAt: a.authExpiresAt?.toISOString() ?? null,
    lastCheckedAt: a.lastCheckedAt?.toISOString() ?? null,
    profileGeneration: a.profileGeneration ?? null,
    channels: accountChannels(a.platformId, typeof a.profile === "string" ? a.profile : "{}"),
  };
}

export async function listPlatforms(): Promise<PlatformDTO[]> {
  const prisma = getPrisma();
  const accounts = await prisma.platformAccount.findMany({ orderBy: { updatedAt: "desc" } });
  const byPlatform = new Map<string, (typeof accounts)[number]>();
  for (const a of accounts) if (!byPlatform.has(a.platformId)) byPlatform.set(a.platformId, a);
  return PLATFORM_METAS.map((meta) => ({
    ...meta,
    account: byPlatform.has(meta.id) ? toAccountDTO({ ...byPlatform.get(meta.id)!, profile: byPlatform.get(meta.id)!.profile }) : null,
  }));
}

async function upsertAccount(
  platformId: string,
  data: {
    state: "ok" | "fail"; failReason?: string; profile?: unknown;
    name?: string | null; uid?: string | null; avatarUrl?: string | null;
    authExpiresAt?: string | null;
    profileGeneration?: string | null;
  },
) {
  const prisma = getPrisma();
  const existing = await prisma.platformAccount.findFirst({
    where: { platformId },
    orderBy: { updatedAt: "desc" },
  });
  const base = {
    state: data.state,
    failReason: data.failReason ?? null,
    ...(data.profile !== undefined ? { profile: JSON.stringify(data.profile) } : {}),
    name: data.name ?? null,
    uid: data.uid ?? null,
    avatarUrl: data.avatarUrl ?? null,
    ...(data.authExpiresAt !== undefined ? { authExpiresAt: data.authExpiresAt ? new Date(data.authExpiresAt) : null } : {}),
    ...(data.profileGeneration !== undefined ? { profileGeneration: data.profileGeneration } : {}),
    lastCheckedAt: new Date(),
  };
  if (existing) {
    return prisma.platformAccount.update({ where: { id: existing.id }, data: base });
  }
  return prisma.platformAccount.create({ data: { platformId, ...base } });
}

/** 重新校验：只校验单个平台 —— 不复制文件、不牵连其它平台。
 *  覆盖后仍失效且平台有登录页：打开登录页人工兜底（登录发生在应用浏览器里，
 *  完成后回工作台点「重新校验」；登录态源头过期时走设置里的「导入」） */
const VERIFY_FRESH_MS = 12 * 60 * 60 * 1000;

function freshVerification(
  row: { state: string; lastCheckedAt: Date | null; profileGeneration: string | null } | null,
  profileGeneration: string,
): boolean {
  if (!row || row.profileGeneration !== profileGeneration || !row.lastCheckedAt) return false;
  return Date.now() - row.lastCheckedAt.getTime() < VERIFY_FRESH_MS;
}

export async function acquireAccount(platformId: string): Promise<AccountDTO> {
  releaseLoginBrowser(platformId);
  const adapter = getAdapter(platformId);
  if (!adapter) throw new Error(`平台 ${platformId} 的适配器尚未接入`);
  const prisma = getPrisma();
  const verified = await verifyAccount(platformId, { force: true });
  if (verified.state === "ok") return verified;
  const loginUrl = adapter.meta.loginUrl;
  if (loginUrl) {
    await withBrowserLease("visible", async () => {
      await withPage(platformId, { url: loginUrl, keepOpen: true, activate: true, mode: "visible" }, async () => {});
      retainLoginBrowser(platformId);
    });
    await upsertAccount(platformId, {
      state: "fail",
      failReason: `登录态已失效。已打开${adapter.meta.name}登录页：登录后回工作台点「重新校验」；若日常浏览器里的登录态也已过期，请重新登录后在设置里点「导入」`,
    });
    return toAccountDTO(
      (await prisma.platformAccount.findFirst({ where: { platformId }, orderBy: { updatedAt: "desc" } }))!,
    );
  }
  return verified;
}

/** 全量重校验：对所有已有账号且适配器就绪的平台各跑一次 verify。
 *  导入登录态覆盖的是全平台共用的 Cookies，所以覆盖完成后要对全部账号重校验一遍 */
export async function verifyAllAccounts(options: { force?: boolean } = {}): Promise<void> {
  const force = options.force ?? false;
  const prisma = getPrisma();
  const profileGeneration = await getProfileGeneration();
  const rows = await prisma.platformAccount.findMany();
  const platformIds = rows
    .filter((row) => force || !freshVerification(row, profileGeneration))
    .map((row) => row.platformId)
    .filter((id, index, ids) => !!getAdapter(id) && ids.indexOf(id) === index);
  // 串行执行可避免一次打开所有平台页；headless Chrome 会在队列空闲后自动关闭。
  for (const platformId of platformIds) {
    await verifyAccount(platformId, { force }).catch(() => {});
  }
}

/** 导入登录态：以设置所选日常浏览器的 Default profile 整体覆盖应用专用 profile，
 *  然后后台自动重校验全部账号。独立动作、入口全局唯一 —— 多平台登录态一起失效时导入一次即可 */
export async function importProfile(): Promise<{ ok: boolean; message?: string; code?: "browser_running" }> {
  const { importBrowser } = await getSettings();
  // refresh/close 已在 maintenance 内完成；返回后 maintenance 释放，verify 可重新启动 headless Chrome。
  const sync = await syncBrowserProfile(importBrowser);
  if (!sync.ok) return sync;

  // 只有复制完整成功才换 profileGeneration；所有导入后 verify 都因此强制执行。
  await rotateProfileGeneration();
  endBrowserMaintenance();
  void verifyAllAccounts({ force: true }).catch(() => {}); // 后台跑，接口先返回；UI 轮询平台状态看结果
  return sync;
}

export async function verifyAccount(
  platformId: string,
  options: { force?: boolean } = {},
): Promise<AccountDTO> {
  const force = options.force ?? true;
  releaseLoginBrowser(platformId);
  const adapter = getAdapter(platformId);
  if (!adapter) throw new Error(`平台 ${platformId} 的适配器尚未接入`);
  const prisma = getPrisma();
  const row = await prisma.platformAccount.findFirst({ where: { platformId }, orderBy: { updatedAt: "desc" } });
  let profile: unknown = {};
  if (row) {
    try {
      profile = JSON.parse(row.profile);
    } catch {}
  }
  const parsed = adapter.account.profileSchema.safeParse(profile);
  const verifyMode = adapter.meta.verifyMode === "visible" ? "visible" : "headless";
  const profileGeneration = await getProfileGeneration();
  if (!force && freshVerification(row, profileGeneration)) {
    if (!row) {
      return {
        id: "", platformId, state: "fail", failReason: "账号尚未连接",
        name: null, uid: null, avatarUrl: null, authExpiresAt: null,
        lastCheckedAt: null, profileGeneration, channels: [],
      };
    }
    return toAccountDTO({ ...row, profile });
  }
  const result = await adapter.account.verify(
    { id: row?.id ?? "", uid: row?.uid ?? null, profile: parsed.success ? parsed.data : profile },
    serverAdapterContext(platformId, (event, payload) => {
      prisma.publishLog.create({
        data: { taskId: `verify:${platformId}`, event, payloadJson: JSON.stringify(payload ?? {}) },
      }).catch(() => {});
    }, verifyMode),
  );
  const saved = await upsertAccount(platformId, {
    state: result.state,
    failReason: result.failReason,
    profile: result.profile,
    name: result.name,
    uid: result.uid,
    avatarUrl: result.avatarUrl,
    authExpiresAt: result.authExpiresAt,
    profileGeneration,
  });
  return toAccountDTO(saved);
}

let bootVerifyStarted = false;

/** 每次启动自动校验：进程内只跑一次；单平台失败不影响其他平台 */
export function verifyAllAccountsOnBoot(): void {
  if (bootVerifyStarted) return;
  bootVerifyStarted = true;
  // 启动只做增量 reconcile：fresh + profileGeneration 未变的账号不启动浏览器。
  void verifyAllAccounts({ force: false }).catch(() => {});
}
