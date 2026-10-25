import os from "node:os";
import path from "node:path";
import { defineConfig } from "prisma/config";

/* Prisma 7 CLI 配置：数据库路径与运行时同一套逻辑（TASSELLO_DATA_DIR；Windows 走 %APPDATA%，
 * 其他平台 ~/.local/share/tassello）。packages/db/src/paths.ts 有同一套逻辑的镜像，改动时两处必须同步。 */
function resolveDataDir(): string {
  if (process.env.TASSELLO_DATA_DIR) return process.env.TASSELLO_DATA_DIR;
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "tassello");
  }
  return path.join(os.homedir(), ".local", "share", "tassello");
}

const dataDir = resolveDataDir();
process.env.DATABASE_URL = "file:" + path.join(dataDir, "tassello.db");

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
