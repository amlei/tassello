import { normalize, join } from "path";
import { FileSystemAdapter, normalizePath, TFile, type App } from "obsidian";
import { parseImageEmbeds } from "./image-embeds";
import type { ResolvedAsset } from "../types";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"]);


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
    const normalizedLinkpath = normalizePath(embed.linkpath);
    const metadataFile = app.metadataCache.getFirstLinkpathDest(embed.linkpath, sourcePath);
    const directFile = app.vault.getAbstractFileByPath(normalizedLinkpath)
      ?? app.vault.getAbstractFileByPath(embed.linkpath);
    const allFiles = app.vault.getFiles();
    const basename = normalizedLinkpath.split("/").pop()?.toLowerCase() ?? "";
    const exactPathFile = allFiles.find((candidate) => candidate.path.toLowerCase() === normalizedLinkpath.toLowerCase());
    const exactNameFile = allFiles.find((candidate) => candidate.name.toLowerCase() === basename);
    const resolved = metadataFile instanceof TFile
      ? metadataFile
      : directFile instanceof TFile
        ? directFile
        : exactPathFile ?? exactNameFile;
    if (!resolved) {
      findings.push({ level: "error", message: `找不到附件：${embed.linkpath}` });
      continue;
    }
    if (!IMAGE_EXTENSIONS.has(resolved.extension.replace(/^\./, "").toLowerCase())) {
      findings.push({ level: "warning", message: `跳过非图片附件：${resolved.path}` });
      continue;
    }
    const actualFile = resolved;
    assets.push({
      id: `${actualFile.path}:${index}`,
      kind: "image",
      vaultPath: actualFile.path,
      resourcePath: app.vault.getResourcePath(actualFile),
      absolutePath: normalize(join(base, actualFile.path)),
      alt: embed.alt || actualFile.basename,
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
