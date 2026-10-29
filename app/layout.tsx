import type { Metadata } from "next"
import { Figtree, Geist } from "next/font/google"
import { getTranslations } from "next-intl/server"
import "./globals.css"
import React, { PropsWithChildren } from "react"
import { cn } from "@/lib/utils"
import { routing } from "@/i18n/routing"
import { SITE_URL } from "@/lib/seo"
import { LocaleHtml } from "./LocaleHtml"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const figtree = Figtree({
    subsets: ["latin"],
    variable: "--font-figtree",
})

export async function generateMetadata(): Promise<Metadata> {
    // Explicit locale, no request headers: an on-demand static render (a program
    // page's 404) must not turn dynamic. [locale]/layout sets the locale's own.
    const t = await getTranslations({ locale: routing.defaultLocale, namespace: "metadata" })
    return {
        metadataBase: new URL(SITE_URL),
        title: t("title"),
        description: t("description"),
    }
}

const Layout = ({ children }: PropsWithChildren) => {
    return (
        <LocaleHtml suppressHydrationWarning className={cn("font-sans", geist.variable)}>
            <body className={`${figtree.className} antialiased`}>
                {children}
            </body>
        </LocaleHtml>
    )
}

export default Layout
