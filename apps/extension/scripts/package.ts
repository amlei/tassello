import fs from "node:fs/promises";
import path from "node:path";
import { $ } from "bun";

const root = path.resolve(import.meta.dir, "..");
const repo = path.resolve(root, "..", "..");
const release = path.join(repo, "release");
const manifest = JSON.parse(await fs.readFile(path.join(root, "src/manifest.json"), "utf8")) as { version: string };
const output = path.join(release, `onda-extension-v${manifest.version}.zip`);

await $`bun run build`.cwd(root).quiet();
await fs.mkdir(release, { recursive: true });
await fs.rm(output, { force: true });

const executable = process.platform === "win32" ? "powershell.exe" : "zip";
const args = process.platform === "win32"
  ? ["-NoProfile", "-Command", `Compress-Archive -Path '${path.join(root, "dist")}\\*' -DestinationPath '${output}' -Force`]
  : ["-qr", output, "."];
const child = Bun.spawn([executable, ...args], {
  cwd: path.join(root, "dist"),
  stdout: "inherit",
  stderr: "inherit",
});
const code = await child.exited;
if (code !== 0) throw new Error(`扩展打包失败（退出码 ${code}）`);
console.log(`[onda/extension] packaged ${output}`);
