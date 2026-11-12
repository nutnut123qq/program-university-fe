"use client"

import useSWR from "swr"
import { useLocale, useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { collectedDay } from "@/lib/crawl-date"
import { fetchUniversities } from "../api"
import { courseDataSource } from "../courseDataSources"
import type { University } from "../types"

interface DataAttributionProps {
    /** University whose course-level data is shown; outside `COURSE_DATA_SOURCES` nothing is rendered. */
    universityCode: string | null | undefined
    /** The collection time the shown data carries (FPT syllabi: `info.lastSeenAt`); none → "not recorded". */
    collectedAt?: string | null
    /**
     * Several files on one page (v2.73, /roadmap): one labelled date each — "<what>: collected <date>" or
     * "<what>: not recorded" — instead of `collectedAt`.
     */
    dates?: { what: string; at: string | null | undefined }[]
    className?: string
}

/** "Source: <university> — <host> · Collected: <date | not recorded>" (AGENTS.md §9 attribution, v2.56). */
export function DataAttribution({ universityCode, collectedAt, dates, className }: DataAttributionProps) {
    const t = useTranslations("dataSource")
    const locale = useLocale()
    const source = courseDataSource(universityCode)
    // Same SWR key as the pages that list universities: one request, shared.
    const { data: universities } = useSWR(source ? "universities" : null, fetchUniversities)
    if (!source || !universityCode) return null

    const university =
        (universities as Array<University & { code?: string | null }> | undefined)?.find((u) => u.code === universityCode)?.name ??
        universityCode
    const dateText = (at: string | null | undefined, what?: string) => {
        const date = collectedDay(at, locale)
        if (what === undefined) return date ? t("collected", { date }) : t("collectedNotRecorded")
        return date ? t("collectedFor", { what, date }) : t("collectedForNotRecorded", { what })
    }
    return (
        <p data-testid="data-attribution" className={cn("text-[11px] leading-relaxed text-muted-foreground wrap-anywhere", className)}>
            <span data-testid="data-attribution-source">
                {source.via
                    ? t("sourceVia", { university, host: source.host, via: source.via })
                    : t("source", { university, host: source.host })}
            </span>
            {" · "}
            <span data-testid="data-attribution-date">
                {dates ? dates.map((d) => dateText(d.at, d.what)).join(" · ") : dateText(collectedAt)}
            </span>
        </p>
    )
}
