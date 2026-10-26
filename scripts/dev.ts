/* dev —— 同时启动 Elysia API 与 Next.js；可选再拉起 Electron。 */
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { $ } from "bun";
import { configuredExtensionIds } from "../packages/shared/src";
import { nativeHostBinaryName, registerNativeMessagingHosts } from "../apps/native-host/src/register";

const ROOT = path.resolve(import.meta.dir, "..");
const API_DIR = path.join(ROOT, "apps", "api");
const WEB_DIR = path.join(ROOT, "apps", "web");
const DESKTOP_DIR = path.join(ROOT, "apps", "desktop");
const NATIVE_HOST_DIR = path.join(ROOT, "apps", "native-host");
const API_PORT = Number(process.env.TASSELLO_API_PORT ?? 4311);
const WEB_PORT = Number(process.env.TASSELLO_WEB_PORT ?? 3000);
const WITH_DESKTOP = process.argv.includes("--desktop") || process.env.TASSELLO_DESKTOP === "1";
const children: ChildProcess[] = [];

function run(cmd: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}): ChildProcess {
  const { ELECTRON_RUN_AS_NODE: _ignored, ...rest } = process.env;
  const child = spawn(cmd, args, { cwd, stdio: "inherit", env: { ...rest, ...extraEnv } });
  children.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) shutdown(code);
  });
  return child;
}

let shuttingDown = false;
function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

async function waitFor(url: string, timeoutMs = 90_000): Promise<void> {
  const startedAt = Date.now();
  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if ((response.statusCode ?? 500) < 500) return resolve();
        retry();
      });
      request.on("error", retry);
      request.setTimeout(2000, () => {
        request.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) return reject(new Error(`${url} 未在 ${timeoutMs / 1000}s 内就绪`));
      setTimeout(tick, 500);
    };
    tick();
  });
}

await $`bun run build`.cwd(NATIVE_HOST_DIR).quiet();
await registerNativeMessagingHosts({
  binaryPath: path.join(NATIVE_HOST_DIR, "dist", nativeHostBinaryName()),
  extensionIds: configuredExtensionIds(process.env),
});

run(process.env.TASSELLO_BUN ?? "bun", ["run", "src/index.ts"], API_DIR, {
  TASSELLO_API_PORT: String(API_PORT),
  TASSELLO_DATA_DIR: process.env.TASSELLO_DATA_DIR ?? path.join(ROOT, ".onda"),
});
await waitFor(`http://127.0.0.1:${API_PORT}/api/v1/health`);

run(process.env.TASSELLO_BUN ?? "bun", ["run", "dev", "--", "-p", String(WEB_PORT)], WEB_DIR, {
  TASSELLO_API_PORT: String(API_PORT),
});
await waitFor(`http://127.0.0.1:${WEB_PORT}/library/article`);

if (WITH_DESKTOP) {
  run(process.env.TASSELLO_BUN ?? "bun", ["run", "build"], DESKTOP_DIR);
  run("electron", ["dist/main.js"], DESKTOP_DIR, {
    TASSELLO_WEB_URL: `http://localhost:${WEB_PORT}/library/article`,
  });
}

console.log(`[dev] API http://127.0.0.1:${API_PORT}`);
console.log(`[dev] Web http://localhost:${WEB_PORT}/library/article`);
