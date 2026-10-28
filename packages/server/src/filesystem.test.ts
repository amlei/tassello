import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { listDirectories } from "./filesystem";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

test("目录浏览只列出当前层可见目录并标记 Obsidian Vault", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onda-filesystem-"));
  tempDirs.push(root);
  await Promise.all([
    fs.mkdir(path.join(root, "Onda", ".obsidian"), { recursive: true }),
    fs.mkdir(path.join(root, "Project"), { recursive: true }),
    fs.mkdir(path.join(root, ".hidden"), { recursive: true }),
    fs.writeFile(path.join(root, "note.md"), "# 不列出文件"),
  ]);

  const listing = await listDirectories(root);
  assert.equal(listing.path, root);
  assert.equal(listing.writable, true);
  assert.deepEqual(listing.entries.map((entry) => entry.name), ["Onda", "Project"]);
  assert.equal(listing.entries[0]?.isVault, true);
  assert.equal(listing.entries[1]?.isVault, false);
  assert.equal(listing.parent, os.tmpdir());
});

test("目录浏览拒绝文件路径", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onda-filesystem-"));
  tempDirs.push(root);
  const file = path.join(root, "note.md");
  await fs.writeFile(file, "# note");
  await assert.rejects(listDirectories(file), /不是目录/);
});
