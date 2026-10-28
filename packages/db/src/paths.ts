/* 数据库路径解析：TASSELLO_DATA_DIR 优先；Windows 用 %APPDATA%\tassello，
 * macOS/Linux 沿用 ~/.local/share/tassello（与 docs/architecture.md 一致）。
 * prisma.config.ts 里有同一套逻辑的镜像，改动时两处必须同步。 */
import os from "node:os";
import path from "node:path";

export function resolveDataDir(): string {
  if (process.env.TASSELLO_DATA_DIR) return process.env.TASSELLO_DATA_DIR;
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "tassello");
  }
  return path.join(os.homedir(), ".local", "share", "tassello");
}

export function resolveDbFile(): string {
  return path.join(resolveDataDir(), "tassello.db");
}

export function resolveDbUrl(): string {
  return "file:" + resolveDbFile();
}
