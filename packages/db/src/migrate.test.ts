/* 迁移执行测试（官方 CLI exec）：覆盖全新安装、0 字节空库、幂等与用户原始报错路径。
 * dev 分支真实 spawn `bun x prisma migrate deploy`（cwd=packages/db），
 * 每个用例独立的 TASSELLO_DATA_DIR 临时目录；node:test 文件内默认串行执行。 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createClient, type Client } from "@libsql/client";

import { getPrisma } from "./index.ts";
import { migrateToHead } from "./migrate.ts";

const EXPECTED_TABLES = [
  "Post",
  "Asset",
  "PlatformAccount",
  "PlatformAssetUpload",
  "PublishTask",
  "PublishLog",
  "Setting",
];

function useDataDir(): { dir: string; dbFile: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tassello-migrate-test-"));
  process.env.TASSELLO_DATA_DIR = dir;
  return { dir, dbFile: path.join(dir, "tassello.db") };
}

async function openDb(dbFile: string): Promise<Client> {
  return createClient({ url: "file:" + dbFile });
}

async function tableNames(client: Client): Promise<string[]> {
  const res = await client.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`);
  return res.rows.map((r) => String(r.name));
}

async function appliedMigrations(client: Client): Promise<string[]> {
  const res = await client.execute("SELECT migration_name FROM _prisma_migrations");
  return res.rows.map((r) => String(r.migration_name));
}

test("全新安装：deploy 后 7 张表齐全、官方迁移记录在案、幂等", async () => {
  const { dbFile } = useDataDir();
  await migrateToHead();
  const client = await openDb(dbFile);
  try {
    const names = await tableNames(client);
    for (const t of EXPECTED_TABLES) assert.ok(names.includes(t), `缺表 ${t}`);
    assert.deepEqual(await appliedMigrations(client), ["0001_init"]);
    // 幂等：再次迁移不报错、记录不变
    await migrateToHead();
    assert.deepEqual(await appliedMigrations(client), ["0001_init"]);
  } finally {
    client.close();
  }
});

test("v0.1.1 官方包遗留的 0 字节空库：同样收敛", async () => {
  const { dbFile } = useDataDir();
  writeFileSync(dbFile, ""); // 0 字节
  await migrateToHead();
  const client = await openDb(dbFile);
  try {
    const names = await tableNames(client);
    for (const t of EXPECTED_TABLES) assert.ok(names.includes(t), `缺表 ${t}`);
    assert.deepEqual(await appliedMigrations(client), ["0001_init"]);
  } finally {
    client.close();
  }
});

test("用户原始报错路径：迁移后 prisma.platformAccount.findMany() 正常", async () => {
  useDataDir();
  await migrateToHead();
  // v0.1.1 用户日志里刷了 314 次的就是这条调用
  const accounts = await getPrisma().platformAccount.findMany();
  assert.deepEqual(accounts, []);
});
