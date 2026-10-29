import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { CONTENT_TYPES, type ContentType } from "@tassello/shared";

export type TasselloFrontmatter = {
  id: string;
  type: ContentType;
  manualOrder?: number;
  platforms?: string[];
  cover?: string;
  options?: Record<string, unknown>;
};

export type ParsedFrontmatter = {
  data: Partial<TasselloFrontmatter>;
  rawData: Record<string, unknown>;
  body: string;
  error: string | null;
};

const CONTENT_TYPE_SET = new Set<string>(CONTENT_TYPES);

function normalizeConfig(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = parseYaml(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function splitFrontmatter(raw: string): ParsedFrontmatter {
  const normalized = raw.replace(/\r\n?/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) {
    return { data: {}, rawData: {}, body: normalized, error: "缺少 frontmatter" };
  }

  let root: Record<string, unknown>;
  try {
    const parsed = parseYaml(match[1] ?? "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { data: {}, rawData: {}, body: normalized.slice(match[0].length), error: "frontmatter 必须是对象" };
    }
    root = parsed as Record<string, unknown>;
  } catch (error) {
    return {
      data: {},
      rawData: {},
      body: normalized.slice(match[0].length),
      error: `frontmatter YAML 无效：${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const config = normalizeConfig(root.tassello);
  const type = typeof config.type === "string" && CONTENT_TYPE_SET.has(config.type)
    ? config.type as ContentType
    : undefined;
  const id = typeof config.id === "string" && config.id.trim() ? config.id.trim() : undefined;
  const manualOrder = typeof config.manualOrder === "number" && Number.isFinite(config.manualOrder)
    ? config.manualOrder
    : undefined;
  const platforms = Array.isArray(config.platforms)
    ? config.platforms.filter((item): item is string => typeof item === "string" && item.length > 0)
    : undefined;
  const cover = typeof config.cover === "string" && config.cover.trim()
    ? config.cover.trim()
    : undefined;
  const options = config.options && typeof config.options === "object" && !Array.isArray(config.options)
    ? config.options as Record<string, unknown>
    : undefined;

  const missing = [
    !id ? "id" : null,
    !type ? "type" : null,
  ].filter(Boolean);

  return {
    data: {
      id,
      type,
      manualOrder,
      platforms,
      cover,
      options,
    },
    rawData: root,
    body: normalized.slice(match[0].length),
    error: missing.length ? `frontmatter 缺少或无效：${missing.join("、")}` : null,
  };
}

export function stringifyDocument(
  frontmatter: TasselloFrontmatter,
  body: string,
  preserve: Record<string, unknown> = {},
): string {
  const {
    version: _version,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...preservedConfig
  } = normalizeConfig(preserve.tassello);
  const root: Record<string, unknown> = {
    ...preserve,
    tassello: {
      ...preservedConfig,
      id: frontmatter.id,
      type: frontmatter.type,
      ...(frontmatter.manualOrder !== undefined ? { manualOrder: frontmatter.manualOrder } : {}),
      ...(frontmatter.platforms !== undefined ? { platforms: frontmatter.platforms } : {}),
      ...(frontmatter.cover !== undefined ? { cover: frontmatter.cover } : {}),
      ...(frontmatter.options !== undefined ? { options: frontmatter.options } : {}),
    },
  };
  return `---\n${stringifyYaml(root, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trimStart()}`;
}
