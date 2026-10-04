import { describe, expect, test } from "bun:test";
import { splitNote } from "./frontmatter";

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
});
