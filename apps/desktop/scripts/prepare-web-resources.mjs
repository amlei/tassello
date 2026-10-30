/* 把 Next standalone 产物整理成 electron-builder 可稳定携带的目录。
 *
 * Bun isolated linker 在 node_modules 中使用 .bun 虚拟目录和符号链接，而
 * electron-builder 的 extraResources 会丢弃 dot 目录。这里逐项解引用链接，
 * 让最终产物只包含真实文件和目录。Elysia API 由独立 Bun 二进制提供，不再
 * 需要把 Prisma、libsql 或数据库运行时塞进 Web 产物。
 */
import { cp, mkdir, readdir, readFile, realpath, readlink, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.resolve(desktopDir, "../web");
const standaloneDir = path.join(webDir, ".next", "standalone");
const outputDir = path.join(webDir, ".next", "electron-web");

log(`standalone: ${standaloneDir}`);
if (!existsSync(path.join(standaloneDir, "apps", "web", "server.js"))) {
  fail("standalone 产物不存在，请先在 apps/web 执行 `bun run build`");
}

await rm(outputDir, { recursive: true, force: true });

async function copyDeref(src, dest, ancestors = new Set()) {
  const real = await realpath(src).catch(() => null);
  if (!real || ancestors.has(real)) return false;
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(real);
  /* stat 跟随符号链接与 Windows junction，避免 lstat 把链接本体判成
   * 既非目录也非文件而静默跳过 */
  const entry = await stat(real).catch(() => null);
  if (!entry) return false;
  if (entry.isDirectory()) {
    await mkdir(dest, { recursive: true });
    for (const name of await readdir(real)) {
      await copyDeref(path.join(real, name), path.join(dest, name), nextAncestors);
    }
    return true;
  }
  if (entry.isFile()) {
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, await readFile(real));
    return true;
  }
  return false;
}

async function copyTree(src, dest) {
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (entry.name === ".bun") continue;
    const source = path.join(src, entry.name);
    const target = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      const resolved = await readlink(source).then((value) => path.resolve(path.dirname(source), value)).catch(() => null);
      if (resolved) await copyDeref(resolved, target);
    } else if (entry.isDirectory()) {
      await copyTree(source, target);
    } else if (entry.isFile()) {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, await readFile(source));
    }
  }
}

await copyTree(standaloneDir, outputDir);
await cp(path.join(webDir, ".next", "static"), path.join(outputDir, "apps", "web", ".next", "static"), {
  recursive: true,
  dereference: true,
  force: true,
});
await cp(path.join(webDir, "public"), path.join(outputDir, "apps", "web", "public"), {
  recursive: true,
  dereference: true,
  force: true,
});

await rm(path.join(outputDir, "node_modules", ".bun"), { recursive: true, force: true });

const appDir = path.join(outputDir, "apps", "web");
const appNodeModules = path.join(appDir, "node_modules");
await materializePackageClosure(appNodeModules);

for (const required of [
  path.join(appDir, "server.js"),
  path.join(appDir, ".next", "server"),
  path.join(appDir, "node_modules", "next", "package.json"),
  path.join(appDir, "node_modules", "react", "package.json"),
  path.join(appDir, "node_modules", "react-dom", "package.json"),
  path.join(appDir, "node_modules", "@swc", "helpers", "package.json"),
]) {
  if (!existsSync(required)) fail(`Web 产物缺少运行时文件: ${required}`);
}

log("Web standalone 已解引用打包，运行时依赖完整");

function log(message) {
  console.log(`[prepare-web] ${message}`);
}

function fail(message) {
  console.error(`[prepare-web] 失败: ${message}`);
  process.exit(1);
}

/* Next standalone 的 Bun 依赖图把 next 与运行时依赖作为 .bun 下的同级目录。
 * 展平到 apps/web/node_modules，避免把 electron-builder 会丢弃的 .bun 带入产物。
 * 闭包来源 = next 同级依赖 + Web 应用自身 dependencies。后者必须显式物化：
 * Windows 上 Next 文件追踪在 junction 布局下会漏掉应用级符号链接（0.2.0 CI
 * 实测 react 缺失），不能只靠 copyTree 解引用 standalone 里的链接。
 * 每个名字按候选源序拷贝并在拷贝后校验产物落地，单源无效时自动回退下一个；
 * 同名多版本时优先取依赖声明版本能对上的 store 条目。 */
