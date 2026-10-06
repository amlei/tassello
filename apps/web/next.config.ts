import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // workspace 内部包是 TS 源码直引，需要 Next 转译
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  transpilePackages: [
    "@tassello/site-ui",
    "@tassello/shared",
    "@tassello/db",
    "@tassello/render",
    "@tassello/cdp",
    "@tassello/platform-core",
    "@tassello/platform-wechat",
    "@tassello/platform-weibo",
    "@tassello/server",
  ],
  // 原生模块不进打包器
  serverExternalPackages: ["@libsql/client", "libsql", "@prisma/adapter-libsql", "@prisma/client"],
};

export default nextConfig;
