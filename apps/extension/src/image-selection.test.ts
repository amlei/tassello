import { describe, expect, test } from "bun:test";
import { quotaExhaustedMessage } from "./drivers/doubao-generation";
import { generatedImageKey, pickBestResultImages } from "./image-selection";

describe("豆包生图结果归并", () => {
  test("按生成图 ID 合并缩略图与原图", () => {
    assertResult([
      {
        src: "https://p3.example.com/rc_gen_image/abc.jpeg~tplv-thumb",
        w: 384,
        h: 216,
        order: 0,
      },
      {
        src: "https://p3.example.com/rc_gen_image/abc.jpeg~tplv-original",
        w: 2048,
        h: 1152,
        order: 1,
      },
    ]);
  });

  test("没有生成图 ID 时按去掉查询参数的 URL 去重", () => {
    expect(generatedImageKey("https://cdn.example.com/image.png?x=1")).toBe(
      "https://cdn.example.com/image.png",
    );
  });

  test("识别豆包免费额度耗尽文案", () => {
    expect(quotaExhaustedMessage("今日图片生成免费次数用完了")).toBe("今日图片生成免费次数已用完");
    expect(quotaExhaustedMessage("开通豆包专业版标准套餐即可使用创作额度包")).toContain("免费额度用完");
    expect(quotaExhaustedMessage("图片生成完成")).toBeNull();
  });
});

function assertResult(
  images: Parameters<typeof pickBestResultImages>[0],
): void {
  const selected = pickBestResultImages(images);
  expect(selected).toHaveLength(1);
  expect(selected[0]?.w).toBe(2048);
  expect(selected[0]?.order).toBe(0);
}
