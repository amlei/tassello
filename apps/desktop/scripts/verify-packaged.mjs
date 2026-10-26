/* 出包自检：对 electron-builder 的 *-unpacked / .app 产物实跑一次内置 web server，
 * 验证依赖展平后模块可解析、页面可渲染、（同平台时）数据库可用。
 * v0.1.0 的教训：文件拷没拷看不出来了，必须运行时验证。
 *
 * 用法: bun scripts/verify-packaged.mjs --root ../../release [--target win-unpacked|mac-arm64]
 *   宿主平台与产物平台一致 → 完整校验（页面 SSR + /api/platforms 走 DB）
 *   平台不一致（如在 mac 上验 win 包）→ 结构校验（server 能起、静态页 200、
 *     Windows 原生绑定文件在位）；DB 链路留给同平台机器（CI windows runner）跑完整校验。
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_TABLES = ["Post", "Asset", "PlatformAccount", "PlatformAssetUpload", "PublishTask", "PublishLog", "Setting"];

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

let child = null;

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopDir, "..", "..");
const rootDir = path.resolve(repoRoot, argValue("--root") ?? "release");

const target = argValue("--target");
const candidates = target
  ? [target]
  : ["win-unpacked", path.join("mac-arm64", "Tassello.app"), path.join("mac-arm64", "Tasselo.app")];

let appRoot = null;
for (const c of candidates) {
  const p = path.join(rootDir, c);
  if (existsSync(p)) {
    appRoot = p;
    break;
  }
}
if (!appRoot) fail(`在 ${rootDir} 下没找到打包产物（${candidates.join(", ")}）`);
const webDir = findWebDir(appRoot);
if (!webDir) fail(`${appRoot} 下没有 apps/web/server.js`);
log(`产物: ${appRoot}`);
log(`web:  ${webDir}`);

const artifactPlatform = /win-unpacked/.test(appRoot) || existsSync(path.join(appRoot, "Tassello.exe"))
  ? "win32"
  : "darwin";
const fullCheck = artifactPlatform === process.platform;
log(fullCheck ? "模式: 完整校验（页面 + DB）" : "模式: 结构校验（跨平台，不验 DB）");

/* 全新临时数据目录：建表必须由产物自身的启动流程完成（首启空库自愈）。
 * v0.1.1 教训：这里原先预先 prisma db push 建好表，掩盖了"真实用户首启
 * no such table: PlatformAccount → web server 起不来"的致命回归。 */
const dataDir = mkdtempSync(path.join(os.tmpdir(), "tassello-verify-"));
const dbFile = path.join(dataDir, "tassello.db");
log(`数据目录: ${dataDir}（空目录，验证产物自建 schema）`);

const port = 4400 + Math.floor(Math.random() * 400);

/* 平台标识用的 exe 存在性检查（win 产物必须含注入的原生绑定） */
if (artifactPlatform === "win32") {
  const nm = path.join(webDir, "node_modules");
  for (const required of [
    path.join(nm, "@libsql", "win32-x64-msvc"),
    path.join(nm, "libsql"),
    path.join(nm, "@swc", "helpers"),
  ]) {
    if (!existsSync(required)) fail(`win 产物缺依赖: ${required}`);
  }
  const bindingDir = path.join(nm, "@libsql", "win32-x64-msvc");
  if (!hasNativeFile(bindingDir)) fail(`${bindingDir} 下没有 .node 原生文件`);
  log("win 原生绑定在位");
}

/* vendored prisma CLI 在位（首启建表走它，缺了就是 v0.1.1 式首启回归） */
{
  const cliEntry = path.join(webDir, "prisma-cli", "node_modules", "prisma", "build", "index.js");
  const engineWasm = path.join(webDir, "prisma-cli", "node_modules", "prisma", "build", "schema_engine_bg.wasm");
  const migrationsSql = path.join(webDir, "prisma-cli", "prisma", "migrations", "0001_init", "migration.sql");
  for (const f of [cliEntry, engineWasm, migrationsSql]) {
    if (!existsSync(f)) fail(`产物缺迁移组件: ${f}`);
  }
  log("vendored prisma CLI + 迁移文件在位");
}

