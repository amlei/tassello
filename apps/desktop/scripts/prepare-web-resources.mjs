/* 把 Next standalone 产物整理成 electron-builder 可稳定携带的目录。
 *
 * Bun isolated linker 在 node_modules 中使用 .bun 虚拟目录和符号链接，而
 * electron-builder 的 extraResources 会丢弃 dot 目录。这里逐项解引用链接，
 * 让最终产物只包含真实文件和目录。Elysia API 由独立 Bun 二进制提供，不再
 * 需要把 Prisma、libsql 或数据库运行时塞进 Web 产物。
 */
import { cp, lstat, mkdir, readdir, readFile, realpath, readlink, rm, writeFile } from "node:fs/promises";
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
  if (!real || ancestors.has(real)) return;
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(real);
  const entry = await lstat(real);
  if (entry.isDirectory()) {
    await mkdir(dest, { recursive: true });
    for (const name of await readdir(real)) {
      await copyDeref(path.join(real, name), path.join(dest, name), nextAncestors);
    }
    return;
  }
  if (entry.isFile()) {
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, await readFile(real));
  }
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
 * 只沿 package.json dependencies 递归，平台可选的 sharp 二进制仍由 Next 运行时
 * 按需加载，不在构建脚本里跨平台改写。 */
async function materializePackageClosure(targetNodeModules) {
  const bunStore = path.join(standaloneDir, "node_modules", ".bun");
  let storeEntries;
  try {
    storeEntries = await readdir(bunStore);
  } catch {
    return;
  }

  const nextEntry = storeEntries.find((name) => name.startsWith("next@"));
  if (!nextEntry) fail("standalone 的 Bun store 中找不到 next");
  const nextSiblings = path.join(bunStore, nextEntry, "node_modules");
  const candidates = new Map();
  for (const entry of storeEntries) {
    const nodeModulesDir = path.join(bunStore, entry, "node_modules");
    for (const [name, dir] of await listPackages(nodeModulesDir)) {
      const list = candidates.get(name) ?? [];
      list.push(dir);
      candidates.set(name, list);
    }
  }

  const materialized = new Set(["next"]);
  const pending = [...(await listPackages(nextSiblings))]
    .filter(([name]) => name !== "next")
    .map(([name, dir]) => ({ name, preferred: dir }));

  while (pending.length > 0) {
    const item = pending.shift();
    if (!item || materialized.has(item.name)) continue;
    const source = item.preferred ?? candidates.get(item.name)?.[0];
    if (!source || !existsSync(path.join(source, "package.json"))) continue;
    materialized.add(item.name);
    await copyDeref(source, path.join(targetNodeModules, item.name));

    const pkg = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
    const sourceParent = path.dirname(source);
    for (const dependency of Object.keys(pkg.dependencies ?? {})) {
      if (materialized.has(dependency)) continue;
      const sibling = path.join(sourceParent, dependency);
      pending.push({
        name: dependency,
        preferred: existsSync(path.join(sibling, "package.json")) ? sibling : undefined,
      });
    }
  }
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
