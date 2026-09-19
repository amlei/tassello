/* @tassello/db —— Prisma client 单例 + 路径解析导出 */
import fs from "node:fs";
import path from "node:path";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "./generated/prisma/client";
import { resolveDataDir, resolveDbFile, resolveDbUrl } from "./paths";

export { resolveDataDir, resolveDbFile, resolveDbUrl };

let singleton: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (singleton) return singleton;
  const dbFile = resolveDbFile();
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  singleton = new PrismaClient({ adapter: new PrismaLibSql({ url: "file:" + dbFile }) });
  return singleton;
}

export type { PrismaClient };
export * from "./generated/prisma/enums";
