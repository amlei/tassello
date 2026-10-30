import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // workspace 内部包是 TS 源码直引，需要 Next 转译
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  transpilePackages: [
    "@tassello/site-ui",
    "@tassello/shared",
    "@tassello/ui",
  ],
  // /api/* 的代理在 app/api/[...path]/route.ts 用 Route Handler 实现：
  // rewrites 的目的地在构建期烘焙进 standalone，无法感知运行时 API 端口。
};

export default nextConfig;