async function materializePackageClosure(targetNodeModules) {
  const standaloneStore = path.join(standaloneDir, "node_modules", ".bun");
  const workspaceStore = path.resolve(desktopDir, "..", "..", "node_modules", ".bun");
  const standaloneCandidates = await scanStore(standaloneStore);
  if (standaloneCandidates.size === 0) {
    fail("standalone 的 Bun store 缺失或为空，无法物化 Web 运行时依赖");
  }
  const workspaceCandidates = await scanStore(workspaceStore);
  const preferredByApp = await preferredAppLinks();

  /* store 条目目录名带版本后缀（next@16.3.5），按条目名定位 next 的同级依赖 */
  const storeEntryNames = await readdir(standaloneStore).catch(() => []);
  const nextEntry = storeEntryNames.find((name) => name.startsWith("next@"));
  if (!nextEntry) fail("standalone 的 Bun store 中找不到 next");
  const nextSiblings = path.join(standaloneStore, nextEntry, "node_modules");

  const materialized = new Set(["next"]);
  const pending = [...(await listPackages(nextSiblings))]
    .filter(([name]) => name !== "next")
    .map(([name, dir]) => ({ name, preferred: dir }));

  /* Web 应用自身依赖（react、react-dom 等）按名字入队，版本在出队时解析 */
  const webPkg = JSON.parse(await readFile(path.join(webDir, "package.json"), "utf8"));
  for (const name of Object.keys(webPkg.dependencies ?? {})) {
    if (name !== "next") pending.push({ name });
  }

  while (pending.length > 0) {
    const item = pending.shift();
    if (!item || materialized.has(item.name)) continue;
    const destination = path.join(targetNodeModules, item.name);
    /* 逐个候选源尝试拷贝，拷完校验 package.json 真的落地；
     * Windows 上 store 链接形态（junction）可能让单个源拷贝无效 */
    let copiedFrom = null;
    for (const source of resolveSources(item)) {
      if (!existsSync(path.join(source, "package.json"))) continue;
      await rm(destination, { recursive: true, force: true });
      await copyDeref(source, destination);
      if (existsSync(path.join(destination, "package.json"))) {
        copiedFrom = source;
        break;
      }
    }
    if (!copiedFrom) continue;
    materialized.add(item.name);

    const pkg = JSON.parse(await readFile(path.join(copiedFrom, "package.json"), "utf8"));
    const sourceParent = path.dirname(copiedFrom);
    for (const dependency of Object.keys(pkg.dependencies ?? {})) {
      if (materialized.has(dependency)) continue;
      const sibling = path.join(sourceParent, dependency);
      pending.push({
        name: dependency,
        preferred: existsSync(path.join(sibling, "package.json")) ? sibling : undefined,
      });
    }
  }

  log(`物化 Web 运行时依赖 ${materialized.size} 个`);

  /* 候选源按序：next 同级邻接 → 应用级链接 realpath → standalone store → 工作区 store */
  function resolveSources(item) {
    const candidates = [];
    if (item.preferred) candidates.push(item.preferred);
    const appLinked = preferredByApp.get(item.name);
    if (appLinked) candidates.push(appLinked);
    for (const pool of [standaloneCandidates, workspaceCandidates]) {
      const list = pool.get(item.name);
      if (!list?.length) continue;
      const range = webPkg.dependencies?.[item.name];
      const matched = (range && matchVersion(list, item.name, range)) || undefined;
      if (matched) candidates.push(matched);
      candidates.push(...list);
    }
    return [...new Set(candidates)];
  }
}

/* 扫描 Bun isolated store，返回 包名 → 真实目录列表（含多版本） */
async function scanStore(storePath) {
  const candidates = new Map();
  let storeEntries;
  try {
    storeEntries = await readdir(storePath);
  } catch {
    return candidates;
  }
  for (const entry of storeEntries) {
    const nodeModulesDir = path.join(storePath, entry, "node_modules");
    for (const [name, dir] of await listPackages(nodeModulesDir)) {
      const list = candidates.get(name) ?? [];
      list.push(dir);
      candidates.set(name, list);
    }
  }
  return candidates;
}

/* standalone 里 apps/web/node_modules 的链接指向应用实际解析到的版本 */
async function preferredAppLinks() {
  const preferred = new Map();
  for (const [name, dir] of await listPackages(path.join(standaloneDir, "apps", "web", "node_modules"))) {
    const real = await realpath(dir).catch(() => null);
    if (real && existsSync(path.join(real, "package.json"))) preferred.set(name, real);
  }
  return preferred;
}

/* 目录名 name@version 与 semver 区间做宽松前缀匹配（^、~ 已剥离）；
 * 路径分隔符收尾，避免 react@19.2.8 误配 react@19.2.80 */
function matchVersion(list, name, range) {
  const prefix = String(range).replace(/^[^0-9]+/, "");
  if (!prefix) return undefined;
  const marker = `${storeEntryName(name, prefix)}${path.sep}`;
  return list.find((dir) => dir.includes(marker));
}

function storeEntryName(name, version) {
  return `${name.replace("/", "+")}@${version}`;
}

async function listPackages(nodeModulesDir) {
  const packages = [];
  let entries;
  try {
    entries = await readdir(nodeModulesDir, { withFileTypes: true });
  } catch {
    return packages;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(nodeModulesDir, entry.name);
      for (const child of await readdir(scopeDir, { withFileTypes: true })) {
        if (!child.isDirectory() && !child.isSymbolicLink()) continue;
        packages.push([`${entry.name}/${child.name}`, path.join(scopeDir, child.name)]);
      }
      continue;
    }
    packages.push([entry.name, path.join(nodeModulesDir, entry.name)]);
  }
  return packages;
}
