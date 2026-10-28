import { describe, expect, test } from "bun:test";
import {
  extensionAccountResultSchema,
  extensionLoginOpenedSchema,
} from "./index";

const requestId = "9a0f1b9f-7008-4bbc-9369-e242a4e35a7b";

describe("扩展账号协议", () => {
  test("接受只含展示字段和频道的账号结果", () => {
    const parsed = extensionAccountResultSchema.safeParse({
      type: "account.result",
      requestId,
      platformId: "xiaoyuzhou",
      state: "ok",
      error: null,
      profile: {
        uid: "user-1",
        name: "九漾电台",
        avatarUrl: "https://cdn.example.com/avatar.png",
        authExpiresAt: null,
        channels: [{ id: "podcast-1", name: "主节目", coverUrl: null }],
      },
    });
    expect(parsed.success).toBe(true);
  });

  test("拒绝 Cookie、Token 和未知 profile 字段", () => {
    const parsed = extensionAccountResultSchema.safeParse({
      type: "account.result",
      requestId,
      platformId: "weibo",
      state: "ok",
      error: null,
      profile: {
        uid: "1",
        name: "九漾",
        avatarUrl: null,
        authExpiresAt: null,
        channels: [],
        cookie: "secret",
      },
    });
    expect(parsed.success).toBe(false);
  });

  test("拒绝非 HTTP(S) 头像和过量频道", () => {
    const unsafeUrl = extensionAccountResultSchema.safeParse({
      type: "account.result",
      requestId,
      platformId: "douban",
      state: "ok",
      error: null,
      profile: {
        uid: "1",
        name: "九漾",
        avatarUrl: "javascript:alert(1)",
        authExpiresAt: null,
        channels: [],
      },
    });
    expect(unsafeUrl.success).toBe(false);

    const tooManyChannels = extensionAccountResultSchema.safeParse({
      type: "account.result",
      requestId,
      platformId: "ximalaya",
      state: "ok",
      error: null,
      profile: {
        uid: "1",
        name: "九漾",
        avatarUrl: null,
        authExpiresAt: null,
        channels: Array.from({ length: 201 }, (_, i) => ({ id: String(i), name: String(i) })),
      },
    });
    expect(tooManyChannels.success).toBe(false);
  });

  test("登录页回包与账号结果使用独立类型", () => {
    const opened = extensionLoginOpenedSchema.safeParse({
      type: "account.login-opened",
      requestId,
      platformId: "wechat",
      ok: true,
      error: null,
    });
    expect(opened.success).toBe(true);
    expect(extensionLoginOpenedSchema.safeParse({
      type: "account.result",
      requestId,
      platformId: "wechat",
      ok: true,
      error: null,
    }).success).toBe(false);
  });

  test("state 与 profile 必须保持一致", () => {
    expect(extensionAccountResultSchema.safeParse({
      type: "account.result",
      requestId,
      platformId: "weibo",
      state: "ok",
      error: null,
      profile: null,
    }).success).toBe(false);

    expect(extensionAccountResultSchema.safeParse({
      type: "account.result",
      requestId,
      platformId: "weibo",
      state: "needs_login",
      error: "需要登录",
      profile: {
        uid: "1",
        name: "九漾",
        avatarUrl: null,
        authExpiresAt: null,
        channels: [],
      },
    }).success).toBe(false);
  });

  test("账号资料超过 64 KiB 时拒绝", () => {
    const largeCover = `https://cdn.example.com/${"a".repeat(4060)}`;
    const parsed = extensionAccountResultSchema.safeParse({
      type: "account.result",
      requestId,
      platformId: "ximalaya",
      state: "ok",
      error: null,
      profile: {
        uid: "1",
        name: "九漾",
        avatarUrl: null,
        authExpiresAt: null,
        channels: Array.from({ length: 20 }, (_, i) => ({
          id: String(i),
          name: `专辑 ${i}`,
          coverUrl: largeCover,
        })),
      },
    });
    expect(parsed.success).toBe(false);
  });
});
