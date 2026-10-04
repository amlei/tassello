/* dev —— 一条命令拉起网页 + Electron 壳：
 *   1. spawn `bun run dev -p 4311`（apps/web，TASSELLO_DESKTOP=1）
 *   2. 轮询 /api/platforms 就绪 → 构建 desktop（如需）→ 起 Electron
 * 任一侧退出或 Ctrl+C，两侧一起收尾。纯网页模式仍可用 `bun run dev:web`。
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const WEB_DIR = path.join(ROOT, "apps", "web");
const DESKTOP_DIR = path.join(ROOT, "apps", "desktop");
const PORT = Number(process.env.TASSELLO_PORT ?? 4311);
const URL_BASE = `http://127.0.0.1:${PORT}`;

const children: ChildProcess[] = [];

function run(cmd: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}): ChildProcess {
  const { ELECTRON_RUN_AS_NODE: _ignored, ...rest } = process.env;
  const child = spawn(cmd, args, { cwd, stdio: "inherit", env: { ...rest, ...extraEnv } });
  children.push(child);
  child.on("exit", (code) => {
    console.log(`[dev] ${cmd} ${args.join(" ")} exited (${code})`);
    shutdown(code ?? 0);
  });
  return child;
}

let shuttingDown = false;
function shutdown(code: number): void {
  if (shuttingDown) process.exit(code);
  shuttingDown = true;
  for (const c of children) {
    if (c.exitCode === null && !c.killed) c.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

function waitForServer(timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${URL_BASE}/api/platforms`, (res) => {
        res.resume();
        if ((res.statusCode ?? 500) < 500) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return reject(new Error("web server not ready in time"));
      setTimeout(tick, 600);
    };
    tick();
  });
}

async function desktopBuilt(): Promise<boolean> {
  const f = Bun.file(path.join(DESKTOP_DIR, "dist", "main.js"));
  return await f.exists();
}

/** Electron 可执行文件直连：优先 dev 壳 bundle（Dock 名称/图标都来自它）。
 *  避免 bun run electron 经 node 垫片导致 app undefined */
function electronBin(): string {
  const bundle = path.join(DESKTOP_DIR, "build", "Tasselo.app", "Contents", "MacOS", "Electron");
  if (fs.existsSync(bundle)) return bundle;
  const base = path.join(DESKTOP_DIR, "node_modules", "electron", "dist");
  return process.platform === "darwin"
    ? path.join(base, "Electron.app", "Contents", "MacOS", "Electron")
    : path.join(base, process.platform === "win32" ? "electron.exe" : "electron");
}

/** 端口被占则直接报错退出：残留的旧 dev/服务会让 next 起不来，继而引发连环失败 */
function portInUse(): boolean {
  const res = spawnSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  return res.status === 0 && res.stdout.trim().length > 0;
}

if (portInUse()) {
  console.error(`[dev] 端口 ${PORT} 已被占用（可能是残留的 dev 服务）。先释放：`);
  console.error(`  lsof -ti tcp:${PORT} | xargs kill`);
  process.exit(1);
}

run("bun", ["run", "dev", "--", "-p", String(PORT)], WEB_DIR, { TASSELLO_DESKTOP: "1" });

try {
  await waitForServer();
  if (!(await desktopBuilt())) {
    console.log("[dev] building desktop shell ...");
    run("bun", ["run", "build"], DESKTOP_DIR).on("exit", (code) => {
      if (code !== 0) shutdown(code ?? 1);
    });
    // build 是同步依赖，等它结束后再起 Electron：run 已推入 children，
    // 这里用轮询等 dist/main.js 出现
    while (!(await desktopBuilt())) await new Promise((r) => setTimeout(r, 300));
  }
  // dev 壳 bundle（Dock 名称/图标）缺失时现做一份
  if (!fs.existsSync(path.join(DESKTOP_DIR, "build", "Tasselo.app"))) {
    console.log("[dev] creating Tasselo.app dev bundle ...");
    const r = spawnSync("bash", ["scripts/make-dev-bundle.sh"], { cwd: DESKTOP_DIR, stdio: "inherit" });
    if (r.status !== 0) console.warn("[dev] dev bundle 创建失败，回退裸 Electron 二进制");
  }
  run(electronBin(), ["dist/main.js"], DESKTOP_DIR);
} catch (e) {
  console.error(e);
  shutdown(1);
}
