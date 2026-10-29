import { FileSystemAdapter, normalizePath, TFile, type App } from "obsidian";
import { parseImageEmbeds, type ParsedImageEmbed } from "./image-embeds";
import type { ResolvedAsset } from "../types";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"]);

type ImageResolution = {
  asset: ResolvedAsset | null;
  finding: { level: "warning" | "error"; message: string } | null;
};

async function resolveImageEmbed(
  app: App,
  sourcePath: string,
  embed: ParsedImageEmbed,
  index: number,
): Promise<ImageResolution> {
  if (/^https?:\/\//i.test(embed.linkpath)) {
    return {
      asset: {
        id: `${embed.linkpath}:${index}`,
        kind: "image",
        vaultPath: embed.linkpath,
        resourcePath: embed.linkpath,
        absolutePath: embed.linkpath,
        alt: embed.alt || "远程图片",
      },
      finding: null,
    };
  }
  const normalizedLinkpath = normalizePath(embed.linkpath);
  const metadataFile = app.metadataCache.getFirstLinkpathDest(embed.linkpath, sourcePath);
  const directFile = app.vault.getAbstractFileByPath(normalizedLinkpath)
    ?? app.vault.getAbstractFileByPath(embed.linkpath);
  const resolved = metadataFile instanceof TFile
    ? metadataFile
    : directFile instanceof TFile
      ? directFile
      : null;
  if (!resolved) {
    return {
      asset: null,
      finding: { level: "error", message: `找不到附件：${embed.linkpath}` },
    };
  }
  if (!IMAGE_EXTENSIONS.has(resolved.extension.replace(/^\./, "").toLowerCase())) {
    return {
      asset: null,
      finding: { level: "warning", message: `跳过非图片附件：${resolved.path}` },
    };
  }
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    return {
      asset: null,
      finding: { level: "error", message: "当前 Vault 不是本地文件系统，无法直接交给浏览器上传" },
    };
  }
  return {
    asset: {
      id: `${resolved.path}:${index}`,
      kind: "image",
      vaultPath: resolved.path,
      resourcePath: app.vault.getResourcePath(resolved),
      absolutePath: adapter.getFullPath(resolved.path),
      alt: embed.alt || resolved.basename,
    },
    finding: null,
  };
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
  for (const [index, embed] of parseImageEmbeds(body).entries()) {
    const resolution = await resolveImageEmbed(app, sourcePath, embed, index);
    if (resolution.asset) assets.push(resolution.asset);
    if (resolution.finding) findings.push(resolution.finding);
  }

  return { assets, findings };
}

export async function resolveCoverImage(
  app: App,
  sourcePath: string,
  linkpath: string | undefined,
): Promise<{ cover: ResolvedAsset | null; finding: ImageResolution["finding"] }> {
  if (!linkpath) return { cover: null, finding: null };
  return resolveImageEmbed(app, sourcePath, {
    kind: "markdown",
    linkpath,
    alt: "封面",
  }, 0).then(({ asset, finding }) => ({ cover: asset, finding }));
}

export function digestText(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
