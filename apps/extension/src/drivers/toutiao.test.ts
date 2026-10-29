import { describe, expect, test } from "bun:test";
import type { PublishRuntime } from "../publish-runtime";
import { fitToutiaoArticleTitle, socialText } from "./toutiao";

describe("头条号发布输入", () => {
  test("文章标题按平台 2–30 字边界处理", () => {
    expect(fitToutiaoArticleTitle(" 一篇文章 ")).toBe("一篇文章");
    expect(fitToutiaoArticleTitle("九漾".repeat(20))).toHaveLength(30);
    expect(Array.from(fitToutiaoArticleTitle("😀".repeat(40)))).toHaveLength(30);
    expect(() => fitToutiaoArticleTitle("文")).toThrow("至少需要 2 个字");
  });

  test("微头条把标题合并进正文且不重复", () => {
    const runtime = (title: string, plainText: string) => ({
      job: { snapshot: { title, plainText } },
    }) as unknown as PublishRuntime;
    expect(socialText(runtime("标题", "正文"))).toBe("标题\n\n正文");
    expect(socialText(runtime("标题", "标题\n正文"))).toBe("标题\n正文");
    expect(socialText(runtime("只有标题", ""))).toBe("只有标题");
  });
});
