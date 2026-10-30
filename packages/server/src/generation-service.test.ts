import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import type { ImageGenerationJob } from "@tassello/shared";
import {
  createImageGeneration,
  getImageGeneration,
  onImageGenerationDisconnected,
  onImageGenerationEvent,
  onImageGenerationResult,
  setImageGenerationDispatcher,
} from "./generation-service";

const originalDataDir = process.env.TASSELLO_DATA_DIR;
const originalVaultDir = process.env.TASSELLO_VAULT_DIR;
const originalFetch = globalThis.fetch;
const tempDirs: string[] = [];

async function setup(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tassello-generation-"));
  tempDirs.push(root);
  process.env.TASSELLO_DATA_DIR = path.join(root, "data");
  process.env.TASSELLO_VAULT_DIR = path.join(root, "vault");
  setImageGenerationDispatcher((job) => {
    assert.equal(job.request.platform, "doubao");
    assert.equal(job.request.model, "Seedream 5.0 Flash");
    return true;
  });
}

afterEach(async () => {
  setImageGenerationDispatcher(null);
  globalThis.fetch = originalFetch;
  if (originalDataDir === undefined) delete process.env.TASSELLO_DATA_DIR;
  else process.env.TASSELLO_DATA_DIR = originalDataDir;
  if (originalVaultDir === undefined) delete process.env.TASSELLO_VAULT_DIR;
  else process.env.TASSELLO_VAULT_DIR = originalVaultDir;
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("应用内网页生图任务", { concurrency: false }, () => {
  test("创建任务时复用默认限制并立即派发", async () => {
    await setup();
    const dispatched: ImageGenerationJob[] = [];
    setImageGenerationDispatcher((job) => {
      dispatched.push(job);
      return true;
    });
    const task = await createImageGeneration({
      platform: "doubao",
      model: "Seedream 5.0 Flash",
      name: "autumn-window",
      items: [
        { prompt: "秋日窗边的橘猫，16:9 横版构图", slug: "orange-cat" },
      ],
    });
    assert.equal(task.status, "waiting_extension");
    assert.equal(task.total, 1);
    assert.equal(dispatched.length, 0);
  });

  test("成功结果下载到 Vault 并返回可追踪文件信息", async () => {
    await setup();
    setImageGenerationDispatcher(() => false);
    const task = await createImageGeneration({
      platform: "doubao",
      model: "Seedream 5.0 Flash",
      name: "autumn-window",
      items: [
        { prompt: "秋日窗边的橘猫，16:9 横版构图", slug: "orange-cat" },
      ],
    });
    const png = Uint8Array.from(Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=",
      "base64",
    ));
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      url: "https://p3-flow-imagex-sign.byteimg.com/result.png",
      headers: new Headers({ "content-type": "image/png", "content-length": String(png.byteLength) }),
      arrayBuffer: async () => png.buffer,
    })) as unknown as typeof fetch;

    await onImageGenerationResult({
      type: "generation.result",
      jobId: task.id,
      result: {
        status: "success",
        outputs: [{
          promptIndex: 0,
          outputIndex: 0,
          src: "https://p3-flow-imagex-sign.byteimg.com/result.png",
          width: 2048,
          height: 1152,
        }],
      },
    });

    const completed = await getImageGeneration(task.id);
    assert.equal(completed?.status, "success");
    assert.equal(completed?.completed, 1);
    assert.equal(completed?.progress, 100);
    assert.equal(completed?.outputs.length, 1);
    const output = completed?.outputs[0];
    assert.ok(output);
    assert.equal(output.width, 2048);
    assert.equal(output.height, 1152);
    assert.match(output.relativePath, /^files\/generated\/\d{4}-\d{2}-\d{2}-autumn-window\/01-orange-cat\.png$/);
    assert.equal((await fs.readFile(output.filePath)).byteLength, png.byteLength);
  });

  test("额度耗尽保留原因且不伪造成功", async () => {
    await setup();
    setImageGenerationDispatcher(() => false);
    const task = await createImageGeneration({
      platform: "doubao",
      model: "Seedream 5.0 Flash",
      items: [{ prompt: "清晨山谷插画，16:9 横版构图" }],
    });
    await onImageGenerationResult({
      type: "generation.result",
      jobId: task.id,
      result: {
        status: "quota_exhausted",
        outputs: [],
        error: "今日图片生成免费次数已用完",
      },
    });
    const completed = await getImageGeneration(task.id);
    assert.equal(completed?.status, "quota_exhausted");
    assert.equal(completed?.error, "今日图片生成免费次数已用完");
    assert.ok(completed?.finishedAt);
  });

  test("结果下载期间扩展断开不会覆盖已取得的原图", async () => {
    await setup();
    setImageGenerationDispatcher(() => false);
    const task = await createImageGeneration({
      platform: "doubao",
      model: "Seedream 5.0 Flash",
      items: [{ prompt: "雨后的青色石阶，16:9 横版构图", slug: "after-rain" }],
    });
    await onImageGenerationEvent({
      type: "generation.event",
      jobId: task.id,
      event: { status: "generating" },
    });
    let release: (() => void) | undefined;
    let markFetchStarted: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    globalThis.fetch = (async () => {
      markFetchStarted?.();
      await gate;
      return {
        ok: true,
        status: 200,
        url: "https://p11-flow-imagex-sign.byteimg.com/result.png",
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: async () => png.buffer,
      };
    }) as unknown as typeof fetch;
    const result = onImageGenerationResult({
      type: "generation.result",
      jobId: task.id,
      result: {
        status: "success",
        outputs: [{
          promptIndex: 0,
          outputIndex: 0,
          src: "https://p11-flow-imagex-sign.byteimg.com/result.png",
          width: 2048,
          height: 1152,
        }],
      },
    });
    await fetchStarted;
    await onImageGenerationDisconnected();
    release?.();
    await result;
    const completed = await getImageGeneration(task.id);
    assert.equal(completed?.status, "success");
  });

  test("同一幂等键不会创建第二个任务", async () => {
    await setup();
    setImageGenerationDispatcher(() => false);
    const request = {
      platform: "doubao" as const,
      model: "Seedream 5.0 Flash" as const,
      items: [{ prompt: "夜色中的城市窗景，16:9 横版构图" }],
      idempotencyKey: "same-agent-request",
    };
    const first = await createImageGeneration(request);
    const second = await createImageGeneration(request);
    assert.equal(second.id, first.id);
  });
});
