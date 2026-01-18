import { resolve } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: resolve(import.meta.dirname, "../.."),
  },
};

export default nextConfig;
