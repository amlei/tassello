import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { findUploadCache, forgetUploadCache, saveUploadCache } from "./upload-store";

const originalDataDir = process.env.TASSELLO_DATA_DIR;
const tempDirs: string[] = [];

afterEach(async () => {
  if (originalDataDir === undefined) delete process.env.TASSELLO_DATA_DIR;
  else process.env.TASSELLO_DATA_DIR = originalDataDir;
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

test("素材上传缓存按平台、账号、内容 hash 与用途隔离", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tassello-upload-cache-"));
  tempDirs.push(dir);
  process.env.TASSELLO_DATA_DIR = dir;
  const query = {
    platformId: "wechat",
    accountUid: "gh_primary",
    contentHash: "a".repeat(64),
    kind: "image",
    scope: "filetransfer:scene-8",
  };
  assert.equal(await findUploadCache(query), null);
  const saved = await saveUploadCache(query, {
    id: "material-1",
    url: "https://mmbiz.qpic.cn/demo.png",
    payload: { cdn: "https://mmbiz.qpic.cn/demo.png" },
  });
  assert.equal(saved.id, "material-1");
  assert.equal((await findUploadCache({ ...query, accountUid: "gh_other" })), null);
  assert.equal((await findUploadCache({ ...query, scope: "filetransfer:scene-4" })), null);
  assert.equal((await findUploadCache(query))?.url, "https://mmbiz.qpic.cn/demo.png");
  await forgetUploadCache(query);
  assert.equal(await findUploadCache(query), null);
});
