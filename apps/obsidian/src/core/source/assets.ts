import { normalize, join } from "path";
import { FileSystemAdapter, TFile, type App } from "obsidian";
import type { ResolvedAsset } from "../types";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"]);

export type ParsedEmbed = {
  kind: "wiki" | "markdown";
  linkpath: string;
  alt: string;
};

/** 按正文出现顺序解析内嵌图片；外链不会作为本地上传素材，只会产生 warning。 */
export function parseImageEmbeds(body: string): ParsedEmbed[] {
  const result: ParsedEmbed[] = [];
  const wiki = /!\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;
  const markdown = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;|\s+\"[^\"]*\")?\)/g;

  for (const match of body.matchAll(wiki)) {
    result.push({
      kind: "wiki",
      linkpath: decodeURIComponent((match[1] ?? "").trim()),
      alt: (match[2] ?? "").trim(),
    });
  }

  for (const match of body.matchAll(markdown)) {
    const linkpath = (match[2] ?? "").trim();
    if (/^(https?:|data:|app:|resource:)/i.test(linkpath)) continue;
    result.push({
      kind: "markdown",
      linkpath: decodeURIComponent(linkpath),
      alt: (match[1] ?? "").trim(),
    });
  }

  return result;
}

export async function resolveImageEmbeds(
  app: App,
  sourcePath: string,
  body: string,
): Promise<{ assets: ResolvedAsset[]; findings: { level: "warning" | "error"; message: string }[] }> {
  const adapter = app.vault.adapter;
  const findings: { level: "warning" | "error"; message: string }[] = [];
  const assets: ResolvedAsset[] = [];

  if (!(adapter instanceof FileSystemAdapter)) {
    return {
      assets,
      findings: [{ level: "error", message: "当前 Vault 不是本地文件系统，无法直接交给浏览器上传" }],
    };
  }
  const base = adapter.getBasePath();

  for (const [index, embed] of parseImageEmbeds(body).entries()) {
    const file = app.metadataCache.getFirstLinkpathDest(embed.linkpath, sourcePath);
    if (!file) {
      findings.push({ level: "error", message: `找不到附件：${embed.linkpath}` });
      continue;
    }
    if (!(file instanceof TFile) || !IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) {
      findings.push({ level: "warning", message: `跳过非图片附件：${file.path}` });
      continue;
    }

    assets.push({
      id: `${file.path}:${index}`,
      kind: "image",
      vaultPath: file.path,
      resourcePath: app.vault.getResourcePath(file),
      absolutePath: normalize(join(base, file.path)),
      alt: embed.alt || file.basename,
    });
  }

  return { assets, findings };
}

export function digestText(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
