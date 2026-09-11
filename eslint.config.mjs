import { createRequire } from "node:module";
import Module from "node:module";
import { defineConfig, globalIgnores } from "eslint/config";

// 本项目使用 TypeScript 7（tsc / next build），而 typescript-eslint 尚不支持 TS 7。
// 按官方建议并行运行（side-by-side）：devDependencies 中以别名 typescript6 安装
// TS 6，这里把 ESLint 进程内对 "typescript" 的 require 重定向到 TS 6 的 API。
const require = createRequire(import.meta.url);
const ts6Entry = require.resolve("typescript6");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "typescript") return ts6Entry;
  return resolveFilename.call(this, request, ...rest);
};

const nextVitals = require("eslint-config-next/core-web-vitals");
const nextTs = require("eslint-config-next/typescript");

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // shadcn / AI Elements 注册表安装的组件源码，属于生成代码，
    // 不纳入本项目的 lint 范围（升级重装时会被覆盖）。
    "components/ui/**",
    "components/ai-elements/**",
  ]),
]);

export default eslintConfig;
