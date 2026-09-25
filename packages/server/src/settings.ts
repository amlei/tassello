/* settings —— app 设置：per 类型默认发布名单 + 登录态导入浏览器 */
import { getPrisma } from "@tassello/db";
import {
  DEFAULT_SETTINGS,
  IMPORT_BROWSERS,
  type AppSettings,
  type ContentType,
  CONTENT_TYPES,
  type ImportBrowserId,
} from "@tassello/shared";

const KEY = "app";

/** 非法值兜底回默认（手工改库、旧数据都可能带来脏值） */
function normalizeBrowser(v: unknown): ImportBrowserId {
  return IMPORT_BROWSERS.some((b) => b.id === v) ? (v as ImportBrowserId) : DEFAULT_SETTINGS.importBrowser;
}

export async function getSettings(): Promise<AppSettings> {
  const row = await getPrisma().setting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_SETTINGS;
  try {
    const stored = JSON.parse(row.valueJson) as Partial<AppSettings>;
    return {
      defaultTargets: { ...DEFAULT_SETTINGS.defaultTargets, ...(stored.defaultTargets ?? {}) },
      importBrowser: normalizeBrowser(stored.importBrowser),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const cur = await getSettings();
  const next: AppSettings = {
    defaultTargets: { ...cur.defaultTargets, ...(patch.defaultTargets ?? {}) },
    importBrowser: patch.importBrowser !== undefined ? normalizeBrowser(patch.importBrowser) : cur.importBrowser,
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