/* 与生产完全一致：用产物内的 Electron 二进制以 ELECTRON_RUN_AS_NODE=1 跑 server.js */
/* 与生产完全一致：用产物内的 Electron 二进制以 ELECTRON_RUN_AS_NODE=1 跑 server.js。
 * 跨平台验包（如在 mac 上验 win 产物）时宿主跑不了对方 exe：
 *   1. 优先系统 node（Next 编译产物与 Node 完全兼容，bun 反而不兼容部分 compiled CJS）；
 *   2. 没有 node 才退化为 bun，此时只验"进程存活 + 模块解析"。 */
let prodExecutable = artifactPlatform === process.platform ? findProdExecutable(webDir) : null;
let fallbackRuntime = null;
if (!prodExecutable) {
  fallbackRuntime = (await which("node")) ?? "bun";
}
const runCmd = prodExecutable ?? fallbackRuntime;
const runArgs = [path.join(webDir, "server.js")];
log(`运行时: ${runCmd}${prodExecutable ? " (ELECTRON_RUN_AS_NODE 产物内)" : "（退化运行时）"}`);

child = spawn(runCmd, runArgs, {
  cwd: webDir,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    TASSELLO_DESKTOP: "1",
    TASSELLO_DATA_DIR: dataDir,
    ...(prodExecutable ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
  },
});
const outChunks = [];
child.stdout.on("data", (d) => outChunks.push(d));
child.stderr.on("data", (d) => outChunks.push(d));
child.on("exit", (code) => {
  if (!finished) fail(`server 提前退出（code=${code}）\n${tail()}`);
});

let finished = false;
try {
  if (fullCheck) {
    await expectOk(`${url()}/api/platforms`, 40_000, (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      try {
        const json = JSON.parse(body);
        if (json.ok !== true || !Array.isArray(json.data)) return "响应不是 {ok:true,data:[..]} 握手格式";
        return null;
      } catch {
        return "响应不是 JSON";
      }
    });
    log("/api/platforms 握手通过（DB + libsql 原生绑定工作正常）");
    await assertSchemaCreated();

    await expectOk(`${url()}/library/article`, 20_000, (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      if (!body.includes("<html")) return "响应不是 HTML 页面";
      return null;
    });
    log("/library/article SSR 通过");
  } else {
    await expectOk(`${url()}/`, 40_000, (status, body) => {
      if (status !== 200) return `HTTP ${status}`;
      if (!body.includes("<html")) return "响应不是 HTML 页面";
      return null;
    });
    log("静态页渲染通过");
  }
  finished = true;
  log("✅ 打包产物自检通过");
} finally {
  child.kill();
  process.exit(finished ? 0 : 1);
}

function url() {
  return `http://127.0.0.1:${port}`;
}

function findProdExecutable(webDir) {
  // mac: <bundle>/Contents/Resources/web/apps/web → bundle 在上 5 级
  const macOsDir = path.resolve(webDir, "..", "..", "..", "..", "..", "Contents", "MacOS");
  try {
    for (const e of readdirSync(macOsDir)) {
      const p = path.join(macOsDir, e);
      if (statSync(p).isFile() && statSync(p).mode & 0o111) return p;
    }
  } catch {
    /* 非 mac 布局 */
  }
  // win: <unpacked>/resources/web/apps/web → unpacked 在上 4 级
  const winExe = path.resolve(webDir, "..", "..", "..", "..", "Tassello.exe");
  if (existsSync(winExe)) return winExe;
  return null;
}

