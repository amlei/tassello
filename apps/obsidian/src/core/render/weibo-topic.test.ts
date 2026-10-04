import { describe, expect, test } from "bun:test";
import { renderForPlatform } from "/Users/amlei/Data/codespaces/projects/tassello/apps/obsidian/src/core/render/renderers";
import type { SourceDraft } from "/Users/amlei/Data/codespaces/projects/tassello/apps/obsidian/src/core/types";

function source(overrides: Partial<SourceDraft> = {}): SourceDraft {
  return {
    filePath: "test.md", contentDigest: "abc", title: "标题", type: "image",
    body: "", html: "", plain: "", assets: [], platformIds: ["weibo"], options: {}, ...overrides,
  };
}

describe("Weibo topic payload", () => {
  test("wraps Obsidian tags for Weibo and leaves existing topics unchanged", () => {
    const rendered = renderForPlatform(source({ plain: "内容 #test 结束\n#自媒体#" }), "weibo");
    if (rendered.payload.kind !== "weibo-post") throw new Error("unexpected");
    expect(rendered.payload.body).toBe("内容 #test# 结束\n#自媒体#");
  });
});
