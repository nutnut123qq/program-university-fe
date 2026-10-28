import type { MetadataRoute } from "next"
import { listProgramIds, snapshotGeneratedAt } from "@/lib/program-snapshot"
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
    const [ids, generatedAt] = await Promise.all([listProgramIds(), snapshotGeneratedAt()])
    const pages = LOCALES.flatMap((locale) =>
        PAGES.map((page) => ({
            url: `${SITE_URL}/${locale}${page}`,
            lastModified: new Date(),
            changeFrequency: "weekly" as const,
            priority: page === "" ? 1 : 0.8,
        }))
    )
    // One page per snapshot program (v2.52); it changes only with the snapshot.
    const programs = LOCALES.flatMap((locale) =>
        ids.map((id) => ({
            url: `${SITE_URL}/${locale}/programs/${id}`,
            ...(generatedAt ? { lastModified: new Date(generatedAt) } : {}),
            changeFrequency: "weekly" as const,
            priority: 0.6,
        }))
    )
    return [...pages, ...programs]
}
