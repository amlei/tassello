/* FileSecretBox —— 机密存 dataDir/secrets.json（chmod 600）。
   接口与 Electron safeStorage 版本一致，桌面模式后续可无缝换实现。 */
import fs from "node:fs";
import path from "node:path";
import { resolveDataDir } from "@tassello/db";
import type { SecretBox } from "@tassello/platform-core";

const FILE = "secrets.json";

function file(): string {
  return path.join(resolveDataDir(), FILE);
}

function read(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(file(), "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

export const fileSecretBox: SecretBox = {
  async get(ref) {
    return read()[ref] ?? null;
  },
  async set(ref, plain) {
    const data = read();
    data[ref] = plain;
    const f = file();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(data, null, 2), { mode: 0o600 });
  },
};
