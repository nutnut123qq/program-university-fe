import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isStaticExport = process.env.STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
    output: isStaticExport ? "export" : "standalone",
    distDir: isStaticExport ? "dist" : ".next",
    turbopack: {
        root: __dirname,
    },
    images: {
        unoptimized: isStaticExport,
        remotePatterns: [
            {
                protocol: "https",
                hostname: "images.unsplash.com",
            },
            {
                protocol: "https",
                hostname: "api.dicebear.com",
            },
            {
                protocol: "https",
                hostname: "picsum.photos",
            },
        ],
    },
};

export default withNextIntl(nextConfig);
