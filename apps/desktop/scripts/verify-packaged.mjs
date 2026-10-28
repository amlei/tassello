/* 对 electron-builder 产物做实跑自检：独立 API 二进制能启动、文件状态库
 * 能在全新数据目录建立、Next standalone 能通过 rewrite 访问 API。
 *
 * 用法: bun scripts/verify-packaged.mjs --root ../../release [--target mac-arm64|win-unpacked]
 * 同平台产物做完整握手；跨平台产物只检查二进制和 Web 资源结构。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const argValue = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopDir, "..", "..");
const rootDir = path.resolve(repoRoot, argValue("--root") ?? "release");
const target = argValue("--target");
const candidates = target
  ? [target]
  : ["win-unpacked", path.join("mac-arm64", "Tassello.app"), path.join("mac-arm64", "Tasselo.app")];

let appRoot = null;
for (const candidate of candidates) {
  const value = path.join(rootDir, candidate);
  if (existsSync(value)) {
    appRoot = value;
    break;
  }
}
if (!appRoot) fail(`在 ${rootDir} 下没找到打包产物（${candidates.join(", ")}）`);

const webDir = findWebDir(appRoot);
if (!webDir) fail(`${appRoot} 下没有 apps/web/server.js`);
const resourcesDir = findResourcesDir(appRoot);
const artifactPlatform = /win-unpacked/i.test(appRoot) || existsSync(path.join(appRoot, "Tassello.exe"))
  ? "win32"
  : "darwin";
const apiBinary = path.join(resourcesDir, "api", artifactPlatform === "win32" ? "tassello-api.exe" : "tassello-api");
const nativeHostBinary = path.join(resourcesDir, "native-host", artifactPlatform === "win32" ? "onda-native-host.exe" : "onda-native-host");
const fullCheck = artifactPlatform === process.platform;

log(`产物: ${appRoot}`);
log(`Web:  ${webDir}`);
log(`API:  ${apiBinary}`);
log(fullCheck ? "模式: 完整运行时校验" : "模式: 跨平台结构校验");

for (const required of [
  path.join(webDir, "server.js"),
  path.join(webDir, ".next", "server"),
  path.join(webDir, "node_modules", "next", "package.json"),
]) {
  if (!existsSync(required)) fail(`Web 产物缺文件: ${required}`);
}
if (!existsSync(apiBinary)) fail(`API 二进制缺文件: ${apiBinary}`);
if (!existsSync(nativeHostBinary)) fail(`Native Messaging Host 缺文件: ${nativeHostBinary}`);
if (process.platform !== "win32" && (statSync(apiBinary).mode & 0o111) === 0) {
  fail(`API 二进制没有执行权限: ${apiBinary}`);
}
if (artifactPlatform !== "win32" && (statSync(nativeHostBinary).mode & 0o111) === 0) {
  fail(`Native Messaging Host 没有执行权限: ${nativeHostBinary}`);
}

if (!fullCheck) {
  log("结构校验通过（跨平台产物需在目标系统执行完整校验）");
  process.exit(0);
}

const dataDir = mkdtempSync(path.join(os.tmpdir(), "tassello-verify-"));
const apiPort = 4400 + Math.floor(Math.random() * 250);
const webPort = 4700 + Math.floor(Math.random() * 250);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const children = [];
const output = [];

function start(command, commandArgs, cwd, env = {}) {
  const child = spawn(command, commandArgs, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.stdout.on("data", (chunk) => output.push(chunk));
  child.stderr.on("data", (chunk) => output.push(chunk));
  child.on("exit", (code) => {
    if (!finished && code !== 0) fail(`子进程提前退出（code=${code}）\n${tail()}`);
  });
  return child;
}

let finished = false;
try {
  log(`全新数据目录: ${dataDir}`);
  start(apiBinary, [], path.dirname(apiBinary), {
    TASSELLO_API_PORT: String(apiPort),
    TASSELLO_DATA_DIR: dataDir,
  });
  await expectJson(`${apiUrl}/api/v1/health`, 40_000, (json) => json.ok === true && json.data?.ready === true);
  log("API 健康检查通过");

  const nodeExecutable = findProdExecutable(webDir);
  if (!nodeExecutable) fail("找不到可复用为 Node runtime 的 Electron 二进制");
  start(nodeExecutable, [path.join(webDir, "server.js")], webDir, {
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(webPort),
    TASSELLO_API_PORT: String(apiPort),
    TASSELLO_DESKTOP: "1",
  });

  await expectJson(`${webUrl}/api/platforms`, 40_000, (json) => json.ok === true && Array.isArray(json.data));
  log("Next rewrite → Elysia API 握手通过");
  await expectHtml(`${webUrl}/library/article`, 20_000);
  log("内容库页面 SSR 通过");

  for (const relative of [
    path.join("state", "identity.json"),
    path.join("state", "accounts"),
    path.join("state", "extensions"),
    path.join("state", "tasks"),
  ]) {
    if (!existsSync(path.join(dataDir, relative))) fail(`全新数据目录缺少: ${relative}`);
  }
  log("文件状态库由产物自建通过");

  finished = true;
  log("✅ 打包产物自检通过");
} finally {
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exit(finished ? 0 : 1);
}

function findResourcesDir(root) {
  const candidates = [
    path.join(root, "resources"),
    path.join(root, "Contents", "Resources"),
    path.join(root, "Tassello.app", "Contents", "Resources"),
  ];
  try {
    for (const entry of readdirSync(root)) {
      if (entry.endsWith(".app")) candidates.push(path.join(root, entry, "Contents", "Resources"));
    }
  } catch {
    // root 本身可能是资源目录。
  }
  return candidates.find((candidate) => existsSync(path.join(candidate, "api"))) ?? candidates[0];
}

function findWebDir(root) {
  const resources = findResourcesDir(root);
  const candidates = [
    path.join(resources, "web", "apps", "web"),
    path.join(resources, "web"),
  ];
  return candidates.find((candidate) => existsSync(path.join(candidate, "server.js"))) ?? null;
}

function findProdExecutable(webDir) {
  const macOsDir = path.resolve(webDir, "..", "..", "..", "..", "..", "Contents", "MacOS");
  try {
    for (const entry of readdirSync(macOsDir)) {
      const candidate = path.join(macOsDir, entry);
      if (statSync(candidate).isFile() && (statSync(candidate).mode & 0o111) !== 0) return candidate;
    }
  } catch {
    // 非 mac 布局。
  }
  const winExe = path.resolve(webDir, "..", "..", "..", "..", "Tassello.exe");
  return existsSync(winExe) ? winExe : null;
}

function get(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.on("error", reject);
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`请求超时 ${timeoutMs}ms`)));
  });
}

async function expectJson(url, timeoutMs, validate) {
  await expect(url, timeoutMs, (status, body) => {
    if (status !== 200) return `HTTP ${status}`;
    try {
      const json = JSON.parse(body);
      return validate(json) ? null : "响应内容不符合预期";
    } catch {
      return "响应不是 JSON";
    }
  });
}

async function expectHtml(url, timeoutMs) {
  await expect(url, timeoutMs, (status, body) => {
    if (status !== 200) return `HTTP ${status}`;
    return body.includes("<html") ? null : "响应不是 HTML";
  });
}

async function expect(url, timeoutMs, validate) {
  const startedAt = Date.now();
  let lastReason = "无响应";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await get(url, 5000);
      const reason = validate(response.status, response.body);
      if (!reason) return;
      lastReason = reason;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  fail(`自检未通过: ${url}\n原因: ${lastReason}\n${tail()}`);
}

function tail() {
  return `--- 输出末尾 ---\n${Buffer.concat(output).toString("utf8").split("\n").slice(-40).join("\n")}`;
}

function log(message) {
  console.log(`[verify-packaged] ${message}`);
}

function fail(message) {
  console.error(`[verify-packaged] 失败: ${message}`);
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exit(1);
}
