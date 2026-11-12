import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// The API origin the browser fetches, only in an API-mode build: the client code's rules
// (src/features/programs/api.ts), read at build time. A relative base needs nothing beyond 'self'.
const apiMode =
    process.env.NODE_ENV === "production"
        ? process.env.NEXT_PUBLIC_USE_MOCK !== "true"
        : process.env.NEXT_PUBLIC_USE_MOCK === "false";
const apiOrigin = (() => {
    try {
        return apiMode ? new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:5100/api").origin : "";
    } catch {
        return "";
    }
})();

// Static policy (no nonce, so static HTML and ISR stay static): every script, style, font, image
// and fetch is same-origin (+ the API origin above). 'unsafe-inline' is required by Next's inline bootstrap scripts and by
// style attributes (framer-motion); 'unsafe-eval' only under `next dev` (React's debugging).
const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
    poweredByHeader: false,
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    { key: "Content-Security-Policy", value: contentSecurityPolicy },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                ],
            },
        ];
    },
    turbopack: {
        root: __dirname,
    },
    images: {
        unoptimized: true,
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
