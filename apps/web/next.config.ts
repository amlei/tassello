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
  async rewrites() {
    const apiPort = process.env.TASSELLO_API_PORT ?? "4311";
    return [
      {
        source: "/api/:path*",
        destination: `http://127.0.0.1:${apiPort}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
