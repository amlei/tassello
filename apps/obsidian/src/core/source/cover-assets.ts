import type { ResolvedAsset } from "../types";

/** 正文和封面可以指向同一张图；资产列表按 vaultPath 去重，封面保留明确指向。 */
export function mergeCoverAsset(
  assets: ResolvedAsset[],
  cover: ResolvedAsset | null,
): { assets: ResolvedAsset[]; cover: ResolvedAsset | null } {
  if (!cover) return { assets, cover: null };
  const existing = assets.find((asset) => asset.vaultPath === cover.vaultPath);
  if (existing) return { assets, cover: existing };
  return { assets: [...assets, cover], cover };
}
