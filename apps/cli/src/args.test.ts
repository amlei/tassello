import { describe, expect, test } from "bun:test";
import { CliUsageError, parseCliArgs } from "./args";

describe("Onda CLI 参数", () => {
  test("generate 默认从 stdin 读取并立即返回", () => {
    expect(parseCliArgs(["image", "generate", "--json"])).toEqual({
      action: "generate",
      source: "-",
      wait: false,
      timeoutMs: 1_200_000,
      intervalMs: 2_000,
      json: true,
    });
    expect(parseCliArgs(["image", "generate", "-", "--json"])).toMatchObject({
      action: "generate",
      source: "-",
      json: true,
    });
  });

  test("支持等待时长、轮询间隔和 API 覆盖", () => {
    expect(parseCliArgs([
      "image",
      "wait",
      "g1234567890abcdef",
      "--timeout",
      "45s",
      "--interval",
      "500ms",
      "--api",
      "http://127.0.0.1:4319",
      "--json",
    ])).toEqual({
      action: "wait",
      id: "g1234567890abcdef",
      timeoutMs: 45_000,
      intervalMs: 500,
      apiOrigin: "http://127.0.0.1:4319",
      json: true,
    });
  });

  test("拒绝未知参数和缺失任务 ID", () => {
    expect(() => parseCliArgs(["image", "status"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["image", "list", "--wait"])).toThrow(CliUsageError);
  });
});
