import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createMediaToken, resolveMediaToken, validateMediaFile } from "./media-token";

const originalDataDir = process.env.TASSELLO_DATA_DIR;
let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tassello-media-"));
  process.env.TASSELLO_DATA_DIR = root;
});

afterEach(async () => {
  if (originalDataDir === undefined) delete process.env.TASSELLO_DATA_DIR;
  else process.env.TASSELLO_DATA_DIR = originalDataDir;
  await fs.rm(root, { recursive: true, force: true });
});

test("媒体 token 只签发给类型与内容一致的本地文件", async () => {
  const image = path.join(root, "demo.png");
  const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  await fs.writeFile(image, pngHeader);

  const token = await createMediaToken(image, "image");
  assert.equal(await resolveMediaToken(token), image);
  assert.equal((await validateMediaFile(image, "image")).ext, ".png");
});

test("伪装扩展名不会获得媒体 token", async () => {
  const disguised = path.join(root, "private.mp3");
  await fs.writeFile(disguised, "not audio");
  await assert.rejects(() => createMediaToken(disguised, "audio"), /文件内容与audio媒体类型不匹配/);
});
