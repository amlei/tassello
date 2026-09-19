/* settings —— app 设置：per 类型默认发布名单 */
import { getPrisma } from "@tassello/db";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type ContentType,
  CONTENT_TYPES,
} from "@tassello/shared";

const KEY = "app";

export async function getSettings(): Promise<AppSettings> {
  const row = await getPrisma().setting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_SETTINGS;
  try {
    const stored = JSON.parse(row.valueJson) as Partial<AppSettings>;
    return {
      defaultTargets: { ...DEFAULT_SETTINGS.defaultTargets, ...(stored.defaultTargets ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const cur = await getSettings();
  const next: AppSettings = {
    defaultTargets: { ...cur.defaultTargets, ...(patch.defaultTargets ?? {}) },
  };
  // 清理不存在的平台 id
  for (const t of CONTENT_TYPES as readonly ContentType[]) {
    next.defaultTargets[t] = (next.defaultTargets[t] ?? []).filter(Boolean);
  }
  const prisma = getPrisma();
  await prisma.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, valueJson: JSON.stringify(next) },
    update: { valueJson: JSON.stringify(next) },
  });
  return next;
}
