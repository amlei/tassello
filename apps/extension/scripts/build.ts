import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const dist = path.join(root, "dist");
await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

await Bun.build({
  entrypoints: [path.join(root, "src/background.ts"), path.join(root, "src/popup.ts")],
  outdir: dist,
  target: "browser",
  format: "esm",
  sourcemap: "none",
});

await Promise.all([
  fs.copyFile(path.join(root, "src/manifest.json"), path.join(dist, "manifest.json")),
  fs.copyFile(path.join(root, "src/popup.html"), path.join(dist, "popup.html")),
  fs.copyFile(path.join(root, "src/popup.css"), path.join(dist, "popup.css")),
  fs.copyFile(path.join(root, "README.md"), path.join(dist, "README.md")),
  fs.cp(path.join(root, "src/icons"), path.join(dist, "icons"), { recursive: true }),
]);

console.log(`[tassello/extension] built ${dist}`);
