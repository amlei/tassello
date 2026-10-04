import { parse as parseYaml } from "yaml";
import type { ContentType, PlatformId } from "../types";

export type NoteFrontmatter = {
  title?: string;
  type?: ContentType;
  platforms?: PlatformId[];
  options?: Record<string, Record<string, unknown>>;
};

export type SplitNote = {
  frontmatter: NoteFrontmatter;
  body: string;
};

const CONTENT_TYPES = new Set<ContentType>(["article", "image", "video", "audio"]);
const PLATFORM_IDS = new Set<PlatformId>(["weibo", "zhihu", "xhs"]);

/** Obsidian properties may serialize a nested value as a JSON/YAML string; accept both forms. */
function normalizeConfig(raw: unknown): Record<string, unknown> {
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
    const config = normalizeConfig(parsed?.tassello);
    const type = typeof config.type === "string" && CONTENT_TYPES.has(config.type as ContentType)
      ? config.type as ContentType
      : undefined;
    const platforms = Array.isArray(config.platforms)
      ? config.platforms.filter((item): item is PlatformId =>
          typeof item === "string" && PLATFORM_IDS.has(item as PlatformId),
        )
      : undefined;
    const options: Record<string, Record<string, unknown>> = {};
    if (config.options && typeof config.options === "object" && !Array.isArray(config.options)) {
      for (const [key, value] of Object.entries(config.options)) {
        if (value && typeof value === "object" && !Array.isArray(value)) options[key] = value as Record<string, unknown>;
      }
    }
    const title = typeof config.title === "string" ? config.title : undefined;
    return { frontmatter: { title, type, platforms, options }, body: raw.slice(match[0]?.length ?? 0) };
  } catch {
    return {
      frontmatter: {},
      body: raw,
    };
  }
}
