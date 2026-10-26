/* 打包链一环：把官方 prisma CLI + 迁移文件 + schema + prisma.config.ts vendor 到
 * apps/web/prisma-cli/，由 electron-builder extraResources 拷进产物
 * （resources/web/apps/web/prisma-cli）。src/migrate.ts 在 server 进程 cwd 下定位它，
 * 启动时 exec `migrate deploy`（Prisma 7 官方唯一支持的运行时迁移路径）。
 *
 * 为什么 vendor 而不是复用 devDeps：打包产物不带仓库 node_modules。
 * 全量 vendor ≈ 251MB，其中 Studio UI / prisma dev / 非 SQLite 方言占大头——
 * 这里按清单裁剪，每轮裁剪的合法性由紧随其后的「真实 migrate deploy 冒烟」背书：
 * 冒烟不过 → 打包失败，宁可出不了包也不发一个首启起不来的版本（v0.1.1 教训）。
 * prisma 升级后若裁剪清单过期，会在这一步立刻暴露，修清单即可。
 * CLI 版本取自 packages/db 实际安装版本（单一事实来源），避免两处漂移。 */
import { execSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopDir, "..", "..");
const packagesDb = path.join(repoRoot, "packages", "db");
const target = path.join(repoRoot, "apps", "web", "prisma-cli");

/* 裁剪清单：只保留 migrate deploy / resolve 所需（sqlite 方言）。
 * effect + fast-check 是 CLI 启动链上的硬依赖（effect 的 CJS 入口静态 require fast-check），不能删。
 * 冒烟兜底：清单过时 → deploy 冒烟失败 → 打包终止。 */
const TRIM_DIRS = [
  "node_modules/@prisma/query-plan-executor",
  "node_modules/@prisma/streams-local",
  "node_modules/@electric-sql",
  "node_modules/react-dom",
  "node_modules/react",
  "node_modules/@visx",
  "node_modules/elkjs",
  "node_modules/csstype",
  "node_modules/ajv",
  "node_modules/@types",
];
const TRIM_WASM = (name) =>
  /^node_modules\/prisma\/build\/.+\.wasm$/.test(name) && !/schema_engine_bg|prisma_schema_build_bg|query_compiler_small_bg\.sqlite/.test(name);

function log(msg) {
  console.log(`[prepare-prisma-cli] ${msg}`);
}

function fail(msg) {
  console.error(`[prepare-prisma-cli] 失败: ${msg}`);
  process.exit(1);
}

function dirSize(dir) {
  let total = 0;
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
      let s;
      try {
        s = statSync(p);
      } catch {
        continue; /* 悬空符号链接（指向已裁剪的包） */
      }
      if (s.isDirectory()) stack.push(p);
      else total += s.size;
    }
  }
  return total;
}

/* 1. 版本取实际安装值，杜绝 package.json 区间与产物不一致 */
const installedPkg = path.join(packagesDb, "node_modules", "prisma", "package.json");
if (!existsSync(installedPkg)) fail("packages/db 未安装 prisma，先跑 bun install + db:generate");
const version = JSON.parse(readFileSync(installedPkg, "utf8")).version;
log(`vendor prisma CLI v${version}`);

/* 2. 干净重建 + 声明依赖 */
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
writeFileSync(
  path.join(target, "package.json"),
  JSON.stringify({ name: "tassello-prisma-cli-vendored", private: true, dependencies: { prisma: version } }, null, 2) + "\n",
);
execSync("bun install --production", { cwd: target, stdio: "inherit", env: process.env });

/* 3. 迁移文件 + schema + prisma 配置（其 import "prisma/config" 解析到 vendored tree 内的 CLI） */
cpSync(path.join(packagesDb, "prisma", "migrations"), path.join(target, "prisma", "migrations"), { recursive: true });
cpSync(path.join(packagesDb, "prisma", "schema.prisma"), path.join(target, "prisma", "schema.prisma"));
cpSync(path.join(packagesDb, "prisma.config.ts"), path.join(target, "prisma.config.ts"));

/* 4. 裁剪 */
for (const rel of TRIM_DIRS) {
  rmSync(path.join(target, rel), { recursive: true, force: true });
}
const buildDir = path.join(target, "node_modules", "prisma", "build");
for (const f of readdirSync(buildDir)) {
  if (TRIM_WASM(`node_modules/prisma/build/${f}`)) rmSync(path.join(buildDir, f));
}
/* .bin 启动器是符号链接，部分指向被裁剪的包（悬空）——electron-builder 的
 * extraResources 拷贝会因此半途中断（v0.1.2 出包自检实证：7356 个文件只拷出 6 个），
 * 运行时也从不经 .bin 调 CLI，整目录删除；随后断言全树无符号链接 */
rmSync(path.join(target, "node_modules", ".bin"), { recursive: true, force: true });
const symlinkCount = (() => {
  let n = 0;
  const stack = [target];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of readdirSync(cur, { withFileTypes: true })) {
      if (e.isSymbolicLink()) n++;
      else if (e.isDirectory()) stack.push(path.join(cur, e.name));
    }
  }
  return n;
})();
if (symlinkCount > 0) fail(`vendor 树残留 ${symlinkCount} 个符号链接，会让产物拷贝截断`);
log(`裁剪完成: ${(dirSize(target) / 1024 / 1024).toFixed(0)}MB（全量约 251MB）`);

/* 5. 自检：入口与 schema engine WASM 在位；CLI 用真实 migrate deploy 冒烟 */
const cliEntry = path.join(target, "node_modules", "prisma", "build", "index.js");
const engineWasm = path.join(target, "node_modules", "prisma", "build", "schema_engine_bg.wasm");
for (const f of [cliEntry, engineWasm]) {
  if (!existsSync(f)) fail(`vendored 产物缺文件: ${f}`);
}
/* 运行时是 ELECTRON_RUN_AS_NODE（= 纯 node 语义），优先用 node 冒烟，退化为当前 runtime。
 * 冒烟跑的是产品真实路径：读 config → 加载 WASM schema engine → 应用迁移目录。 */
const smokeDir = path.join(target, ".smoke-tmp");
mkdirSync(smokeDir, { recursive: true });
let smoke = spawnSync("node", [cliEntry, "migrate", "deploy"], {
  cwd: target,
  encoding: "utf8",
  env: { ...process.env, TASSELLO_DATA_DIR: smokeDir },
});
if (smoke.status !== 0) {
  smoke = spawnSync(process.execPath, [cliEntry, "migrate", "deploy"], {
    cwd: target,
    encoding: "utf8",
    env: { ...process.env, TASSELLO_DATA_DIR: smokeDir },
  });
}
rmSync(smokeDir, { recursive: true, force: true });
if (smoke.status !== 0) {
  fail(`migrate deploy 冒烟失败（裁剪清单或 vendor 树有问题）:\n${`${smoke.stdout ?? ""}${smoke.stderr ?? ""}`.slice(-1200)}`);
}
log("migrate deploy 冒烟通过（config + WASM 引擎 + 迁移目录全链路）");
log(`✅ 完成: ${target}`);
