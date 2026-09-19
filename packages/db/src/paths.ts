/* 数据库路径解析：TASSELLO_DATA_DIR 优先，默认 ~/.local/share/tassello（与 docs/design.md 一致） */
import os from "node:os";
import path from "node:path";

export function resolveDataDir(): string {
  return (
    process.env.TASSELLO_DATA_DIR ??
    path.join(/*turbopackIgnore: true*/ os.homedir(), ".local", "share", "tassello")
  );
}

export function resolveDbFile(): string {
  return path.join(resolveDataDir(), "tassello.db");
}

export function resolveDbUrl(): string {
  return "file:" + resolveDbFile();
}
