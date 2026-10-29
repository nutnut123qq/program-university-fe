import type { MetadataRoute } from "next"
import programIds from "@/lib/program-ids.json"
import { snapshotGeneratedAt } from "@/lib/program-snapshot"
import { SITE_URL } from "@/lib/seo"

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const generatedAt = await snapshotGeneratedAt()
    const pages = LOCALES.flatMap((locale) =>
        PAGES.map((page) => ({
            url: `${SITE_URL}/${locale}${page}`,
            lastModified: new Date(),
            changeFrequency: "weekly" as const,
            priority: page === "" ? 1 : 0.8,
        }))
    )
    // One page per snapshot program (v2.52); it changes only with the snapshot. Same id
    // list as the proxy guard (v2.54): the sitemap never lists a URL the proxy answers 404.
    const programs = LOCALES.flatMap((locale) =>
        programIds.map((id) => ({
            url: `${SITE_URL}/${locale}/programs/${id}`,
            ...(generatedAt ? { lastModified: new Date(generatedAt) } : {}),
            changeFrequency: "weekly" as const,
            priority: 0.6,
        }))
    )
    return [...pages, ...programs]
}
