import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { routing } from "@/i18n/routing"
import { alternates } from "@/lib/seo"
import { InnerLayout } from "../InnerLayout"

export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }))
}

// The home page (`/<locale>`) keeps the default title; every child route sets its own title and alternates.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params
    const t = await getTranslations({ locale, namespace: "metadata" })
    return {
        title: { default: t("title"), template: "%s · Tedo" },
        description: t("description"),
        alternates: alternates(locale, ""),
    }
}

export default async function LocaleLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ locale: string }>
}) {
    const { locale } = await params

    if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
        notFound()
    }

    setRequestLocale(locale)
    const messages = await getMessages({ locale })

    return (
        <NextIntlClientProvider messages={messages}>
            <InnerLayout>
                {children}
            </InnerLayout>
        </NextIntlClientProvider>
    )
}
