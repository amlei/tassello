import { describe, expect, test } from "bun:test";
import type { ResolvedAsset } from "../types";
import { mergeCoverAsset } from "./cover-assets";

function asset(vaultPath: string, alt = "正文图"): ResolvedAsset {
  return {
    id: `${vaultPath}:0`,
    kind: "image",
    vaultPath,
    resourcePath: `app://${vaultPath}`,
    absolutePath: `/vault/${vaultPath}`,
    alt,
  };
}

describe("mergeCoverAsset", () => {
  test("封面只在 frontmatter 中存在时加入资产", () => {
    const cover = asset("files/cover.png", "封面");
    const result = mergeCoverAsset([asset("files/body.png")], cover);
    expect(result.assets.map((item) => item.vaultPath)).toEqual(["files/body.png", "files/cover.png"]);
    expect(result.cover).toBe(cover);
  });

  test("封面与正文图重复时只保留一份并使用正文资产", () => {
    const body = asset("files/shared.png");
    const result = mergeCoverAsset([body], asset("files/shared.png", "封面"));
    expect(result.assets).toEqual([body]);
    expect(result.cover).toBe(body);
  });

  test("未显式设置封面时仍默认第一张正文图片", () => {
    const first = asset("files/first.png");
    const result = mergeCoverAsset([first, asset("files/second.png")], first);
    expect(result.cover).toBe(first);
  });
});
