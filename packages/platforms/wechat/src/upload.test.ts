import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import type { PlatformAssetUploadQuery, PlatformAssetUploadRef } from "@tassello/platform-core";
import { uploadWechatMaterial, wechatMime, wechatSourceFilename } from "./upload";

type StoreCall = { op: "find" | "save"; query: PlatformAssetUploadQuery };

function memoryAssetStore(contentKey: (query: PlatformAssetUploadQuery) => string = (query) => query.assetPath) {
  const rows = new Map<string, PlatformAssetUploadRef>();
  const calls: StoreCall[] = [];
  const key = (query: PlatformAssetUploadQuery) =>
    [query.accountId, query.scope, query.kind, contentKey(query)].join("\n");

  return {
    calls,
    async find(query: PlatformAssetUploadQuery) {
      calls.push({ op: "find", query });
      return rows.get(key(query)) ?? null;
    },
    async save(query: PlatformAssetUploadQuery, ref: PlatformAssetUploadRef) {
      calls.push({ op: "save", query });
      const saved = { ...ref };
      rows.set(key(query), saved);
      return saved;
    },
    async forget(query: PlatformAssetUploadQuery) {
      rows.delete(key(query));
    },
  };
}

describe("WeChat material upload", () => {
  test("keeps the source filename and reuses the central platform reference", async () => {
    const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "tassello-wechat-upload-"));
    const filePath = path.join(directory, "插图01.png");
    await fsp.writeFile(filePath, Buffer.from("fake-image"));
    assert.equal(wechatSourceFilename(filePath), "插图01.png");
    assert.equal(wechatMime(filePath), "image/png");

    let uploads = 0;
    const cdp = {
      send: async <R>(): Promise<R> => {
        uploads += 1;
        return {
          result: {
            value: { ret: 0, content: "material-1", cdn: "https://mmbiz.qpic.cn/fake.png" },
          },
        } as R;
      },
    };
    const assets = memoryAssetStore();
    const options = { accountId: "account-1", scene: 8, assets };

    const first = await uploadWechatMaterial(cdp, "session", filePath, options);
    assert.equal(first.id, "material-1");
    assert.equal(first.filename, "插图01.png");
    assert.equal(first.cached, false);

    const second = await uploadWechatMaterial(cdp, "session", filePath, options);
    assert.equal(second.id, "material-1");
    assert.equal(second.filename, "插图01.png");
    assert.equal(second.cached, true);
    assert.equal(uploads, 1);
    assert.equal(assets.calls.filter((call) => call.op === "find").length, 2);
    assert.equal(assets.calls.filter((call) => call.op === "save").length, 1);
  });

  test("same bytes with a changed local name reuse the original material name", async () => {
    const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "tassello-wechat-upload-"));
    const firstPath = path.join(directory, "old-name.png");
    const secondPath = path.join(directory, "new-name.png");
    await fsp.writeFile(firstPath, Buffer.from("same-bytes"));
    await fsp.writeFile(secondPath, Buffer.from("same-bytes"));

    const cdp = {
      send: async <R>(): Promise<R> =>
        ({
          result: { value: { ret: 0, content: "material-2", cdn: "https://mmbiz.qpic.cn/same.png" } },
        }) as R,
    };
    const assets = memoryAssetStore(() => "same-bytes");
    const options = { accountId: "account-1", scene: 8, assets };

    const first = await uploadWechatMaterial(cdp, "session", firstPath, options);
    const second = await uploadWechatMaterial(cdp, "session", secondPath, options);

    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(second.id, "material-2");
    assert.equal(second.filename, "old-name.png");
  });

  test("without a runtime asset store it uploads and makes no cache promises", async () => {
    const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "tassello-wechat-upload-"));
    const filePath = path.join(directory, "asset.png");
    await fsp.writeFile(filePath, Buffer.from("script-upload"));

    let uploads = 0;
    const cdp = {
      send: async <R>(): Promise<R> => {
        uploads += 1;
        return {
          result: { value: { ret: 0, content: `material-${uploads}` } },
        } as R;
      },
    };

    const first = await uploadWechatMaterial(cdp, "session", filePath, { accountId: "account-1", scene: 8 });
    const second = await uploadWechatMaterial(cdp, "session", filePath, { accountId: "account-1", scene: 8 });
    assert.equal(first.cached, false);
    assert.equal(second.cached, false);
    assert.equal(uploads, 2);
  });
});
