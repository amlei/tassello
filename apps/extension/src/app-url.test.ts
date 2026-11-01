import { describe, expect, test } from "bun:test";
import { resolveWebAppUrl } from "./app-url";

describe("扩展打开 Web 界面", () => {
  test("使用服务端给出的 Web origin，而不是 API origin", () => {
    expect(resolveWebAppUrl("http://localhost:3000", "/library/article"))
      .toBe("http://localhost:3000/library/article");
    expect(resolveWebAppUrl("http://127.0.0.1:49231", "/library/article?settings=1"))
      .toBe("http://127.0.0.1:49231/library/article?settings=1");
  });

  test("拒绝缺失、非 HTTP 和非本机地址", () => {
    expect(() => resolveWebAppUrl(null, "/library/article")).toThrow(/没有提供/);
    expect(() => resolveWebAppUrl("https://example.com", "/library/article")).toThrow(/无效/);
    expect(() => resolveWebAppUrl("http://192.168.1.2:3000", "/library/article")).toThrow(/无效/);
  });
});
