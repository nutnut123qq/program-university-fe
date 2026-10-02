import type { MetadataRoute } from "next"

const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://program-university-fe.vercel.app"

const LOCALES = ["vi", "en"]
const PAGES = [
    "",
    "/programs",
    "/compare",
    "/chat",
    "/roadmap",
    "/materials",
    "/analytics",
]

export default function sitemap(): MetadataRoute.Sitemap {
    return LOCALES.flatMap((locale) =>
        PAGES.map((page) => ({
            url: `${SITE_URL}/${locale}${page}`,
            lastModified: new Date(),
            changeFrequency: "weekly" as const,
            priority: page === "" ? 1 : 0.8,
        }))
    )
}
