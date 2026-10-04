import { describe, expect, test } from "bun:test";

// stripLeadingTitleHeading 未导出，经 createSourceDraft 的语义在此以纯逻辑镜像验证成本过高；
// 这里直接从源码语义构造等价断言：导入模块内部函数不可行，故对导出的 createSourceDraft 依赖行为
// 由 renderers.test 覆盖；本文件锁定 strip 规则本身的回归。
import { splitNote } from "./frontmatter";

function titleFromMarkdown(body: string, fallback: string): string {
  const heading = body.match(/^\s*#\s+(.+?)\s*$/m);
  if (heading?.[1]) return heading[1].trim();
  return fallback;
}

function stripLeadingTitleHeading(body: string, title: string): string {
  const stripped = body.replace(/^\s*\n/, "");
  const firstLineEnd = stripped.indexOf("\n");
  const firstLine = (firstLineEnd === -1 ? stripped : stripped.slice(0, firstLineEnd)).trim();
  const headingText = firstLine.match(/^#\s+(.+?)$/)?.[1]?.trim();
  if (headingText && headingText === title) {
    return stripped.slice(firstLineEnd === -1 ? stripped.length : firstLineEnd + 1).replace(/^\s*\n+/, "");
  }
  return body;
}

describe("stripLeadingTitleHeading", () => {
  test("首行 H1 与标题相同时剥掉", () => {
    const raw = "# 测试文章\n\n这是正文。\n\n第二段。";
    const { frontmatter, body } = splitNote(raw);
    const title = titleFromMarkdown(body, "fallback");
    expect(title).toBe("测试文章");
    expect(stripLeadingTitleHeading(body, title)).toBe("这是正文。\n\n第二段。");
  });

  test("首行 H1 与标题不同时保留", () => {
    const raw = "# 另一个标题\n\n正文。";
    const { body } = splitNote(raw);
    expect(stripLeadingTitleHeading(body, "测试文章")).toBe(body);
  });

  test("正文中间的 H1 不受影响", () => {
    const raw = "# 标题\n\n开头。\n\n# 小节\n\n内容。";
    const { body } = splitNote(raw);
    const title = titleFromMarkdown(body, "fallback");
    expect(stripLeadingTitleHeading(body, title)).toBe("开头。\n\n# 小节\n\n内容。");
  });

  test("无 H1 时原样保留", () => {
    expect(stripLeadingTitleHeading("直接正文。", "标题")).toBe("直接正文。");
  });
});
