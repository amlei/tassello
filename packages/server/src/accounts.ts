/* accounts —— 平台列表（meta + 账号合并）、acquire、verify 编排 */
import { getPrisma } from "@tassello/db";
import { PLATFORM_METAS, getAdapter } from "@tassello/platform-core";
import type { AccountDTO, PlatformDTO } from "@tassello/shared";
import { fileSecretBox } from "./secrets";
import { syncBrowserProfile } from "./profile";

function toAccountDTO(a: {
  id: string; platformId: string; state: string; failReason: string | null;
  name: string | null; uid: string | null; avatarUrl: string | null;
  authExpiresAt: Date | null; lastCheckedAt: Date | null;
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
  };
}

export async function listPlatforms(): Promise<PlatformDTO[]> {
  const prisma = getPrisma();
  const accounts = await prisma.platformAccount.findMany({ orderBy: { updatedAt: "desc" } });
  const byPlatform = new Map<string, (typeof accounts)[number]>();
  for (const a of accounts) if (!byPlatform.has(a.platformId)) byPlatform.set(a.platformId, a);
  return PLATFORM_METAS.map((meta) => ({
    ...meta,
    account: byPlatform.has(meta.id) ? toAccountDTO(byPlatform.get(meta.id)!) : null,
  }));
}

async function upsertAccount(
  platformId: string,
  data: {
    state: "ok" | "fail"; failReason?: string; profile?: unknown;
    name?: string | null; uid?: string | null; avatarUrl?: string | null;
    authExpiresAt?: string | null;
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
    lastCheckedAt: new Date(),
  };
  if (existing) {
    return prisma.platformAccount.update({ where: { id: existing.id }, data: base });
  }
  return prisma.platformAccount.create({ data: { platformId, ...base } });
}

/** 获取 = 导入用户已登录的浏览器 Profile → 自动校验。登录不发生在本应用内 */
export async function acquireAccount(platformId: string): Promise<AccountDTO> {
  const prisma = getPrisma();
  const sync = await syncBrowserProfile();
  if (!sync.ok) {
    const saved = await upsertAccount(platformId, { state: "fail", failReason: sync.message });
    return toAccountDTO(saved);
  }
  return verifyAccount(platformId);
}

export async function verifyAccount(platformId: string): Promise<AccountDTO> {
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
  const result = await adapter.account.verify(
    { id: row?.id ?? "", uid: row?.uid ?? null, profile: parsed.success ? parsed.data : profile },
    { secrets: fileSecretBox, log: (event, payload) => {
        prisma.publishLog.create({
          data: { taskId: `verify:${platformId}`, event, payloadJson: JSON.stringify(payload ?? {}) },
        }).catch(() => {});
      } },
  );
  const saved = await upsertAccount(platformId, {
    state: result.state,
    failReason: result.failReason,
    profile: result.profile,
    name: result.name,
    uid: result.uid,
    avatarUrl: result.avatarUrl,
    authExpiresAt: result.authExpiresAt,
  });
  return toAccountDTO(saved);
}

let bootVerifyStarted = false;

/** 每次启动自动校验：对所有已有账号且适配器就绪的平台各跑一次 verify。
 *  后台异步执行不阻塞启动；进程内只跑一次；单平台失败不影响其他平台 */
export function verifyAllAccountsOnBoot(): void {
  if (bootVerifyStarted) return;
  bootVerifyStarted = true;
  void (async () => {
    try {
      const prisma = getPrisma();
      const rows = await prisma.platformAccount.findMany();
      const platformIds = [...new Set(rows.map((r) => r.platformId))].filter((id) => !!getAdapter(id));
      await Promise.all(platformIds.map((id) => verifyAccount(id).catch(() => {})));
    } catch {} // 启动校验绝不影响应用可用性（如首启表未建）
  })();
}
