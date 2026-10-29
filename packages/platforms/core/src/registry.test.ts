import { describe, expect, test } from "bun:test";
import { getPlatformMeta } from "./registry";

describe("平台注册表", () => {
  test("头条号开放四个发布类型并作为扩展平台启用", () => {
    expect(getPlatformMeta("toutiao")).toMatchObject({
      status: "active",
      authMode: "extension",
      supports: ["article", "image", "video", "audio"],
      contentLabels: { image: "微头条", audio: "音频" },
    });
  });

  test("百家号开放图文、动态与视频并作为扩展平台启用", () => {
    expect(getPlatformMeta("baijiahao")).toMatchObject({
      status: "active",
      authMode: "extension",
      supports: ["article", "image", "video"],
      contentLabels: { article: "图文", image: "动态" },
    });
  });
});
