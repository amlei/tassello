/* electron-builder afterPack 钩子：把 vendor 好的官方 prisma CLI 注入打包产物。
 *
 * 为什么不用 extraResources：app-builder 的目录拷贝对本树存在截断缺陷
 * （v0.1.2 实证：7356 个文件只拷出 6 个，符号链接清理后依旧），且静默成功。
 * 这里用 Node 自己拷贝并对文件数做硬断言，拷不完整直接打包失败——
 * 宁可出不了包也不发首启起不来的版本。dir / dmg / nsis 三种目标都生效
 * （afterPack 在 dmg/nsis 封装之前执行）。 */
const { cpSync, existsSync, readdirSync, rmSync, statSync } = require("node:fs");
const path = require("node:path");

module.exports = async function afterPack(context) {
  const isMac = context.electronPlatformName === "darwin";
  const resourcesDir = isMac
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
  const webRoot = path.join(resourcesDir, "web", "apps", "web");
  const dest = path.join(webRoot, "prisma-cli");
  const src = path.resolve(__dirname, "..", "..", "web", "prisma-cli");

  const countFiles = (dir) => {
    let n = 0;
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      for (const e of readdirSync(cur, { withFileTypes: true })) {
        if (e.isSymbolicLink()) continue; /* prepare 阶段已保证为 0，防御性跳过 */
        const p = path.join(cur, e.name);
        if (statSync(p).isDirectory()) stack.push(p);
        else n++;
      }
    }
    return n;
  };

  if (!existsSync(path.join(src, "node_modules", "prisma", "build", "index.js"))) {
    console.error(`[after-pack] 源 vendor 树不完整（先跑 prepare-prisma-cli.mjs）: ${src}`);
    process.exit(1);
  }
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true, dereference: true, force: true });

  const srcCount = countFiles(src);
  const destCount = countFiles(dest);
  if (destCount !== srcCount) {
    console.error(`[after-pack] prisma-cli 拷贝不完整: 产物 ${destCount} / 源 ${srcCount}`);
    process.exit(1);
  }
  for (const rel of [
    path.join("node_modules", "prisma", "build", "index.js"),
    path.join("node_modules", "prisma", "build", "schema_engine_bg.wasm"),
    path.join("prisma", "migrations", "0001_init", "migration.sql"),
  ]) {
    if (!existsSync(path.join(dest, rel))) {
      console.error(`[after-pack] 注入后缺关键文件: ${rel}`);
      process.exit(1);
    }
  }
  console.log(`[after-pack] prisma-cli 已注入 ${destCount} 个文件 → ${dest}`);
};
