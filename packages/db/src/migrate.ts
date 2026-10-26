/* 迁移执行（官方 CLI exec）：启动时 exec `prisma migrate deploy`，仅此而已。
 * Prisma 7 不提供运行时迁移 API，官方唯一支持路径就是打包 CLI 用 exec 跑
 * （prisma/orm discussion #8245）。水位（_prisma_migrations）、事务、失败恢复
 * 语义全在官方 CLI 里，这里没有任何自研迁移逻辑。
 *
 * CLI 来源两种布局：
 *  - 打包：apps/desktop/scripts/prepare-prisma-cli.mjs vendor 到 <server cwd>/prisma-cli/
 *  - dev：从 cwd 向上找 packages/db（bunx 跑仓库内 CLI）
 * Prisma 8 GA 且 SQLite 转正后把命令换成 `db migrate`，调用点不变。 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveDbFile } from "./paths";

let inflightByFile = new Map<string, Promise<void>>();

/** 迁移到 head。幂等：并发调用共享同一次执行（按库文件路径隔离） */
export function migrateToHead(): Promise<void> {
  const dbFile = resolveDbFile();
  let p = inflightByFile.get(dbFile);
  p ??= run();
  inflightByFile.set(dbFile, p);
  return p;
}

interface CliLayout {
  mode: "packaged" | "dev";
  /** 打包模式：vendored CLI 入口（用当前进程当 node 跑） */
  cliEntry?: string;
  /** CLI 工作目录（内含 prisma.config.ts + prisma/migrations） */
  workdir: string;
}

function resolveCliLayout(): CliLayout {
  const cwd = process.cwd();
  const vendored = path.join(cwd, "prisma-cli");
  if (fs.existsSync(path.join(vendored, "node_modules", "prisma", "build", "index.js"))) {
    return { mode: "packaged", cliEntry: path.join(vendored, "node_modules", "prisma", "build", "index.js"), workdir: vendored };
  }
  let dir = cwd;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "packages", "db");
    if (fs.existsSync(path.join(candidate, "prisma.config.ts"))) {
      return { mode: "dev", workdir: candidate };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `无法定位迁移工作目录：${vendored}（打包布局）与 packages/db（dev 布局，从 ${cwd} 向上找）都不存在。` +
      `打包产物需包含 prisma-cli/（apps/desktop/scripts/prepare-prisma-cli.mjs），dev 需在仓库内运行`,
  );
}

function execPrisma(layout: CliLayout, args: string[]): { status: number; output: string } {
  /* env 必须显式快照：Bun 的 spawnSync 不传 env 时不会带上运行时新增的变量
   * （如测试里设置的 TASSELLO_DATA_DIR），CLI 就会跑到默认数据目录去 */
  const env = { ...process.env };
  const result =
    layout.mode === "packaged"
      ? spawnSync(process.execPath, [layout.cliEntry!, ...args], {
          cwd: layout.workdir,
          encoding: "utf8",
          /* server 进程本身就是 ELECTRON_RUN_AS_NODE，显式带上保证子进程同样以 node 运行 */
          env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
        })
      : spawnSync(process.env.TASSELLO_BUN ?? "bun", ["x", "prisma", ...args], {
          cwd: layout.workdir,
          encoding: "utf8",
          env,
        });
  const output = result.error
    ? `无法启动迁移进程: ${result.error.message}` /* 如 dev 机器上没有 bun */
    : `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return { status: result.status ?? 1, output };
}

async function run(): Promise<void> {
  const layout = resolveCliLayout();
  const deploy = execPrisma(layout, ["migrate", "deploy"]);
  if (deploy.status !== 0) {
    throw new Error(`数据库迁移失败（prisma migrate deploy，${layout.mode} 布局）: ${deploy.output}`);
  }
  console.log(`[tassello/db] 数据库迁移完成（官方 CLI，${layout.mode} 布局）: ${resolveDbFile()}`);
}
