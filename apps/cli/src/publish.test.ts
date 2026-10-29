import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PlatformDTO } from "@tassello/shared";
import { CliCommandError } from "./client";
import { preparePublishSource, validatePlatform } from "./index";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function platform(overrides: Partial<PlatformDTO> = {}): PlatformDTO {
  return {
    id: "wechat",
    name: "微信公众号",
    char: "微",
    color: "#07C160",
    link: "https://mp.weixin.qq.com/",
    supports: ["article", "image", "video", "audio"],
    authMode: "extension",
    autoSubmit: false,
    publishPersistence: { article: "draft" },
    lands: "草稿",
    status: "active",
    account: {
      id: "wechat",
      platformId: "wechat",
      state: "ok",
      failReason: null,
      name: "九漾",
      uid: "wx-1",
      avatarUrl: null,
      authExpiresAt: null,
      lastCheckedAt: null,
      channels: [],
    },
    sync: { phase: "connected", reason: null },
    ...overrides,
  };
}

describe("统一发布 CLI", () => {
  test("读取 frontmatter、校验类型并计算原始 Markdown 指纹", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "onda-cli-publish-"));
    tempDirs.push(root);
    const markdown = [
      "---",
      "tassello:",
      "  id: m1234567890",
      "  type: article",
      "---",
      "",
      "# 测试文章",
      "",
      "正文",
      "",
    ].join("\n");
    await fs.writeFile(path.join(root, "demo.md"), markdown);
    const source = await preparePublishSource("demo.md", "article", root);
    expect(source.id).toBe("m1234567890");
    expect(source.filePath).toBe("demo.md");
    expect(source.vaultPath).toBe(root);
    expect(source.markdown).toBe(markdown);
    expect(source.fingerprint).toBe(createHash("sha256").update(markdown).digest("hex"));
  });

  test("拒绝 frontmatter 类型与命令类型不一致", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "onda-cli-publish-"));
    tempDirs.push(root);
    await fs.writeFile(path.join(root, "demo.md"), "---\ntassello:\n  id: m1234567890\n  type: image\n---\n");
    await expect(preparePublishSource("demo.md", "article", root))
      .rejects.toMatchObject({ code: "content_type_mismatch" });
  });

  test("平台必须 active、账号已连接且支持指定类型", () => {
    expect(validatePlatform([platform()], "wechat", "article").id).toBe("wechat");
    expect(() => validatePlatform([platform({ status: "planned" })], "wechat", "article"))
      .toThrow(CliCommandError);
    expect(() => validatePlatform([platform({ supports: ["image"] })], "wechat", "article"))
      .toThrow(CliCommandError);
    expect(() => validatePlatform([platform({ sync: { phase: "needs_login", reason: "需要登录" } })], "wechat", "article"))
      .toThrow(CliCommandError);
  });
});
