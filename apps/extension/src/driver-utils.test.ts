import { describe, expect, test } from "bun:test";
import { articleHtml } from "./driver-utils";
import type { PublishRuntime } from "./publish-runtime";

describe("扩展正文渲染", () => {
  test("复用 CommonMark + GFM，并按平台上传结果替换图片", () => {
    const runtime = {
      job: {
        snapshot: {
          markdown: "正文",
          bodyHtml: '<p><strong>加粗</strong>与<a href="https://example.com">链接</a></p>'
            + "<ul><li>第一项</li><li>第二项</li></ul>"
            + '<figure data-onda-media="0" data-alt="配图"></figure>',
          plainText: "加粗与链接\n\n第一项\n第二项",
          media: [{
            raw: "![配图](../files/test.png)",
            alt: "配图",
            kind: "image",
            source: "relative",
            resolved: "../files/test.png",
            order: 0,
            assetId: "asset-token",
            fileName: "test.png",
          }],
        },
      },
    } as unknown as PublishRuntime;
    const html = articleHtml(runtime, new Map([["../files/test.png", "https://cdn.example.com/test.png"]]));
    expect(html).toContain("<strong>加粗</strong>");
    expect(html).toContain('<a href="https://example.com">链接</a>');
    expect(html).toContain("<ul>");
    expect(html).toContain('<figure data-onda-media="0" data-src="https://cdn.example.com/test.png">');
    expect(html).toContain('<img src="https://cdn.example.com/test.png" alt="配图">');
  });
});
