import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type RuntimeDescriptor = {
  runtimeId: string;
  installationId: string;
  apiOrigin: string;
  protocolVersion: number;
  nativeHostVersion: number;
};

function discoveryFile(): string {
  return path.resolve(
    process.env.TASSELLO_RUNTIME_FILE ??
    path.join(os.homedir(), ".onda", "runtime.json"),
  );
}

function loopbackOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1");
  } catch {
    return false;
  }
}

async function discover(): Promise<Record<string, unknown>> {
  try {
    const runtime = JSON.parse(await fs.readFile(discoveryFile(), "utf8")) as RuntimeDescriptor;
    if (!runtime.runtimeId || !runtime.installationId || !loopbackOrigin(runtime.apiOrigin)) {
      return { ok: false, error: "本机运行信息无效" };
    }
    return { ok: true, ...runtime };
  } catch {
    return { ok: false, error: "本机 Onda 未运行" };
  }
}

function writeMessage(value: unknown): void {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(payload.byteLength, 0);
  process.stdout.write(Buffer.concat([header, payload]));
}

async function handleMessage(raw: Buffer): Promise<void> {
  try {
    const message = JSON.parse(raw.toString("utf8")) as { type?: unknown };
    if (message.type !== "discover") {
      writeMessage({ ok: false, error: "不支持的 Native Messaging 请求" });
      return;
    }
    writeMessage(await discover());
  } catch {
    writeMessage({ ok: false, error: "Native Messaging 请求无效" });
  }
}

let pending = Buffer.alloc(0);
for await (const chunk of process.stdin) {
  pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
  while (pending.byteLength >= 4) {
    const size = pending.readUInt32LE(0);
    if (size <= 0 || size > 1024 * 1024) process.exit(1);
    if (pending.byteLength < size + 4) break;
    const message = pending.subarray(4, size + 4);
    pending = pending.subarray(size + 4);
    await handleMessage(message);
  }
}
