import { describe, expect, test } from "bun:test";
import type { PublishRuntime } from "../publish-runtime";
import {
  baijiaArticleHtml,
  baijiaEventText,
  fitBaijiaArticleTitle,
  fitBaijiaVideoTitle,
} from "./baijiahao";

describe("百家号发布输入", () => {
  test("图文标题按平台 2–64 字边界处理", () => {
    expect(fitBaijiaArticleTitle(" 一篇文章 ")).toBe("一篇文章");
    expect(() => fitBaijiaArticleTitle("文")).toThrow("至少需要 2 个字");
    expect(() => fitBaijiaArticleTitle("九漾".repeat(33))).toThrow("不能超过 64 个字");
  });

  test("动态正文合并标题并执行 2000 字上限", () => {
    const runtime = (title: string, plainText: string) => ({
      job: { snapshot: { title, plainText } },
    }) as unknown as PublishRuntime;
    expect(baijiaEventText(runtime("动态标题", "动态正文"))).toBe("动态标题\n\n动态正文");
    expect(() => baijiaEventText(runtime("标题", "长".repeat(2_000)))).toThrow("不能超过 2000 个字");
  });

  test("视频标题按平台 2–50 字边界处理", () => {
    expect(fitBaijiaVideoTitle(" 九漾视频 ")).toBe("九漾视频");
    expect(() => fitBaijiaVideoTitle("文")).toThrow("至少需要 2 个字");
    expect(() => fitBaijiaVideoTitle("九漾".repeat(26))).toThrow("不能超过 50 个字");
  });

  test("图文 HTML 把 UEditor 会过滤的 figure 转为段落图片", () => {
    const runtime = {
      job: {
        snapshot: {
          bodyHtml: '<p>正文</p><figure data-onda-media="0" data-alt="配图"></figure>',
          markdown: "正文",
          plainText: "正文",
          media: [{ order: 0, assetId: null, resolved: "test.png" }],
        },
      },
    } as unknown as PublishRuntime;
    const html = baijiaArticleHtml(runtime, new Map([["test.png", "https://example.com/test.png"]]));
    expect(html).toContain('<p><img src="https://example.com/test.png" alt="配图"></p>');
    expect(html).not.toContain("<figure");
  });
});
