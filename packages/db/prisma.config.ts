import os from "node:os";
import path from "node:path";
import { defineConfig } from "prisma/config";

/* Prisma 7 CLI 配置：数据库路径与运行时同一套逻辑（TASSELLO_DATA_DIR，默认 ~/.local/share/tassello） */
const dataDir =
  process.env.TASSELLO_DATA_DIR ?? path.join(os.homedir(), ".local", "share", "tassello");
process.env.DATABASE_URL = "file:" + path.join(dataDir, "tassello.db");

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
