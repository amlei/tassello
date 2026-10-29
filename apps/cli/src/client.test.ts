import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CliCommandError, OndaApiClient, resolveApiOrigin } from "./client";

const originalOrigin = process.env.TASSELLO_API_ORIGIN;
const originalRuntimeFile = process.env.TASSELLO_RUNTIME_FILE;
const originalFetch = globalThis.fetch;
const tempDirs: string[] = [];

afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (originalOrigin === undefined) delete process.env.TASSELLO_API_ORIGIN;
  else process.env.TASSELLO_API_ORIGIN = originalOrigin;
  if (originalRuntimeFile === undefined) delete process.env.TASSELLO_RUNTIME_FILE;
  else process.env.TASSELLO_RUNTIME_FILE = originalRuntimeFile;
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("Onda CLI API 发现", () => {
  test("优先使用显式本机地址并拒绝远程地址", async () => {
    expect(await resolveApiOrigin("http://127.0.0.1:4319/")).toBe("http://127.0.0.1:4319");
    await expect(resolveApiOrigin("https://example.com")).rejects.toBeInstanceOf(CliCommandError);
  });

  test("读取 runtime.json 中的动态端口", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "onda-cli-runtime-"));
    tempDirs.push(root);
    const file = path.join(root, "runtime.json");
    await fs.writeFile(file, JSON.stringify({ apiOrigin: "http://localhost:4322" }));
    process.env.TASSELLO_RUNTIME_FILE = file;
    delete process.env.TASSELLO_API_ORIGIN;
    expect(await resolveApiOrigin()).toBe("http://localhost:4322");
  });
});

describe("Onda CLI API 客户端", () => {
  test("创建任务时发送结构化请求", async () => {
    let body = "";
    globalThis.fetch = (async (_url, init) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({
        ok: true,
        data: {
          id: "g1234567890abcdef",
          platform: "doubao",
          model: "Seedream 5.0 Flash",
          name: "sample",
          status: "queued",
          stage: 0,
          progress: 0,
          total: 1,
          completed: 0,
          outputDirectory: "files/generated/sample",
          outputs: [],
          error: null,
          pageUrl: null,
          tabId: null,
          createdAt: "2026-10-29T00:00:00.000Z",
          updatedAt: "2026-10-29T00:00:00.000Z",
          startedAt: null,
          finishedAt: null,
        },
      }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const client = new OndaApiClient("http://127.0.0.1:4311");
    const task = await client.generate({
      platform: "doubao",
      model: "Seedream 5.0 Flash",
      name: "sample",
      items: [{ prompt: "窗边植物插画", ratio: "16:9" }],
    });
    expect(task.id).toBe("g1234567890abcdef");
    expect(JSON.parse(body).items[0].ratio).toBe("16:9");
  });

  test("API 拒绝和连接失败使用稳定错误码", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      ok: false,
      error: "生图参数不合法",
    }), { status: 400, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const client = new OndaApiClient("http://127.0.0.1:4311");
    await expect(client.status("bad")).rejects.toMatchObject({ code: "request_failed", exitCode: 2 });

    globalThis.fetch = (async () => {
      throw new TypeError("connection refused");
    }) as unknown as typeof fetch;
    await expect(client.list()).rejects.toMatchObject({ code: "app_unavailable", exitCode: 3 });
  });
});
