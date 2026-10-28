import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BUNDLED_EXTENSION_ID, extensionOrigin, type ExtensionAccountRequest } from "@tassello/shared";
import {
  AccountSyncError,
  connectExtension,
  handleExtensionAccountMessage,
  listPlatformsWithAccountSync,
  setExtensionAccountConnection,
  setExtensionAccountRequestDispatcher,
  verifyAccountThroughExtension,
} from "./index";
import { autoPairExtension } from "./extensions";
import { saveAccountVerification } from "./account-store";

const originalDataDir = process.env.TASSELLO_DATA_DIR;
const tempDirs: string[] = [];

afterEach(async () => {
  setExtensionAccountConnection(null);
  setExtensionAccountRequestDispatcher(null);
  if (originalDataDir === undefined) delete process.env.TASSELLO_DATA_DIR;
  else process.env.TASSELLO_DATA_DIR = originalDataDir;
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function setupExtension(): Promise<{ clientId: string; browserLabel: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tassello-account-sync-"));
  tempDirs.push(dir);
  process.env.TASSELLO_DATA_DIR = path.join(dir, "data");
  const paired = await autoPairExtension({
    origin: extensionOrigin(BUNDLED_EXTENSION_ID),
    extensionId: BUNDLED_EXTENSION_ID,
    browserLabel: "Chrome",
    userAgent: "test",
    version: "0.1.0",
  });
  await connectExtension(paired.extension.clientId);
  return {
    clientId: paired.extension.clientId,
    browserLabel: paired.extension.browserLabel,
  };
}

function successResult(request: ExtensionAccountRequest) {
  return {
    type: "account.result" as const,
    requestId: request.requestId,
    platformId: request.platformId,
    state: "ok" as const,
    error: null,
    profile: {
      uid: "user-1",
      name: "九漾账号",
      avatarUrl: "https://cdn.example.com/avatar.png",
      authExpiresAt: null,
      channels: [{ id: "channel-1", name: "主频道", coverUrl: null }],
    },
  };
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("等待测试条件超时");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("浏览器扩展账号同步", () => {
  test("verify 请求经扩展回包后写入账号并更新平台状态", async () => {
    const connected = await setupExtension();
    setExtensionAccountConnection({ ...connected, accountProtocolVersion: 1 });
    let requests = 0;
    setExtensionAccountRequestDispatcher((request) => {
      requests += 1;
      queueMicrotask(() => {
        expect(handleExtensionAccountMessage(successResult(request))).toBe(true);
      });
      return true;
    });

    const account = await verifyAccountThroughExtension("xiaoyuzhou");
    expect(account.name).toBe("九漾账号");
    expect(account.channels).toEqual([{ id: "channel-1", name: "主频道", coverUrl: null }]);
    expect(requests).toBe(1);

    const platforms = await listPlatformsWithAccountSync();
    const podcast = platforms.find((platform) => platform.id === "xiaoyuzhou");
    expect(podcast?.sync.phase).toBe("connected");
    expect(podcast?.account?.uid).toBe("user-1");
  });

  test("同一平台并发 verify 只向扩展发送一次请求", async () => {
    const connected = await setupExtension();
    setExtensionAccountConnection({ ...connected, accountProtocolVersion: 1 });
    let requests = 0;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    setExtensionAccountRequestDispatcher((request) => {
      requests += 1;
      void blocked.then(() => {
        handleExtensionAccountMessage(successResult(request));
      });
      return true;
    });

    const first = verifyAccountThroughExtension("weibo");
    const second = verifyAccountThroughExtension("weibo");
    await waitForCondition(() => requests === 1);
    expect(requests).toBe(1);
    release();
    await Promise.all([first, second]);
  });

  test("不同平台 verify 仍按单标签页策略串行执行", async () => {
    const connected = await setupExtension();
    setExtensionAccountConnection({ ...connected, accountProtocolVersion: 1 });
    const observed: ExtensionAccountRequest[] = [];
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const secondGate = new Promise<void>((resolve) => { releaseSecond = resolve; });
    setExtensionAccountRequestDispatcher((request) => {
      observed.push(request);
      const gate = observed.length === 1 ? firstGate : secondGate;
      void gate.then(() => handleExtensionAccountMessage(successResult(request)));
      return true;
    });

    const first = verifyAccountThroughExtension("weibo");
    const second = verifyAccountThroughExtension("xhs");
    await waitForCondition(() => observed.length === 1);
    expect(observed.map((request) => request.platformId)).toEqual(["weibo"]);
    releaseFirst();
    await waitForCondition(() => observed.length === 2);
    expect(observed.map((request) => request.platformId)).toEqual(["weibo", "xhs"]);
    releaseSecond();
    await Promise.all([first, second]);
  });

  test("未登录结果持久化为需要登录", async () => {
    const connected = await setupExtension();
    setExtensionAccountConnection({ ...connected, accountProtocolVersion: 1 });
    setExtensionAccountRequestDispatcher((request) => {
      queueMicrotask(() => {
        handleExtensionAccountMessage({
          type: "account.result",
          requestId: request.requestId,
          platformId: request.platformId,
          state: "needs_login",
          error: "微博登录态已失效",
          profile: null,
        });
      });
      return true;
    });

    const account = await verifyAccountThroughExtension("weibo");
    expect(account.state).toBe("fail");
    expect(account.failReason).toContain("登录");
    const platforms = await listPlatformsWithAccountSync();
    expect(platforms.find((platform) => platform.id === "weibo")?.sync.phase).toBe("needs_login");
  });

  test("旧扩展协议明确返回 409，不发送请求", async () => {
    const connected = await setupExtension();
    setExtensionAccountConnection({ ...connected, accountProtocolVersion: 0 });
    let sent = false;
    setExtensionAccountRequestDispatcher(() => {
      sent = true;
      return true;
    });
    await expect(verifyAccountThroughExtension("weibo")).rejects.toMatchObject({
      name: "AccountSyncError",
      status: 409,
    });
    expect(sent).toBe(false);
  });

  test("非整数协议版本不会被当作可用扩展", async () => {
    const connected = await setupExtension();
    setExtensionAccountConnection({ ...connected, accountProtocolVersion: Number.NaN });
    await expect(verifyAccountThroughExtension("weibo")).rejects.toMatchObject({
      name: "AccountSyncError",
      status: 409,
    });
  });

  test("请求发送异常会记录检查失败而不是保留旧状态", async () => {
    const connected = await setupExtension();
    setExtensionAccountConnection({ ...connected, accountProtocolVersion: 1 });
    setExtensionAccountRequestDispatcher(() => {
      throw new Error("socket closed during send");
    });
    const error = await verifyAccountThroughExtension("douban").then(() => null, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("浏览器扩展未连接");
    const platforms = await listPlatformsWithAccountSync();
    expect(platforms.find((platform) => platform.id === "douban")?.sync.phase).toBe("failed");
  });

  test("扩展断开时立即拒绝在途账号请求", async () => {
    const connected = await setupExtension();
    setExtensionAccountConnection({ ...connected, accountProtocolVersion: 1 });
    let sent = false;
    setExtensionAccountRequestDispatcher(() => {
      sent = true;
      return true;
    });
    const observed = verifyAccountThroughExtension("wechat");
    await waitForCondition(() => sent);
    const pending = observed.then(
      () => null,
      (error: unknown) => error,
    );
    setExtensionAccountConnection(null);
    expect(await pending).toBeInstanceOf(AccountSyncError);
  });

  test("旧账号文件缺少来源字段时显示来源已变化", async () => {
    const connected = await setupExtension();
    setExtensionAccountConnection({ ...connected, accountProtocolVersion: 1 });
    await saveAccountVerification({
      platformId: "zhihu",
      outcome: "ok",
      error: null,
      profile: {
        uid: "legacy-user",
        name: "旧账号",
        avatarUrl: null,
        authExpiresAt: null,
        channels: [],
      },
      extensionClientId: "old-extension",
      browserLabel: "Edge",
    });
    const platforms = await listPlatformsWithAccountSync();
    expect(platforms.find((platform) => platform.id === "zhihu")?.sync.phase).toBe("source_changed");
  });
});
