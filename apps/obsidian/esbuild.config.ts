import { build, context, type BuildOptions } from "esbuild";
import { builtinModules } from "node:module";

const watch = process.argv.includes("--watch");

const options: BuildOptions = {
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  external: [
    "obsidian",
    "electron",
    ...builtinModules,
    ...builtinModules.map((module) => `node:${module}`),
  ],
  banner: { js: 'const { Buffer } = require("buffer");\nconst process = globalThis.process ?? require("process");' },
  format: "cjs",
  target: ["es2021"],
  sourcemap: false,
  minify: false,
  treeShaking: true,
  legalComments: "none",
  logLevel: "info",
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("[tassello] watching Obsidian plugin sources...");
} else {
  await build(options);
}
