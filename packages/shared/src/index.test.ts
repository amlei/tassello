import { describe, expect, test } from "bun:test";
import { imageGenerationRequestSchema } from "./index";

describe("应用内网页生图契约", () => {
  test("默认使用豆包免费最高档模型", () => {
    const parsed = imageGenerationRequestSchema.parse({
      items: [{ prompt: "晨光中的郁金香静物" }],
    });
    expect(parsed.platform).toBe("doubao");
    expect(parsed.model).toBe("Seedream 5.0 Flash");
    expect(parsed.items[0]).toEqual({ prompt: "晨光中的郁金香静物" });
  });

  test("拒绝已删除的比例参数和非安全文件名", () => {
    expect(imageGenerationRequestSchema.safeParse({
      items: [{ prompt: "插画", ratio: "16:9" }],
    }).success).toBe(false);
    expect(imageGenerationRequestSchema.safeParse({
      name: "../escape",
      items: [{ prompt: "插画" }],
    }).success).toBe(false);
  });
});
