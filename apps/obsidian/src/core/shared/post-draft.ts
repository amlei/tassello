import type { AdapterPublishOptions, PostDraft } from "@tassello/platform-core";
import { getPlatformMeta } from "@tassello/platform-core";
import { effectiveContentType, type SourceDraft } from "../types";

/** Obsidian Markdown 是共享 adapter 的唯一上游差异：这里收敛成 PostDraft。 */
function stripInlineImagesFromHtml(html: string): string {
  return html
    .replace(/<figure[\s\S]*?<\/figure>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/!\[\[[^\]]+\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "");
}

export function toPostDraft(source: SourceDraft, platformId: string): PostDraft {
  // 共享 adapter 只接收纯文本正文；Markdown 图片统一走 assets，由平台 adapter 安排位置。
  const body = platformId === "weibo" && source.title
    ? `${source.title}\n\n${source.plain}`.trim()
    : source.plain;

  return {
    id: source.filePath,
    type: effectiveContentType(platformId as Parameters<typeof effectiveContentType>[0], source.type),
    title: source.title,
    body,
    bodyHtml: stripInlineImagesFromHtml(source.html),
    durationSec: null,
    assets: source.assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      path: asset.absolutePath,
    })),
  };
}

function readOption<T>(source: SourceDraft, ...keys: string[]): T | undefined {
  for (const key of keys) {
    const value = source.options[key];
    if (value !== undefined && value !== null) return value as T;
  }
  const nested = source.options.zhihu;
  if (typeof nested === "object" && nested) {
    for (const key of keys) {
      const value = (nested as Record<string, unknown>)[key];
      if (value !== undefined && value !== null) return value as T;
    }
  }
  return undefined;
}

/** Frontmatter 可覆盖；默认意图来自共享平台能力矩阵（autoSubmit）。 */
export function toPublishOptions(source: SourceDraft, platformId: string): AdapterPublishOptions {
  const intent = readOption<"auto" | "draft">(source, "intent", "publishIntent")
    ?? (getPlatformMeta(platformId)?.autoSubmit ? "auto" : "draft");
  const channel = readOption<string>(source, "channel", "zhihuChannel");
  return { intent, channel };
}
