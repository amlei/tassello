import type { PublishMediaRefDTO, UploadCacheQuery } from "@tassello/shared";
import type { LoadedMedia, PublishRuntime } from "./publish-runtime.ts";

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(value: string): string {
  return esc(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function mediaOfKind(runtime: PublishRuntime, kind: string): PublishMediaRefDTO[] {
  return runtime.job.snapshot.media.filter((media) => media.kind === kind);
}

export function articleHtml(
  runtime: PublishRuntime,
  replacements: Map<string, string> = new Map(),
): string {
  const media = runtime.job.snapshot.media;
  if (!runtime.job.snapshot.bodyHtml) {
    return runtime.job.snapshot.markdown
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${esc(paragraph).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }
  return runtime.job.snapshot.bodyHtml.replace(
    /<figure data-onda-media="(\d+)" data-alt="([^"]*)"(?: data-title="[^"]*")?><\/figure>/g,
    (_match, rawOrder: string, alt: string) => {
      const item = media.find((candidate) => candidate.order === Number(rawOrder));
      if (!item) return "";
      const src = replacements.get(item.assetId ?? item.resolved) ?? replacements.get(item.resolved) ?? "";
      return `<figure data-onda-media="${item.order}"${src ? ` data-src="${escAttr(src)}"` : ""}>` +
        (src ? `<img src="${escAttr(src)}" alt="${alt}">` : "") +
        `</figure>`;
    },
  );
}

export function plainBody(runtime: PublishRuntime): string {
  return (runtime.job.snapshot.plainText ?? runtime.job.snapshot.markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(?:\*\*|__)(.+?)(?:\*\*|__)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[-*+]\s+/gm, ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function publishIntent(runtime: PublishRuntime): "auto" | "draft" {
  return runtime.job.snapshot.options.intent === "auto" ? "auto" : "draft";
}

export function summaryText(runtime: PublishRuntime, limit = 120): string {
  const explicit = runtime.job.snapshot.options.summary;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim().slice(0, limit);
  return plainBody(runtime).replace(/\s+/g, " ").trim().slice(0, limit);
}

export function cacheQuery(
  runtime: PublishRuntime,
  media: Pick<LoadedMedia, "contentHash" | "kind">,
  scope: string,
): UploadCacheQuery {
  return {
    platformId: runtime.job.snapshot.platformId,
    accountUid: runtime.job.snapshot.accountUid ?? runtime.job.snapshot.platformId,
    contentHash: media.contentHash,
    kind: media.kind,
    scope,
  };
}

export function figureSourceMap(
  media: LoadedMedia[],
  remote: Map<string, string>,
): Map<string, string> {
  const output = new Map<string, string>();
  for (const item of media) {
    const url = remote.get(item.assetId ?? item.resolved);
    if (url) {
      output.set(item.assetId ?? item.resolved, url);
      output.set(item.resolved, url);
    }
  }
  return output;
}

export function sentenceParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .flatMap((line) => line.trim().split(/(?<=[。！？!?])\s*/))
    .map((line) => line.trim())
    .filter(Boolean);
}
