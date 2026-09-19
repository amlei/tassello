/* 全仓类型检查：逐包用各自的 tsconfig 跑 tsgo（TS7 native preview） */
import { $ } from "bun";

const targets = [
  "packages/shared",
  "packages/db",
  "packages/render",
  "packages/cdp",
  "packages/platforms/core",
  "packages/platforms/wechat",
  "packages/platforms/weibo",
  "packages/server",
  "apps/web",
];

let failed = 0;
for (const dir of targets) {
  process.stdout.write(`tsgo ${dir} ... `);
  try {
    await $`bunx tsgo --noEmit -p ${dir}/tsconfig.json`.quiet();
    process.stdout.write("ok\n");
  } catch (e) {
    failed++;
    process.stdout.write("FAIL\n");
    const err = e as { stderr?: Buffer };
    console.error(err.stderr?.toString() || e);
  }
}
process.exit(failed ? 1 : 0);
