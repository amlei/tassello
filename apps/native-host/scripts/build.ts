import fs from "node:fs/promises";
import path from "node:path";
import { $ } from "bun";
import { nativeHostBinaryName } from "../src/register";

const root = path.resolve(import.meta.dir, "..");
const dist = path.join(root, "dist");
const outfile = path.join(dist, nativeHostBinaryName());

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
await $`bun build --compile --minify --outfile ${outfile} ${path.join(root, "src/index.ts")}`.quiet();
console.log(`[onda/native-host] built ${outfile}`);
