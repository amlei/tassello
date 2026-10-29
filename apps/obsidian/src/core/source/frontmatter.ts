import { parse as parseYaml } from "yaml";
import type { ContentType, PlatformId } from "../types";

export type NoteFrontmatter = {
  id?: string;
  title?: string;
  type?: ContentType;
  platforms?: PlatformId[];
  cover?: string;
  options?: Record<string, unknown>;
};

export type SplitNote = {
  frontmatter: NoteFrontmatter;
  body: string;
};

const CONTENT_TYPES = new Set<ContentType>(["article", "image", "video", "audio"]);
const PLATFORM_IDS = new Set<PlatformId>(["weibo", "zhihu", "xhs", "jike", "douban", "x"]);

/** Obsidian properties may serialize a nested value as a JSON/YAML string; accept both forms. */
export function normalizeTasselloConfig(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    if (typeof raw === "string" && raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
      } catch {
        try {
          const parsed = parseYaml(raw) as unknown;
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
        } catch {
          return {};
        }
      }
    }
    return {};
  }
  return Array.isArray(raw) ? {} : raw as Record<string, unknown>;
}

/** 解析 Obsidian note 头部的 YAML。YAML 语法错误不阻塞预览，而是返回可检查的错误字段。 */
export function splitNote(raw: string): SplitNote {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { frontmatter: {}, body: raw };

  try {
    const parsed = parseYaml(match[1] ?? "") as Record<string, unknown> | null;
    const config = normalizeTasselloConfig(parsed?.tassello);
    const id = typeof config.id === "string" && config.id.trim() ? config.id.trim() : undefined;
    const type = typeof config.type === "string" && CONTENT_TYPES.has(config.type as ContentType)
      ? config.type as ContentType
      : undefined;
    const platforms = Array.isArray(config.platforms)
      ? config.platforms.filter((item): item is PlatformId =>
          typeof item === "string" && PLATFORM_IDS.has(item as PlatformId),
        )
      : undefined;
    const options: Record<string, unknown> = {};
    if (config.options && typeof config.options === "object" && !Array.isArray(config.options)) {
      for (const [key, value] of Object.entries(config.options)) {
        if (value !== undefined && value !== null) options[key] = value;
      }
    }
    const title = typeof config.title === "string" ? config.title : undefined;
    const cover = typeof config.cover === "string" && config.cover.trim() ? config.cover.trim() : undefined;
    return { frontmatter: { id, title, type, platforms, cover, options }, body: raw.slice(match[0]?.length ?? 0) };
  } catch {
    return {
      frontmatter: {},
      body: raw,
    };
  }
}

export function createDocumentId(randomUuid = () => crypto.randomUUID()): string {
  return `m${randomUuid().replace(/-/g, "").slice(0, 10)}`;
}

/** 原子补齐发布需要的身份与类型，已有 ID 永不替换。 */
export function ensureTasselloMetadata(
  frontmatter: Record<string, unknown>,
  type: ContentType,
  createId: () => string = createDocumentId,
): string {
  const current = normalizeTasselloConfig(frontmatter.tassello);
  const existingId = typeof current.id === "string" ? current.id.trim() : "";
  const {
    version: _version,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...rest
  } = current;
  const id = existingId || createId();
  frontmatter.tassello = {
    ...rest,
    id,
    type,
  };
  return id;
}
