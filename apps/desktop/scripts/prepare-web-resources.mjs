import { cp, lstat, mkdir, readdir, readFile, realpath, readlink, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.resolve(desktopDir, "../web");
const repoRoot = path.resolve(webDir, "../..");
const standaloneDir = path.join(webDir, ".next", "standalone");
const outputDir = path.join(webDir, ".next", "electron-web");

/* electron-builder 的 extraResources 拷贝会丢弃 node_modules 下的 dot 目录（Bun isolated
 * linker 的 .bun 虚拟 store 正中此坑），v0.1.0 的安装包因此缺失全部 server 运行时依赖。
 *
 * 这里在拷贝 standalone 之后做三件事：
 *  1. 从 NFT（*.nft.json）与外置包声明收集运行时需要哪些包；
 *  2. 以仓库根完整 bun store 为源，按依赖闭包 + range 匹配展平成真实目录，
 *     落到 apps/web/node_modules —— 该位置在 server 所有裸模块解析链上，
 *     且已验证能完整存活于打包产物（standalone 的 .bun 只有 trace 命中的文件，
 *     例如只 trace 到 lib-cjs 时 lib-esm 会整个缺失，不能直接拿来用）；
 *  3. 注入 mac 上装不到的 Windows 原生绑定（libsql / sharp）。 */

log(`standalone: ${standaloneDir}`);
if (!existsSync(path.join(standaloneDir, "apps", "web", "server.js"))) {
  fail("standalone 产物不存在，请先在 apps/web 执行 `bun run build`（next build, output=standalone）");
}

await rm(outputDir, { recursive: true, force: true });

/* 解引用式递归拷贝：逐条目 readlink 解析 symlink 再拷贝目标内容，不 stat 链接本身——
 * Windows 上 fs.cp({dereference:true}) 跟随 bun store 的 symlink 会 EPERM。
 * seen 集按 realpath 防循环；悬空链接跳过。 */
const seenRealpaths = new Set();
async function copyDeref(src, dest) {
  const real = await realpath(src).catch(() => null);
  if (!real) return; // 悬空链接
  if (seenRealpaths.has(real)) return;
  seenRealpaths.add(real);
  const st = await lstat(real);
  if (st.isDirectory()) {
    await mkdir(dest, { recursive: true });
    for (const e of await readdir(real)) {
      await copyDeref(path.join(real, e), path.join(dest, e));
    }
  } else if (st.isFile()) {
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, await readFile(real));
  }
}
async function copyTree(src, dest) {
  await mkdir(dest, { recursive: true });
  for (const e of await readdir(src, { withFileTypes: true })) {
    // .bun dot store 整棵跳过：展平依赖取自仓库根完整 store，追踪清单在 .next/server 下，
    // 这棵树最终也会被删除；里面的链接环与海量文件只会拖慢打包
    if (e.name === ".bun") continue;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isSymbolicLink()) {
      const target = await readlink(s).then((t) => path.resolve(path.dirname(s), t)).catch(() => null);
      if (!target) continue;
      await copyDeref(target, d);
    } else if (e.isDirectory()) {
      await copyTree(s, d);
    } else if (e.isFile()) {
      await writeFile(d, await readFile(s));
    }
  }
}
await copyTree(standaloneDir, outputDir);

await cp(
  path.join(webDir, ".next", "static"),
  path.join(outputDir, "apps", "web", ".next", "static"),
  { recursive: true, dereference: true, force: true },
);

await cp(
  path.join(webDir, "public"),
  path.join(outputDir, "apps", "web", "public"),
  { recursive: true, dereference: true, force: true },
);

const appDir = path.join(outputDir, "apps", "web");
const appNodeModules = path.join(appDir, "node_modules");
const bunStoreDir = path.join(outputDir, "node_modules", ".bun");
const repoStoreDir = path.join(repoRoot, "node_modules", ".bun");

/* ---- 第 1 步：收集运行时依赖约束（谁需要谁、什么范围） ---- */

const constraints = new Map(); // 包名 -> [{range, requirer}]

function addConstraint(name, range, requirer) {
  const list = constraints.get(name) ?? [];
  list.push({ range, requirer });
  constraints.set(name, list);
}

