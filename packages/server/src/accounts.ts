/* accounts —— 平台列表（meta + 账号合并）、acquire、verify 编排 */
import { getPrisma } from "@tassello/db";
import { PLATFORM_METAS, getAdapter } from "@tassello/platform-core";
import type { AccountDTO, PlatformDTO } from "@tassello/shared";
import { fileSecretBox } from "./secrets";

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

export async function acquireAccount(platformId: string): Promise<AccountDTO> {
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
  const result = await adapter.account.acquire({ secrets: fileSecretBox, log: () => {} });
  const saved = await upsertAccount(platformId, {
    state: result.state,
    failReason: result.failReason,
    profile: result.profile ?? profile,
  });
  return toAccountDTO(saved);
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
