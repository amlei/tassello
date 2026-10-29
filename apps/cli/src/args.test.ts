import { describe, expect, test } from "bun:test";
import { CliUsageError, parseCliArgs } from "./args";

describe("Onda CLI 参数", () => {
  test("generate image 从 stdin 创建生图任务", () => {
    expect(parseCliArgs(["generate", "image", "--json"])).toEqual({
      action: "creator-image-generate",
      source: "-",
      wait: false,
      timeoutMs: 1_200_000,
      intervalMs: 2_000,
      json: true,
    });
    expect(parseCliArgs(["generate", "image", "-", "--json"])).toMatchObject({
      action: "creator-image-generate",
      source: "-",
    });
  });

  test("generate image 支持等待时长和轮询间隔", () => {
    expect(parseCliArgs([
      "generate",
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
      action: "creator-image-wait",
      id: "g1234567890abcdef",
      timeoutMs: 45_000,
      intervalMs: 500,
      apiOrigin: "http://127.0.0.1:4319",
      json: true,
    });
  });

  test("publish 使用平台、类型和 Markdown 文件", () => {
    expect(parseCliArgs([
      "publish",
      "wechat",
      "article",
      "posts/demo.md",
      "--channel",
      "channel-1",
      "--wait",
      "--json",
    ])).toMatchObject({
      action: "publish",
      platformId: "wechat",
      contentType: "article",
      filePath: "posts/demo.md",
      channelId: "channel-1",
      wait: true,
      json: true,
    });
  });

  test("tasks list 支持平台、类型和状态过滤", () => {
    expect(parseCliArgs([
      "tasks",
      "list",
      "--platform",
      "zhihu",
      "--type",
      "article",
      "--status",
      "awaiting_confirm",
      "--json",
    ])).toEqual({
      action: "tasks-list",
      platformId: "zhihu",
      contentType: "article",
      status: "awaiting_confirm",
      json: true,
    });
  });

  test("拒绝旧 image 入口、未知类型和缺失确认结果", () => {
    expect(() => parseCliArgs(["image", "generate"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["publish", "wechat", "story", "demo.md"])).toThrow(CliUsageError);
    expect(() => parseCliArgs(["tasks", "confirm", "t-1"])).toThrow(CliUsageError);
    expect(() => parseCliArgs([
      "tasks",
      "confirm",
      "t-1",
      "--url",
      "https://example.com/post",
      "--no-public-url",
    ])).toThrow(CliUsageError);
  });
});
