"use client"

import useSWR from "swr"
import { useLocale, useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { fetchUniversities } from "../api"
import { courseDataSource } from "../courseDataSources"
import type { University } from "../types"

/** The date part of an ISO timestamp as written (no time-zone shift): vi `DD/MM/YYYY`, otherwise `YYYY-MM-DD`; null when absent. */
function sourceDay(value: string | null | undefined, locale: string): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "")
    if (!m) return null
    return locale === "vi" ? `${m[3]}/${m[2]}/${m[1]}` : `${m[1]}-${m[2]}-${m[3]}`
}

interface DataAttributionProps {
    /** University whose course-level data is shown; outside `COURSE_DATA_SOURCES` nothing is rendered. */
    universityCode: string | null | undefined
    /** The collection time the shown data carries (FPT syllabi: `info.lastSeenAt`); none → "not recorded". */
    collectedAt?: string | null
    className?: string
}

/** "Source: <university> — <host> · Collected: <date | not recorded>" (AGENTS.md §9 attribution, v2.56). */
export function DataAttribution({ universityCode, collectedAt, className }: DataAttributionProps) {
    const t = useTranslations("dataSource")
    const locale = useLocale()
    const source = courseDataSource(universityCode)
    // Same SWR key as the pages that list universities: one request, shared.
    const { data: universities } = useSWR(source ? "universities" : null, fetchUniversities)
    if (!source || !universityCode) return null

    const university =
        (universities as Array<University & { code?: string | null }> | undefined)?.find((u) => u.code === universityCode)?.name ??
        universityCode
    const day = sourceDay(collectedAt, locale)
    return (
        <p data-testid="data-attribution" className={cn("text-[11px] leading-relaxed text-muted-foreground wrap-anywhere", className)}>
            <span data-testid="data-attribution-source">
                {source.via
                    ? t("sourceVia", { university, host: source.host, via: source.via })
                    : t("source", { university, host: source.host })}
            </span>
            {" · "}
            <span data-testid="data-attribution-date">{day ? t("collected", { date: day }) : t("collectedNotRecorded")}</span>
        </p>
    )
}
