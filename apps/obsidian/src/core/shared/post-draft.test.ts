import { describe, expect, test } from "bun:test";
import { effectiveContentType } from "../types";
import { toPostDraft, toPublishOptions } from "./post-draft";
import type { SourceDraft } from "../types";

const source: SourceDraft = {
  filePath: "note.md",
  contentDigest: "abc",
  title: "标题",
  type: "article",
  body: "正文",
  html: "<p>正文</p>",
  plain: "正文",
  assets: [],
  platformIds: ["zhihu"],
  options: {
    intent: "draft",
    zhihu: { channel: "article" },
  },
};

describe("shared adapter bridge", () => {
  test("maps Obsidian source to PostDraft and explicit publish options", () => {
    const post = toPostDraft(source, "zhihu");
    expect(post).toMatchObject({ id: "note.md", type: "article", title: "标题", body: "正文", bodyHtml: "<p>正文</p>" });
    expect(toPublishOptions(source, "zhihu", "article")).toEqual({ intent: "draft", channel: "article" });
  });

  test("uses capability defaults and preserves local asset paths", () => {
    const imageSource: SourceDraft = {
      ...source,
      type: "image",
      options: {},
      assets: [{ id: "a1", kind: "image", vaultPath: "a.png", absolutePath: "/tmp/a.png", resourcePath: "app://a.png", alt: "A" }],
    };
    expect(toPublishOptions(imageSource, "weibo", "image")).toEqual({ intent: "draft", channel: undefined });
    expect(toPostDraft(imageSource, "weibo")).toMatchObject({
      body: "标题\n\n正文",
      assets: [{ id: "a1", path: "/tmp/a.png" }],
    });
  });
});

describe("platform form normalization", () => {
  test("downgrades an article source for image-only platforms and extracts inline images", () => {
    const articleSource: SourceDraft = {
      ...source,
      type: "article",
      body: "正文\n\n![[cover.png]]",
      html: '<p>正文</p><img src="app://cover.png">',
      plain: "正文",
      assets: [{
        id: "a1", kind: "image", vaultPath: "cover.png", absolutePath: "/tmp/cover.png",
        resourcePath: "app://cover.png", alt: "cover",
      }],
    };

    expect(effectiveContentType("jike", articleSource.type)).toBe("image");
    const post = toPostDraft(articleSource, "jike");
    expect(post.type).toBe("image");
    expect(post.body).toBe("正文");
    expect(post.bodyHtml).toBe("<p>正文</p>");
    expect(post.assets).toHaveLength(1);
  });
});
