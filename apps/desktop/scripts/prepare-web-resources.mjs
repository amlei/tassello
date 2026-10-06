import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.resolve(desktopDir, "../web");
const standaloneDir = path.join(webDir, ".next", "standalone");
const outputDir = path.join(webDir, ".next", "electron-web");

await rm(outputDir, { recursive: true, force: true });

// dereference: true 会把 Bun/Next standalone 中的 workspace symlink 落成真实文件，
// 避免 Windows/NSIS 打包时读取跨目录失效 symlink。
await cp(standaloneDir, outputDir, {
  recursive: true,
  dereference: true,
  force: true,
});

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