// 1a. NFT 追踪到的包名（Turbopack 外置的 require 都会被 trace 命中）
const manifestFiles = [];
await walk(outputDir, (file) => {
  if (file.endsWith(".nft.json")) manifestFiles.push(file);
});
if (manifestFiles.length === 0) fail("没有找到任何 *.nft.json 追踪清单");
const tracedNames = new Set();
let tracedCount = 0;
for (const manifest of manifestFiles) {
  const parsed = JSON.parse(await readFile(manifest, "utf8"));
  for (const rel of parsed.files ?? []) {
    const abs = path.resolve(path.dirname(manifest), rel);
    if (!abs.startsWith(outputDir)) continue;
    const m = abs.match(/node_modules\/\.bun\/([^/]+)\/node_modules\/(.+)$/);
    if (!m) continue;
    tracedCount++;
    const d = decodeKey(m[1]);
    if (d) tracedNames.add(d.name);
  }
}
log(`NFT 清单 ${manifestFiles.length} 份，追踪 store 文件 ${tracedCount} 个，涉及 ${tracedNames.size} 个包名`);
for (const name of tracedNames) addConstraint(name, "*", "trace");

// 1b. next 自身的 runtime deps（server.js → next 引导链不一定被 trace）
const nextPkg = JSON.parse(await readFile(path.join(appNodeModules, "next", "package.json"), "utf8"));
for (const [name, range] of Object.entries(nextPkg.dependencies ?? {})) {
  addConstraint(name, range, "next");
}

// 1c. Turbopack 外置到 .next/node_modules 的 hashed 包（如 @prisma/adapter-libsql-<hash>），
//     它们的依赖也要闭包进顶层 —— 运行时这些包的裸 import 靠向上解析找到顶层副本，
//     版本必须与它们的声明兼容（如 adapter-libsql 要求 @libsql/client ^0.17.0）
const hashedExternalDirs = [];
for (const scopeOrPkg of await readdir(path.join(appDir, ".next", "node_modules")).catch(() => [])) {
  const p = path.join(appDir, ".next", "node_modules", scopeOrPkg);
  if ((await stat(p)).isDirectory()) {
    for (const inner of await readdir(p)) {
      const q = path.join(p, inner);
      if ((await stat(q)).isDirectory() && existsSync(path.join(q, "package.json"))) {
        hashedExternalDirs.push(q);
      }
    }
    if (existsSync(path.join(p, "package.json"))) hashedExternalDirs.push(p);
  }
}
for (const dir of hashedExternalDirs) {
  const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
  const requirer = path.basename(dir);
  for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
    addConstraint(name, range, requirer);
  }
}
log(`外置 hashed 包 ${hashedExternalDirs.length} 个: ${hashedExternalDirs.map((d) => path.basename(d)).join(", ")}`);

// 1d. app 自身声明只用来「钉版本/做兜底」，不扩大集合（app 的运行时 require 已被 Turbopack 打进 chunk）
const appPkg = JSON.parse(await readFile(path.join(appDir, "package.json"), "utf8"));
for (const name of [...constraints.keys()]) {
  if (appPkg.dependencies?.[name]) addConstraint(name, appPkg.dependencies[name], "app");
}

/* ---- 第 2 步：仓库根完整 store 索引 ---- */

const storeIndex = new Map(); // 包名 -> [{key, dir, version}]（按版本降序）
for (const key of await readdir(repoStoreDir).catch(() => [])) {
  const d = decodeKey(key);
  if (!d) continue;
  const list = storeIndex.get(d.name) ?? [];
  list.push({ key, dir: path.join(repoStoreDir, key, "node_modules", d.name), version: d.version });
  storeIndex.set(d.name, list);
}
for (const list of storeIndex.values()) list.sort((a, b) => (semverGt(a.version, b.version) ? -1 : 1));

/* ---- 第 3 步：依赖闭包展平（多约束版本解析） ---- */

const skipNames = new Set(["next"]); // standalone 已自带 apps/web/node_modules/next
const materialized = new Map(); // 包名 -> version
const pending = [...constraints.entries()];

/* 本构建覆盖的平台（mac arm64 + win x64）；optionalDeps 只装这两个平台的变体 */
const wantedPlatforms = [/darwin-arm64$/, /win32-x64/];

