import { describe, expect, test } from "bun:test";
import { parseZhihuImageCache } from "./zhihu";

describe("知乎图片上传缓存", () => {
  test("缺 payload 的旧缓存视为未命中", () => {
    expect(parseZhihuImageCache(null)).toBeNull();
    expect(parseZhihuImageCache({})).toBeNull();
  });

  test("保留完整上传结果并补齐可选水印字段", () => {
    expect(parseZhihuImageCache({
      id: "image-id",
      url: "https://pic.example.com/image.jpg",
      originalUrl: "https://pic.example.com/original.jpg",
      width: 1024,
      height: 768,
    })).toEqual({
      id: "image-id",
      url: "https://pic.example.com/image.jpg",
      originalUrl: "https://pic.example.com/original.jpg",
      watermark: "watermark",
      watermarkUrl: "https://pic.example.com/image.jpg",
      width: 1024,
      height: 768,
    });
  });
});
