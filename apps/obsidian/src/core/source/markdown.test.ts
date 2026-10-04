import { describe, expect, test } from "bun:test";
import {
  markdownToHtml,
  plainFromMarkdown,
  stripLeadingTitleHeading,
  titleFromMarkdown,
} from "./markdown";

describe("Obsidian Markdown conversion", () => {
  test("HTML keeps line breaks, emphasis, strike-through, highlight and tags", async () => {
    const html = await markdownToHtml(
      "第一行\n**加粗** ~~删除~~ ==高亮== #test\n<u>下划线</u>",
    );

    expect(html).toContain("<br>");
    expect(html).toContain("<strong>加粗</strong>");
    expect(html).toContain("<del>删除</del>");
    expect(html).toContain("<mark>高亮</mark>");
    expect(html).toContain("#test");
    expect(html).toContain("<u>下划线</u>");
  });

  test("plain payload keeps visible text, tags and line breaks without markup", () => {
    const plain = plainFromMarkdown(
      "# 小节\n第一行\n**加粗** ~~删除~~ ==高亮== <u>下划线</u> #test",
    );

    expect(plain).toBe("小节\n第一行\n加粗 删除 高亮 下划线 #test");
  });

  test("only the first matching H1 becomes the title and is stripped", () => {
    const body = "# 测试文章\n\n正文\n\n# 另一个小节";
    const title = titleFromMarkdown(body, "fallback");

    expect(title).toBe("测试文章");
    expect(stripLeadingTitleHeading(body, title)).toBe("正文\n\n# 另一个小节");
  });

  test("a different first H1 remains in the body", () => {
    const body = "# 另一个标题\n\n正文";
    expect(stripLeadingTitleHeading(body, "测试文章")).toBe(body);
  });
});
