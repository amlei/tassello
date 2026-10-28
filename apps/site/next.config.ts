import type { NextConfig } from "next";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "../..");

const basePath = "/tassello";

const nextConfig: NextConfig = {
  output: "export",
  agentRules: false,
  experimental: { externalDir: true },
  outputFileTracingRoot: projectRoot,
  basePath,
  assetPrefix: `${basePath}/`,
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: [
    "@tassello/site-ui","@tassello/ui"],
};

export default nextConfig;