let guard = 0;
while (pending.length > 0) {
  if (++guard > 2000) fail("依赖闭包迭代超限");
  const [name, queuedRanges] = pending.shift();
  if (materialized.has(name)) continue;

  const versions = storeIndex.get(name);
  if (!versions || versions.length === 0) {
    if (queuedRanges.some((c) => c.requirer !== "trace")) {
      log(`警告: ${name} 有依赖方但 store 里没有，跳过`);
    }
    continue;
  }

  // 选择优先级：非 app 约束全部满足 > 仅非 app 约束 > app 约束 > 最高版
  const runtimeRanges = queuedRanges.filter((c) => c.requirer !== "app" && c.range !== "*");
  const appRanges = queuedRanges.filter((c) => c.requirer === "app");
  let pick =
    versions.find((v) => runtimeRanges.every((c) => semverSatisfiesAll(v.version, c.range)) && appRanges.every((c) => semverSatisfiesAll(v.version, c.range))) ??
    versions.find((v) => runtimeRanges.every((c) => semverSatisfiesAll(v.version, c.range))) ??
    versions.find((v) => appRanges.every((c) => semverSatisfiesAll(v.version, c.range))) ??
    versions[0];
  if (pick !== versions[0] && pick.version !== versions[0].version) {
    log(`${name}: 选 ${pick.version}（约束: ${queuedRanges.map((c) => `${c.requirer}@${c.range}`).join(", ")}）`);
  }

  await mkdir(path.dirname(path.join(appNodeModules, name)), { recursive: true });
  await cp(pick.dir, path.join(appNodeModules, name), { recursive: true, dereference: true, force: true });
  materialized.set(name, pick.version);

  // 闭包：把它声明的 deps / optionalDeps 带着约束排进来
  const pkgJson = JSON.parse(await readFile(path.join(appNodeModules, name, "package.json"), "utf8"));
  const enqueue = (deps, isOptional) => {
    for (const [dep, range] of Object.entries(deps ?? {})) {
      if (materialized.has(dep) || skipNames.has(dep)) continue;
      const existing = pending.find(([n]) => n === dep);
      if (existing) {
        existing[1].push({ range, requirer: name });
        continue;
      }
      const fresh = [{ range, requirer: name }];
      // optional 平台包按目标平台过滤，避免把全平台二进制都塞进去
      if (isOptional && isPlatformOnlyPackage(dep) && !wantedPlatforms.some((re) => re.test(dep))) continue;
      pending.push([dep, fresh]);
    }
  };
  enqueue(pkgJson.dependencies, false);
  enqueue(pkgJson.optionalDependencies, true);
}
log(`依赖闭包展平 ${materialized.size} 个包: ${[...materialized.keys()].sort().join(", ")}`);

/* ---- 第 4 步：结构门禁 ---- */

for (const critical of ["@libsql/client", "libsql", "@libsql/darwin-arm64", "@swc/helpers", "async-mutex"]) {
  if (!existsSync(path.join(appNodeModules, critical))) {
    fail(`展平后缺少关键运行时依赖: ${critical}`);
  }
}
for (const name of tracedNames) {
  if (skipNames.has(name)) continue;
  if (!existsSync(path.join(appNodeModules, name))) {
    fail(`trace 中的包未落位: ${name}`);
  }
}

/* ---- 第 5 步：清掉 dot store（electron-builder 会丢它，留着只会误导） ---- */
await rm(bunStoreDir, { recursive: true, force: true });
const leftover = await readdir(path.join(outputDir, "node_modules")).catch(() => []);
if (leftover.length === 0) {
  await rm(path.join(outputDir, "node_modules"), { recursive: true, force: true });
}

/* ---- 第 6 步：注入 Windows 原生绑定（mac 交叉构建拿不到，只能显式补） ---- */
await injectWindowsNatives(appNodeModules);

/* ---- 第 7 步：产物自检 ---- */
for (const mustExist of [
  path.join(appDir, "server.js"),
  path.join(appNodeModules, "next", "package.json"),
  path.join(appNodeModules, "@libsql", "client", "package.json"),
]) {
  if (!existsSync(mustExist)) fail(`产物缺文件: ${mustExist}`);
}
log("electron-web 结构自检通过");

/* ---------------------------------------------------------------- */

async function walk(dir, onFile) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, onFile);
    else if (e.isFile()) onFile(p);
  }
}

function decodeKey(key) {
  // "@scope+name@1.2.3+hash" -> name "@scope/name"；"name@1.2.3+hash" -> "name"
  // 非 package 目录（如 bun 的 node_modules 回退目录）返回 null
  const isScoped = key.startsWith("@");
  const at = isScoped ? key.indexOf("@", 1) : key.indexOf("@");
  if (at <= 0) return null;
  const name = isScoped ? key.slice(0, at).replace("+", "/") : key.slice(0, at);
  const version = key.slice(at + 1).split("+")[0];
  if (!name || !version) return null;
  return { name, version };
}

/** 平台专属的原生绑定包（每个变体只服务一个 os/arch） */
function isPlatformOnlyPackage(name) {
  return /-(darwin|linux|win32|android|freebsd|sunos|aix)-|^@libsql\/(darwin|linux|win32)-|^@img\/(sharp|libvips)-|^@next\/swc-|^@swc\/core-|^@esbuild\//.test(name);
}

