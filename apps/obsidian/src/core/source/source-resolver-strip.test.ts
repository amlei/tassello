import { describe, expect, test } from "bun:test";
import { splitNote } from "./frontmatter";
import { stripLeadingTitleHeading, titleFromMarkdown } from "./markdown";

describe("stripLeadingTitleHeading", () => {
  test("首行 H1 与标题相同时剥掉", () => {
    const raw = "# 测试文章\n\n这是正文。\n\n第二段。";
    const { body } = splitNote(raw);
    const title = titleFromMarkdown(body, "fallback");
    expect(title).toBe("测试文章");
    expect(stripLeadingTitleHeading(body, title)).toBe("这是正文。\n\n第二段。");
  });

  test("首行 H1 与标题不同时保留", () => {
    const raw = "# 另一个标题\n\n正文。";
    const { body } = splitNote(raw);
    expect(stripLeadingTitleHeading(body, "测试文章")).toBe(body);
  });

  test("首个 H1 不在首行时也会作为标题剥离", () => {
    const raw = "引言。\n\n# 测试文章\n\n这是正文。";
    const { body } = splitNote(raw);
    const title = titleFromMarkdown(body, "fallback");
    expect(title).toBe("测试文章");
    expect(stripLeadingTitleHeading(body, title)).toBe("引言。\n\n这是正文。");
  });

  test("其余 H1 不受影响", () => {
    const raw = "# 标题\n\n开头。\n\n# 小节\n\n内容。";
    const { body } = splitNote(raw);
    const title = titleFromMarkdown(body, "fallback");
    expect(stripLeadingTitleHeading(body, title)).toBe("开头。\n\n# 小节\n\n内容。");
  });

  test("无 H1 时原样保留", () => {
    expect(stripLeadingTitleHeading("直接正文。", "标题")).toBe("直接正文。");
  });
});
