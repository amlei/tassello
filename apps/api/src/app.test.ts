import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import { BUNDLED_EXTENSION_ID, extensionOrigin } from "@tassello/shared";
import { autoPairExtension, setPreferredExtensionBrowser } from "@tassello/server";

const originalDataDir = process.env.TASSELLO_DATA_DIR;
const originalVaultDir = process.env.TASSELLO_VAULT_DIR;
const originalDisableReconcile = process.env.TASSELLO_DISABLE_ACCOUNT_RECONCILE;
const tempDirs: string[] = [];

function nextMessageOfType(socket: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener("message", listener);
      reject(new Error(`等待 WebSocket 消息 ${type} 超时`));
    }, 3000);
    const listener = (event: MessageEvent) => {
      const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (payload.type !== type) return;
      clearTimeout(timer);
      socket.removeEventListener("message", listener);
      resolve(payload);
    };
    socket.addEventListener("message", listener);
  });
}

afterEach(async () => {
  if (originalDataDir === undefined) delete process.env.TASSELLO_DATA_DIR;
  else process.env.TASSELLO_DATA_DIR = originalDataDir;
  if (originalVaultDir === undefined) delete process.env.TASSELLO_VAULT_DIR;
  else process.env.TASSELLO_VAULT_DIR = originalVaultDir;
  if (originalDisableReconcile === undefined) delete process.env.TASSELLO_DISABLE_ACCOUNT_RECONCILE;
  else process.env.TASSELLO_DISABLE_ACCOUNT_RECONCILE = originalDisableReconcile;
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function setup(): Promise<typeof import("./app").app> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tassello-api-"));
  tempDirs.push(dir);
  process.env.TASSELLO_DATA_DIR = path.join(dir, "data");
  process.env.TASSELLO_VAULT_DIR = path.join(dir, "vault");
  process.env.TASSELLO_DISABLE_ACCOUNT_RECONCILE = "1";
  const module = await import("./app");
  return module.app;
}

describe("API 路由", { concurrency: false }, () => {
  test("文档 API 以 Markdown 文件为事实源", async () => {
    const app = await setup();
    const createdResponse = await app.handle(new Request("http://localhost/api/v1/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "article", title: "API 测试", markdown: "**正文**" }),
    }));
    const created = await createdResponse.json() as {
      ok: true;
      data: { id: string; markdown: string; fingerprint: string; bodyHtml: string };
    };
    assert.equal(created.ok, true);
    assert.equal(created.data.markdown, "**正文**");
    assert.match(created.data.bodyHtml, /<strong>正文<\/strong>/);

    const updatedResponse = await app.handle(new Request(`http://localhost/api/v1/posts/${created.data.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        markdown: "更新后的正文",
        expectedFingerprint: created.data.fingerprint,
      }),
    }));
    const updated = await updatedResponse.json() as { ok: true; data: { markdown: string } };
    assert.equal(updated.ok, true);
    assert.equal(updated.data.markdown, "更新后的正文");
  });

  test("封面图保存为当前稿件资产并写入 frontmatter", async () => {
    const app = await setup();
    const created = await app.handle(new Request("http://localhost/api/v1/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "article", title: "封面测试", markdown: "正文" }),
    }));
    const post = (await created.json() as { data: { id: string } }).data;
    const form = new FormData();
    const png = Uint8Array.from(Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=",
      "base64",
    ));
    form.set("file", new File([png], "cover.png", { type: "image/png" }));
    const response = await app.handle(new Request(`http://localhost/api/v1/posts/${post.id}/cover`, {
      method: "POST",
      body: form,
    }));
    const payload = await response.json() as {
      ok: true;
      data: { cover: string | null; assets: Array<{ kind: string; role?: string }> };
    };
    assert.equal(payload.ok, true);
    assert.match(payload.data.cover ?? "", /cover-cover\.png$/);
    assert.equal(payload.data.assets.some((asset) => asset.kind === "image" && asset.role === "cover"), true);
  });

  test("扩展状态在未连接时为 waiting", async () => {
    const app = await setup();
    const response = await app.handle(new Request("http://localhost/api/v1/extensions/status"));
    const payload = await response.json() as {
      ok: true;
      data: { state: string; installationId: string };
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.data.state, "waiting");
    assert.ok(payload.data.installationId);
  });

  test("播客 RSS 无记录时返回 null，并拒绝非 HTTP(S) 地址", async () => {
    const app = await setup();
    const empty = await app.handle(new Request("http://localhost/api/v1/podcast-rss"));
    assert.deepEqual(await empty.json(), { ok: true, data: null });

    const invalid = await app.handle(new Request("http://localhost/api/v1/podcast-rss", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedUrl: "file:///tmp/feed.xml" }),
    }));
    assert.equal(invalid.status, 400);
  });

  test("平台账号在扩展未连接时返回明确状态，而不是伪造未登录", async () => {
    const app = await setup();
    const platformsResponse = await app.handle(new Request("http://localhost/api/v1/platforms"));
    const platforms = await platformsResponse.json() as {
      ok: true;
      data: { id: string; status: string; sync: { phase: string } }[];
    };
    assert.equal(platforms.ok, true);
    assert.equal(platforms.data.find((platform) => platform.id === "weibo")?.sync.phase, "extension_offline");
    assert.equal(platforms.data.find((platform) => platform.id === "bili")?.sync.phase, "unsupported");

    const verifyResponse = await app.handle(new Request("http://localhost/api/v1/accounts/weibo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "verify" }),
    }));
    assert.equal(verifyResponse.status, 409);
    const verifyPayload = await verifyResponse.json() as { ok: false; error: string };
    assert.equal(verifyPayload.ok, false);
    assert.match(verifyPayload.error, /扩展/);
  });

  test("未知平台账号操作返回 404", async () => {
    const app = await setup();
    const response = await app.handle(new Request("http://localhost/api/v1/accounts/not-a-platform", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "verify" }),
    }));
    assert.equal(response.status, 404);
  });

  test("Obsidian 桌面 WebView 来源允许跨域读取本机 API", async () => {
    const app = await setup();
    const response = await app.handle(new Request("http://localhost/api/v1/health", {
      headers: { Origin: "app://obsidian.md" },
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "app://obsidian.md");
  });

  test("受信任扩展通过 Native Messaging 发现后自动配对", async () => {
    const app = await setup();
    const rejected = await app.handle(new Request("http://localhost/api/v1/extensions/auto-pair", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/",
      },
      body: JSON.stringify({
        extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        browserLabel: "Chrome",
        version: "0.1.0",
      }),
    }));
    assert.equal(rejected.status, 403);

    const paired = await app.handle(new Request("http://localhost/api/v1/extensions/auto-pair", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: extensionOrigin(BUNDLED_EXTENSION_ID).replace(/\/$/, ""),
      },
      body: JSON.stringify({
        extensionId: BUNDLED_EXTENSION_ID,
        browserLabel: "Chrome",
        userAgent: "test",
        version: "0.1.0",
      }),
    }));
    const payload = await paired.json() as {
      ok: true;
      data: { token: string; extension: { clientId: string; installationId: string } };
    };
    assert.equal(paired.status, 200);
    assert.ok(payload.data.token);
    assert.ok(payload.data.extension.clientId);
  });

  test("只允许当前选择的浏览器扩展自动配对", async () => {
    const app = await setup();
    await setPreferredExtensionBrowser("edge");
    const headers = {
      "content-type": "application/json",
      origin: extensionOrigin(BUNDLED_EXTENSION_ID).replace(/\/$/, ""),
    };
    const chrome = await app.handle(new Request("http://localhost/api/v1/extensions/auto-pair", {
      method: "POST",
      headers,
      body: JSON.stringify({
        extensionId: BUNDLED_EXTENSION_ID,
        browserLabel: "Chrome",
        version: "0.1.0",
      }),
    }));
    assert.equal(chrome.status, 403);

    const edge = await app.handle(new Request("http://localhost/api/v1/extensions/auto-pair", {
      method: "POST",
      headers,
      body: JSON.stringify({
        extensionId: BUNDLED_EXTENSION_ID,
        browserLabel: "Edge",
        version: "0.1.0",
      }),
    }));
    assert.equal(edge.status, 200);
  });

  test("扩展 WebSocket 只允许已鉴权连接提交消息", async () => {
    const app = await setup();
    const paired = await autoPairExtension({
      origin: extensionOrigin(BUNDLED_EXTENSION_ID),
      extensionId: BUNDLED_EXTENSION_ID,
      browserLabel: "Chrome",
      userAgent: "test",
      version: "0.1.0",
    });
    const server = app.listen({ port: 0, hostname: "127.0.0.1" });
    const port = server.server!.port!;
    const origin = extensionOrigin(BUNDLED_EXTENSION_ID).replace(/\/$/, "");
    const openSocket = async () => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/extension`, {
        headers: { Origin: origin },
      });
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), { once: true });
        socket.addEventListener("error", () => reject(new Error("WebSocket 连接失败")), { once: true });
      });
      return socket;
    };
    const closeSocket = async (socket: WebSocket) => {
      await new Promise<void>((resolve) => {
        socket.addEventListener("close", () => resolve(), { once: true });
        socket.close();
      });
    };

    try {
      const unauthenticated = await openSocket();
      const rejection = nextMessageOfType(unauthenticated, "error");
      unauthenticated.send(JSON.stringify({
        type: "account.result",
        requestId: "9a0f1b9f-7008-4bbc-9369-e242a4e35a7b",
        platformId: "weibo",
        state: "needs_login",
        error: "伪造回包",
        profile: null,
      }));
      assert.match(String((await rejection).error), /尚未完成鉴权/);
      await closeSocket(unauthenticated);

      const authenticated = await openSocket();
      authenticated.send(JSON.stringify({
        type: "hello",
        clientId: paired.extension.clientId,
        token: paired.token,
        accountProtocolVersion: 1,
      }));
      assert.equal((await nextMessageOfType(authenticated, "ready")).type, "ready");
      authenticated.send(JSON.stringify({ type: "ping" }));
      assert.equal((await nextMessageOfType(authenticated, "pong")).type, "pong");
      await closeSocket(authenticated);
    } finally {
      server.server?.stop(true);
    }
  });

  test("合法图片通过签名媒体地址返回且带安全响应头", async () => {
    const app = await setup();
    const vault = process.env.TASSELLO_VAULT_DIR!;
    await fs.mkdir(path.join(vault, "images"), { recursive: true });
    await fs.writeFile(
      path.join(vault, "images", "demo.png"),
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
    );
    const createdResponse = await app.handle(new Request("http://localhost/api/v1/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "image", title: "图片", markdown: "![配图](demo.png)" }),
    }));
    const created = await createdResponse.json() as {
      ok: true;
      data: { assets: { url: string | null }[] };
    };
    const mediaPath = created.data.assets[0]?.url?.replace("/api/assets/", "/api/v1/assets/");
    assert.ok(mediaPath);

    const mediaResponse = await app.handle(new Request(`http://localhost${mediaPath}`));
    assert.equal(mediaResponse.status, 200);
    assert.equal(mediaResponse.headers.get("content-type"), "image/png");
    assert.equal(mediaResponse.headers.get("x-content-type-options"), "nosniff");
    assert.equal(mediaResponse.headers.get("cross-origin-resource-policy"), "same-origin");
  });

  test("粘贴资源按资源目录设置落盘，并以相对 Markdown 路径引用", async () => {
    const app = await setup();
    const vault = process.env.TASSELLO_VAULT_DIR!;
    const configured = await app.handle(new Request("http://localhost/api/v1/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attachmentPath: "files" }),
    }));
    assert.equal(configured.status, 200);

    const createdResponse = await app.handle(new Request("http://localhost/api/v1/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "article", title: "资源测试", markdown: "正文" }),
    }));
    const created = await createdResponse.json() as {
      ok: true;
      data: { id: string; markdown: string; assets: unknown[] };
    };
    assert.equal(created.ok, true);

    const form = new FormData();
    form.set("kind", "image");
    form.set("file", new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], "paste.jpg", { type: "image/jpeg" }));
    const uploaded = await app.handle(new Request(`http://localhost/api/v1/posts/${created.data.id}/media`, {
      method: "POST",
      body: form,
    }));
    const payload = await uploaded.json() as {
      ok: true;
      data: { markdown: string; assets: { path: string | null }[] };
    };
    assert.equal(payload.ok, true);
    assert.match(payload.data.markdown, new RegExp(`\\.\\./files/${created.data.id}/\\d+-paste\\.jpg`));
    const assetPath = payload.data.assets.at(-1)?.path;
    assert.ok(assetPath?.startsWith(path.join(vault, "files", created.data.id)));
  });

  test("资源目录不可创建时拒绝设置且不覆盖已有配置", async () => {
    const app = await setup();
    const vault = process.env.TASSELLO_VAULT_DIR!;
    await fs.mkdir(vault, { recursive: true });
    await fs.writeFile(path.join(vault, "not-a-directory"), "file");

    const response = await app.handle(new Request("http://localhost/api/v1/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attachmentPath: "not-a-directory" }),
    }));
    assert.equal(response.status, 400);

    const settingsResponse = await app.handle(new Request("http://localhost/api/v1/settings"));
    const settings = await settingsResponse.json() as { ok: true; data: { attachmentPath: string } };
    assert.equal(settings.data.attachmentPath, "files");
  });

  test("平台素材上传缓存可按内容 hash 查询和删除", async () => {
    const app = await setup();
    const query = {
      platformId: "wechat",
      accountUid: "gh_test",
      contentHash: "b".repeat(64),
      kind: "image",
      scope: "filetransfer:scene-8",
    };
    const lookupBefore = await app.handle(new Request("http://localhost/api/v1/uploads/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(query),
    }));
    assert.equal((await lookupBefore.json() as { data: unknown }).data, null);

    const saved = await app.handle(new Request("http://localhost/api/v1/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...query,
        id: "material-1",
        url: "https://mmbiz.qpic.cn/demo.png",
        payload: { cdn: "https://mmbiz.qpic.cn/demo.png" },
      }),
    }));
    assert.equal(saved.status, 200);
    const lookupAfter = await app.handle(new Request("http://localhost/api/v1/uploads/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(query),
    }));
    assert.equal((await lookupAfter.json() as { data: { id: string } }).data.id, "material-1");
    const removed = await app.handle(new Request("http://localhost/api/v1/uploads", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(query),
    }));
    assert.equal(removed.status, 200);
  });
});
