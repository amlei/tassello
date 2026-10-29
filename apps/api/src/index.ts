import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app } from "./app";
import {
  getInstallationIdentity,
  readJsonFile,
  resolveDataDir,
  resolveRuntimeDiscoveryPath,
} from "@tassello/server";
import { CLI_PROTOCOL_VERSION } from "@tassello/shared";

const port = Number(process.env.TASSELLO_API_PORT ?? 4311);
const runtimeFile = path.join(resolveDataDir(), "runtime.json");
const discoveryFile = resolveRuntimeDiscoveryPath();
const runtimeId = randomUUID();
const apiOrigin = process.env.TASSELLO_API_ORIGIN ?? `http://127.0.0.1:${port}`;
const runtime = {
  runtimeId,
  installationId: "",
  apiOrigin,
  port,
  pid: process.pid,
  protocolVersion: 1,
  cliProtocolVersion: CLI_PROTOCOL_VERSION,
  nativeHostVersion: 1,
  startedAt: new Date().toISOString(),
};

const identity = await getInstallationIdentity();
runtime.installationId = identity.installationId;
await Promise.all([runtimeFile, discoveryFile].map(async (file) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(runtime, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}));

app.listen({ port, hostname: "127.0.0.1" });
console.log(`[tassello/api] listening on http://127.0.0.1:${port}`);

async function cleanup(): Promise<void> {
  await Promise.all([runtimeFile, discoveryFile].map(async (file) => {
    const current = await readJsonFile<{ runtimeId?: string } | null>(file, null);
    if (current?.runtimeId === runtimeId) await fs.rm(file, { force: true }).catch(() => {});
  }));
}
process.once("SIGINT", () => void cleanup().finally(() => process.exit(130)));
process.once("SIGTERM", () => void cleanup().finally(() => process.exit(143)));
