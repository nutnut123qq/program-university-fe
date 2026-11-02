import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { routing } from "@/i18n/routing"

export const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://program-university-fe.vercel.app"

/**
 * Share preview of every route (v2.60): no title or description here on purpose — Next fills og:title,
 * og:description and twitter:* from each route's own resolved title/description. Program pages add og:url.
 */
export const SITE_OPEN_GRAPH = { siteName: "Tedo", type: "website" } as const

/** canonical = this locale's URL of `path`, hreflang = every locale's + x-default = the default locale's (resolved against the root metadataBase). */
export function alternates(locale: string, path: string): Metadata["alternates"] {
    return {
        canonical: `/${locale}${path}`,
        languages: {
            ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}${path}`])),
            "x-default": `/${routing.defaultLocale}${path}`,
        },
    }
}

/** generateMetadata of a static route: its own title (messages `metadata.<key>`) + alternates. */
export const routeMetadata =
    (key: string, path: string) =>
    async ({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> => {
        const { locale } = await params
        const t = await getTranslations({ locale, namespace: "metadata" })
        return { title: t(key), alternates: alternates(locale, path) }
    }
