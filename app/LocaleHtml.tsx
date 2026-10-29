"use client"

import { useSelectedLayoutSegment } from "next/navigation"
import type { ComponentProps } from "react"
import { routing } from "@/i18n/routing"

// <html lang> from the [locale] segment below the root layout (v2.54): router context,
// no request API, so /vi stays static. _not-found and / fall back to the default locale.
export function LocaleHtml(props: ComponentProps<"html">) {
    const segment = useSelectedLayoutSegment()
    return <html {...props} lang={routing.locales.find((l) => l === segment) ?? routing.defaultLocale} />
}
