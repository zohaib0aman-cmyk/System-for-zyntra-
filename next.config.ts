import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Logo uploads are resized in the browser first; 2 MB leaves headroom.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
