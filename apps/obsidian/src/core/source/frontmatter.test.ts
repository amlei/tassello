import { describe, expect, test } from "bun:test";
import { createDocumentId, ensureTasselloMetadata, splitNote } from "./frontmatter";

describe("splitNote", () => {
  test("parses tassello frontmatter and strips it from body", () => {
    const raw = `---\ntassello:\n  type: image\n  platforms: [xhs, weibo]\n  title: 测试标题\n---\n\n正文`;
    const parsed = splitNote(raw);
    expect(parsed.frontmatter.type).toBe("image");
    expect(parsed.frontmatter.platforms).toEqual(["xhs", "weibo"]);
    expect(parsed.frontmatter.title).toBe("测试标题");
    expect(parsed.body).toBe("\n正文");
  });

  test("returns a normal body when frontmatter is absent", () => {
    expect(splitNote("# Hello").frontmatter.type).toBeUndefined();
    expect(splitNote("# Hello").body).toBe("# Hello");
  });
});

describe("Obsidian property compatibility", () => {
  test("parses a tassello value serialized by Obsidian properties", () => {
    const raw = '---\ntassello: \'{"type":"article","platforms":["zhihu"]}\'\n---\n# 正文';
    const parsed = splitNote(raw);
    expect(parsed.frontmatter.type).toBe("article");
    expect(parsed.frontmatter.platforms).toEqual(["zhihu"]);
  });

  test("保留头条号与百家号默认平台", () => {
    const raw = `---\ntassello:\n  type: article\n  platforms: [toutiao, baijiahao]\n---\n\n正文`;
    const parsed = splitNote(raw);
    expect(parsed.frontmatter.platforms).toEqual(["toutiao", "baijiahao"]);
  });
});

describe("ensureTasselloMetadata", () => {
  test("uses the same short ID format as the vault backend", () => {
    expect(createDocumentId(() => "12345678-90ab-cdef-1234-567890abcdef")).toBe("m1234567890");
  });

  test("generates an ID when frontmatter has none", () => {
    const frontmatter: Record<string, unknown> = { tassello: { type: "audio", cover: "cover.png" } };
    const id = ensureTasselloMetadata(frontmatter, "audio", () => "m1234567890");
    expect(id).toBe("m1234567890");
    expect(frontmatter.tassello).toEqual({
      type: "audio",
      cover: "cover.png",
      id: "m1234567890",
    });
  });

  test("preserves an existing ID and removes legacy timestamps", () => {
    const frontmatter: Record<string, unknown> = {
      tassello: {
        id: "m-existing",
        type: "article",
        version: 1,
        createdAt: "2026-01-02T03:04:05+08:00",
        updatedAt: "2026-01-03T00:00:00Z",
      },
    };
    const id = ensureTasselloMetadata(frontmatter, "image", () => "m-new");
    expect(id).toBe("m-existing");
    expect(frontmatter.tassello).toEqual({
      id: "m-existing",
      type: "image",
    });
  });

  test("normalizes an Obsidian-serialized tassello value", () => {
    const frontmatter: Record<string, unknown> = { tassello: '{"id":"m-json","type":"video"}' };
    ensureTasselloMetadata(frontmatter, "audio", () => "m-new");
    expect(frontmatter.tassello).toEqual({
      id: "m-json",
      type: "audio",
    });
  });
});
