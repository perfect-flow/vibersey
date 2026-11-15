import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // native modules used for print-file rendering
  serverExternalPackages: ["@resvg/resvg-js", "sharp"],
  // the print renderer reads the jersey fonts from disk
  outputFileTracingIncludes: {
    "/api/stripe/webhook": ["./public/fonts/**"],
    "/api/admin/fulfill": ["./public/fonts/**"],
  },
  images: { remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }] },
};

export default nextConfig;
