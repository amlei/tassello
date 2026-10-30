import { describe, expect, test } from "bun:test";
import { renderForPlatform } from "./renderers";
import type { SourceDraft } from "../types";

function source(overrides: Partial<SourceDraft> = {}): SourceDraft {
  return {
    id: "note-id", filePath: "test.md", contentDigest: "abc", title: "标题", type: "image",
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
