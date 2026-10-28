import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NATIVE_HOST_NAME } from "@tassello/shared";

export function nativeHostBinaryName(): string {
  return process.platform === "win32" ? "onda-native-host.exe" : "onda-native-host";
}

function manifestDirectories(): string[] {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return [
      path.join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts"),
      path.join(home, "Library", "Application Support", "Microsoft Edge", "NativeMessagingHosts"),
      path.join(home, "Library", "Application Support", "Chromium", "NativeMessagingHosts"),
    ];
  }
  if (process.platform === "win32") return [];
  return [
    path.join(home, ".config", "google-chrome", "NativeMessagingHosts"),
    path.join(home, ".config", "microsoft-edge", "NativeMessagingHosts"),
    path.join(home, ".config", "chromium", "NativeMessagingHosts"),
  ];
}

function windowsManifestPath(): string {
  return path.join(
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
    "Onda",
    "native-messaging",
    `${NATIVE_HOST_NAME}.json`,
  );
}

function registerWindows(manifestPath: string): string[] {
  const keys = [
    `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
    `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
  ];
  for (const key of keys) {
    const result = spawnSync("reg.exe", ["add", key, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    if (result.status !== 0) throw new Error(`无法注册 Native Messaging Host：${key}`);
  }
  return keys;
}

/** 为 Chrome、Edge 和 Chromium 注册同一个本机 Native Messaging Host。 */
export async function registerNativeMessagingHosts(input: {
  binaryPath: string;
  extensionIds: string[];
}): Promise<string[]> {
  const binaryPath = path.resolve(input.binaryPath);
  await fs.access(binaryPath);
  if (process.platform !== "win32") await fs.chmod(binaryPath, 0o755);
  const allowedOrigins = [...new Set(input.extensionIds
    .filter((id) => /^[a-p]{32}$/.test(id))
    .map((id) => `chrome-extension://${id}/`))];
  if (allowedOrigins.length === 0) throw new Error("没有可注册的扩展 ID");
  const manifest = {
    name: NATIVE_HOST_NAME,
    description: "九漾 Onda 本机连接组件",
    path: binaryPath,
    type: "stdio",
    allowed_origins: allowedOrigins,
  };
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  if (process.platform === "win32") {
    const file = windowsManifestPath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body, "utf8");
    return registerWindows(file);
  }
  const outputs: string[] = [];
  for (const dir of manifestDirectories()) {
    const file = path.join(dir, `${NATIVE_HOST_NAME}.json`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, body, "utf8");
    outputs.push(file);
  }
  return outputs;
}
