import { describe, expect, test } from "bun:test";
import { previewHtmlForPlatform, renderForPlatform } from "./renderers";
import type { SourceDraft } from "../types";

function source(overrides: Partial<SourceDraft> = {}): SourceDraft {
  return {
    filePath: "test.md",
    contentDigest: "abc",
    title: "标题",
    type: "image",
    body: "这是正文",
    html: "<p>这是正文</p>",
    plain: "这是正文",
    assets: [],
    platformIds: ["weibo"],
    options: {},
    ...overrides,
  };
}

describe("platform renderers", () => {
  test("renders a Weibo post without local image syntax", () => {
    const rendered = renderForPlatform(source({ body: "正文\n\n![[cover.png]]", plain: "正文\n\n![[cover.png]]" }), "weibo");
    expect(rendered.payload).toEqual({ kind: "weibo-post", body: "正文", imagePaths: [] });
  });

  test("blocks an XHS image note without images", () => {
    const rendered = renderForPlatform(source(), "xhs");
    expect(rendered.findings.some((finding) => finding.level === "error" && finding.message.includes("至少 1 张"))).toBe(true);
  });

  test("renders a Zhihu article draft and strips local images", () => {
    const rendered = renderForPlatform(source({ type: "article", html: '<p>文</p><img src="app://x">' }), "zhihu");
    expect(rendered.payload.kind).toBe("zhihu-article");
    if (rendered.payload.kind === "zhihu-article") expect(rendered.payload.html).toBe('<p>文</p><img src="app://x">');
  });

  test("weibo always renders as composer post, with blank-line paragraphs", () => {
    const rendered = renderForPlatform(
      source({
        type: "article",
        body: "## 小节\n第一段文字。\n第二行。\n\n第二段文字。",
        plain: "小节\n第一段文字。 第二行。\n\n第二段文字。",
      }),
      "weibo",
    );
    expect(rendered.payload.kind).toBe("weibo-post");
    if (rendered.payload.kind !== "weibo-post") throw new Error("unexpected kind");
    expect(rendered.payload.body).toBe("标题\n\n小节\n第一段文字。 第二行。\n\n第二段文字。");
    expect(rendered.payload.body).not.toContain("#");
  });

  test("weibo does not impose an artificial text-length limit", () => {
    const rendered = renderForPlatform(source({ plain: "字".repeat(2001) }), "weibo");
    expect(rendered.findings.some((finding) => finding.message.includes("字"))).toBe(false);
  });
});

describe("Markdown-aware platform payloads", () => {
  test("Weibo article puts the standalone title back into the composer body", () => {
    const rendered = renderForPlatform(
      source({
        type: "article",
        title: "测试文章",
        body: "正文。\n\n第二段。",
        plain: "正文。\n\n第二段。",
      }),
      "weibo",
    );

    if (rendered.payload.kind !== "weibo-post") throw new Error("unexpected kind");
    expect(rendered.payload.body).toBe("测试文章\n\n正文。\n\n第二段。");
  });

  test("titled thoughts use the source title and X keeps title in text", () => {
    const jike = renderForPlatform(source(), "jike");
    expect(jike.payload).toMatchObject({ kind: "thought", platformId: "jike", title: "标题" });

    const x = renderForPlatform(source(), "x");
    expect(x.payload).toMatchObject({ kind: "thought", platformId: "x", title: "" });

    const preview = previewHtmlForPlatform(source(), "jike");
    expect(preview).toContain("<h1>标题</h1>");
    expect(preview).not.toContain("figcaption");
  });

  test("XHS payloads keep hard line breaks and do not leak Markdown markup", () => {
    const rendered = renderForPlatform(
      source({
        type: "article",
        title: "标题",
        body: "## 小节\n第一行\n**加粗** #test\n\n第二段。",
        plain: "小节\n第一行 加粗 #test\n\n第二段。",
      }),
      "xhs",
    );

    if (rendered.payload.kind !== "xhs-article") throw new Error("unexpected kind");
    expect(rendered.payload.body).toBe("小节\n第一行 加粗 #test\n\n第二段。");
  });
});