function findWebDir(root) {
  const candidates = [
    path.join(root, "resources", "web", "apps", "web"),
    path.join(root, "Contents", "Resources", "web", "apps", "web"),
    // root 本身是平台目录（mac-arm64/win-unpacked 的上层或同级）
    path.join(root, "Tassello.app", "Contents", "Resources", "web", "apps", "web"),
  ];
  // root 下平铺的 .app bundle（如 release/mac-arm64 本身作为 root）
  try {
    for (const e of readdirSync(root)) {
      if (e.endsWith(".app")) candidates.push(path.join(root, e, "Contents", "Resources", "web", "apps", "web"));
    }
  } catch {
    /* root 不可读则跳过 */
  }
  return candidates.find((c) => existsSync(path.join(c, "server.js"))) ?? null;
}

/** v0.1.1 回归门禁：7 张业务表 + 官方迁移记录必须由产物自身首启建出（数据目录启动前是空目录）。
 * 断言在 packages/db 上下文跑探针（@libsql/client 只在那里的依赖闭包里） */
async function assertSchemaCreated() {
  if (!existsSync(dbFile)) fail(`产物首启后数据库文件不存在: ${dbFile}`);
  const packagesDbDir = path.resolve(repoRoot, "packages", "db");
  const probe = `
const { createClient } = require("@libsql/client");
(async () => {
  const c = createClient({ url: "file:" + process.env.TASSELLO_VERIFY_DB });
  const t = await c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const m = await c.execute("SELECT migration_name FROM _prisma_migrations");
  console.log(JSON.stringify({ tables: t.rows.map((r) => String(r.name)), migrations: m.rows.map((r) => String(r.migration_name)) }));
  c.close();
})().catch((e) => { console.error(String(e)); process.exit(1); });
`;
  const res = spawnSync(process.execPath, ["-e", probe], {
    cwd: packagesDbDir,
    encoding: "utf8",
    env: { ...process.env, TASSELLO_VERIFY_DB: dbFile },
  });
  if (res.status !== 0) fail(`schema 断言探针失败: ${`${res.stdout ?? ""}${res.stderr ?? ""}`.trim()}`);
  let data;
  try {
    data = JSON.parse(res.stdout);
  } catch {
    fail(`schema 断言探针输出异常: ${res.stdout.trim()}`);
  }
  const missing = EXPECTED_TABLES.filter((t) => !data.tables.includes(t));
  if (missing.length > 0) {
    fail(`产物首启未建全表，缺: ${missing.join(", ")}（现有: ${data.tables.join(", ") || "无"}）`);
  }
  if (data.migrations.length < 1) fail(`官方迁移记录为空（_prisma_migrations 无记录），说明迁移未真正执行`);
  log(`数据库 7 张表齐全，官方迁移记录: ${data.migrations.join(", ")}（由产物首启自建，非自检预建）`);
}

function hasNativeFile(dir) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e);
      if (e.endsWith(".node")) return true;
      if (statSync(p).isDirectory()) stack.push(p);
    }
  }
  return false;
}

function get(url_, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url_, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`请求超时 ${timeoutMs}ms`));
    });
  });
}

async function expectOk(url_, timeoutMs, validate) {
  const start = Date.now();
  let lastReason = "无响应";
  while (Date.now() - start < timeoutMs) {
    try {
      const { status, body } = await get(url_, 5000);
      const reason = validate(status, body);
      if (!reason) return;
      lastReason = reason;
    } catch (e) {
      lastReason = e.message;
    }
    await sleep(700);
  }
  fail(`自检未通过: ${url_}\n原因: ${lastReason}\n${tail()}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function which(bin) {
  const { execFile } = await import("node:child_process");
  try {
    await new Promise((resolve, reject) => execFile("which", [bin], (e) => (e ? reject(e) : resolve())));
    return bin;
  } catch {
    return null;
  }
}

function tail() {
  const text = Buffer.concat(outChunks).toString("utf8");
  const lines = text.split("\n");
  return `--- server 输出（末尾 40 行）---\n${lines.slice(-40).join("\n")}`;
}

function log(msg) {
  console.log(`[verify-packaged] ${msg}`);
}

function fail(msg) {
  console.error(`[verify-packaged] 失败: ${msg}`);
  if (child && child.exitCode === null) child.kill();
  process.exit(1);
}