/** 只支持包管理器实际会用到的子集：exact / ^ / ~ / >= / * / || */
function semverSatisfiesAll(version, range) {
  return range.split("||").some((r) => semverSatisfies(version, r.trim()));
}

function semverSatisfies(version, range) {
  const v = version.split(".").map(Number);
  if (!range || range === "*" || range === "latest") return true;
  if (range.startsWith("^")) {
    const base = range.slice(1).split(".").map(Number);
    if (base[0] > 0) return v[0] === base[0];
    if (base[1] > 0) return v[0] === 0 && v[1] === base[1];
    return v[0] === 0 && v[1] === 0 && v[2] === base[2];
  }
  if (range.startsWith("~")) {
    const base = range.slice(1).split(".").map(Number);
    return v[0] === base[0] && v[1] === base[1];
  }
  if (range.startsWith(">=")) {
    const base = range.slice(2).split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      const d = (v[i] || 0) - (base[i] || 0);
      if (d !== 0) return d > 0;
    }
    return true;
  }
  return version === range.replace(/^[~^>=< ]+/, "");
}

function semverGt(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/**
 * mac 交叉构建 Windows 包时，bun install 只装了本机平台的原生绑定。
 * 从 npm registry 拉取对应 win32-x64 包，按宿主包版本精确对齐后注入。
 */
async function injectWindowsNatives(appNodeModules) {
  if (process.env.TASSELLO_SKIP_WIN_NATIVES === "1") {
    log("TASSELLO_SKIP_WIN_NATIVES=1，跳过 Windows 原生注入");
    return;
  }
  const plan = [
    { host: "libsql", target: "@libsql/win32-x64-msvc" },
    { host: "@img/sharp-darwin-arm64", target: "@img/sharp-win32-x64" },
    { host: "@img/sharp-libvips-darwin-arm64", target: "@img/sharp-libvips-win32-x64" },
  ];
  const cacheDir = path.join(os.tmpdir(), "tassello-pkg-cache");
  await mkdir(cacheDir, { recursive: true });

  for (const { host, target } of plan) {
    const hostDir = path.join(appNodeModules, host);
    if (!existsSync(hostDir)) {
      log(`跳过 ${target}（宿主 ${host} 不在产物中）`);
      continue;
    }
    const hostPkg = JSON.parse(await readFile(path.join(hostDir, "package.json"), "utf8"));
    const declared = hostPkg.optionalDependencies?.[target] ?? hostPkg.dependencies?.[target];
    const version = declared ?? hostPkg.version;
    const dest = path.join(appNodeModules, target);
    if (existsSync(path.join(dest, "package.json"))) {
      log(`已存在 ${target}@${version}，跳过注入`);
      continue;
    }
    await downloadNpmPackage(target, version, cacheDir, dest);
  }
}

async function downloadNpmPackage(name, version, cacheDir, dest) {
  const tgzName = `${name.split("/").pop()}-${version}.tgz`;
  const cacheFile = path.join(cacheDir, tgzName);
  await mkdir(path.dirname(dest), { recursive: true });

  if (!existsSync(cacheFile)) {
    const url = `https://registry.npmjs.org/${name}/-/${tgzName}`;
    log(`下载 ${name}@${version} ...`);
    const res = await fetch(url);
    if (!res.ok) {
      fail(`下载 ${url} 失败: HTTP ${res.status}（可用 TASSELLO_SKIP_WIN_NATIVES=1 跳过原生注入）`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(cacheFile, buf);
  }

  // tgz 内是 package/ 前缀；解到临时目录再挪位
  const tmp = await mkdir(path.join(cacheDir, `extract-${Date.now()}-${Math.random().toString(36).slice(2)}`), {
    recursive: true,
  });
  await execFileAsync("tar", ["-xzf", cacheFile, "-C", tmp]);
  const inner = path.join(tmp, "package");
  if (!existsSync(path.join(inner, "package.json"))) {
    fail(`解包 ${name}@${version} 结果异常（缺 package.json）`);
  }
  await cp(inner, dest, { recursive: true, force: true });
  await rm(tmp, { recursive: true, force: true });
  log(`注入 ${name}@${version}`);
}

function log(msg) {
  console.log(`[prepare-web] ${msg}`);
}

function fail(msg) {
  console.error(`[prepare-web] 错误: ${msg}`);
  process.exit(1);
}
