import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  getInstallationIdentity,
  getSettings,
  readJsonFile,
  resolveAttachmentDir,
  resolveDataDir,
  resolveDefaultVaultPath,
  resolveRuntimeDiscoveryPath,
  saveSettings,
  statePath,
  writeJsonAtomic,
} from "./state";

const originalDataDir = process.env.TASSELLO_DATA_DIR;
const tempDirs: string[] = [];

afterEach(async () => {
  if (originalDataDir === undefined) delete process.env.TASSELLO_DATA_DIR;
  else process.env.TASSELLO_DATA_DIR = originalDataDir;
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function useTempDataDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tassello-state-"));
  tempDirs.push(dir);
  process.env.TASSELLO_DATA_DIR = dir;
  return dir;
}

test("installationId 稳定且状态文件原子落盘", async () => {
  const dir = await useTempDataDir();
  const first = await getInstallationIdentity();
  const second = await getInstallationIdentity();
  assert.equal(resolveDataDir(), dir);
  assert.equal(first.installationId, second.installationId);
  await writeJsonAtomic(path.join(dir, "state", "sample.json"), { ok: true });
  assert.deepEqual(await readJsonFile(path.join(dir, "state", "sample.json"), null), { ok: true });
});

test("设置缺省跟随系统并使用默认 Vault", async () => {
  await useTempDataDir();
  const initial = await getSettings();
  assert.equal(initial.theme, "system");
  assert.equal(initial.vaultPath, null);
  assert.equal(initial.attachmentPath, "files");
  assert.equal(resolveDefaultVaultPath(), path.join(os.homedir(), "Documents", "Onda"));
  const saved = await saveSettings({ vaultPath: "/tmp/tassello-vault", theme: "dark" });
  assert.equal(saved.theme, "dark");
  assert.equal(saved.vaultPath, "/tmp/tassello-vault");
  assert.deepEqual(await getSettings(), saved);
  assert.equal(statePath("settings.json").startsWith(resolveDataDir()), true);
});

test("资源目录支持内容目录内相对路径、绝对路径和主目录缩写", async () => {
  const dataDir = await useTempDataDir();
  const vault = path.join(dataDir, "vault");
  const absoluteDir = path.join(dataDir, "outside-files");
  assert.equal(resolveAttachmentDir(vault, "files"), path.join(vault, "files"));
  assert.equal(resolveAttachmentDir(vault, absoluteDir), absoluteDir);
  assert.equal(resolveAttachmentDir(vault, "~/onda-files"), path.join(os.homedir(), "onda-files"));

  const absolute = await saveSettings({ vaultPath: vault, attachmentPath: `${absoluteDir}/` });
  assert.equal(absolute.attachmentPath, absoluteDir);
  const relative = await saveSettings({ attachmentPath: "./files/" });
  assert.equal(relative.attachmentPath, "files");
});

test("Native Host 可通过环境变量覆盖运行发现文件", () => {
  const original = process.env.TASSELLO_RUNTIME_FILE;
  process.env.TASSELLO_RUNTIME_FILE = "/tmp/onda-runtime.json";
  try {
    assert.equal(resolveRuntimeDiscoveryPath(), "/tmp/onda-runtime.json");
  } finally {
    if (original === undefined) delete process.env.TASSELLO_RUNTIME_FILE;
    else process.env.TASSELLO_RUNTIME_FILE = original;
  }
});
