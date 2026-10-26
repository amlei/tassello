import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { markdownToHtml, markdownToPlain } from "./index";

describe("markdown render", () => {
  test("CommonMark + GFM 渲染", () => {
    const html = markdownToHtml("# 标题\n\n**粗体** ~~删除~~\n\n| A | B |\n| - | - |\n| 1 | 2 |");
    assert.match(html, /<h1>标题<\/h1>/);
    assert.match(html, /<strong>粗体<\/strong>/);
    assert.match(html, /<del>删除<\/del>/);
    assert.match(html, /<table>/);
  });

  test("纯文本移除 Markdown 与媒体", () => {
    const plain = markdownToPlain("# 标题\n\n![图](a.png)\n\n**正文** [链接](https://example.com)");
    assert.equal(plain, "标题\n\n正文 链接");
  });

  test("图片可交给宿主重写", () => {
    const html = markdownToHtml("![说明](../a.png)", {
      renderImage: ({ href, alt }) => `<figure data-src="${href}">${alt}</figure>`,
    });
    assert.equal(html.trim(), '<figure data-src="../a.png">说明</figure>');
  });

  test("原始 HTML 与危险链接不会成为可执行 DOM", () => {
    const html = markdownToHtml('<img src=x onerror="alert(1)">\n\n[危险](javascript:alert(1))\n\n[安全](https://example.com)');
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x onerror="alert\(1\)"&gt;/);
    assert.doesNotMatch(html, /href="javascript:/);
    assert.match(html, /href="https:\/\/example\.com"/);
  });
});
