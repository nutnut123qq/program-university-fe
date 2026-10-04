"use client"

import { useMemo } from "react"
import { ExternalLink, School } from "lucide-react"
import { useTranslations } from "next-intl"
import { Program } from "../types"
import majorGroupsData from "@/lib/major-groups.json"

interface MajorGroupCutoff {
    year: number
    method: string | null
    methodLabel: string | null
    score: number | null
    scale: number | null
}

interface MajorGroupMember {
    programId: string
    programName: string
    code: string | null
    universityCode: string
    universityName: string
    sourceUrl: string | null
    newestCutoff: MajorGroupCutoff | null
}

interface MajorGroup {
    key: string
    label: string
    members: MajorGroupMember[]
}

/** Build artifact of scripts/build-major-groups.mjs — static, no fetch. */
const groups = (majorGroupsData as { generatedAt: string; groups: MajorGroup[] }).groups

function hostnameOf(url: string | null | undefined): string | null {
    if (!url) return null
    try {
        return new URL(url).hostname.replace(/^www\./, "")
    } catch {
        return url
    }
}

const scoreText = (score: number): string =>
    Number.isInteger(score) ? String(score) : score.toFixed(2)

interface SameMajorElsewhereProps {
    program: Program
}

/**
 * "Ngành này ở trường khác" — lists the same-major programs found at OTHER
 * universities, from the prebuilt src/lib/major-groups.json snapshot.
 * Renders nothing when the program is not in any cross-university group or
 * when every group member sits at the same university (partial-honest).
 */
export function SameMajorElsewhere({ program }: SameMajorElsewhereProps) {
    const t = useTranslations("programs")

    const others = useMemo(() => {
        const group = groups.find((g) => g.members.some((m) => m.programId === program.id))
        if (!group) return null
        const me = group.members.find((m) => m.programId === program.id)
        if (!me) return null
        return group.members.filter(
            (m) => m.programId !== program.id && m.universityCode !== me.universityCode
        )
    }, [program.id])

    if (!others || others.length === 0) return null

    return (
        <div className="space-y-3 pt-2" data-testid="same-major-elsewhere">
            <div className="flex items-center gap-2">
                <School className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">{t("sameMajorElsewhereTitle")}</h3>
                <span className="text-xs text-muted-foreground">({others.length})</span>
            </div>
            <ul className="space-y-2">
                {others.map((m) => {
                    const c = m.newestCutoff
                    const domain = hostnameOf(m.sourceUrl)
                    return (
                        <li
                            key={m.programId}
                            className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5 min-w-0"
                        >
                            <p className="text-sm font-semibold text-foreground break-words">
                                {m.programName}
                            </p>
                            <p className="text-xs text-muted-foreground break-words">
                                {m.universityName}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                {c && typeof c.score === "number" ? (
                                    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
                                        <span className="font-mono font-bold text-sm text-primary">
                                            {scoreText(c.score)}
                                        </span>
                                        {typeof c.scale === "number" && (
                                            <span className="font-mono">/ {c.scale}</span>
                                        )}
                                        <span>
                                            · {c.year}
                                            {c.method ? ` · ${c.method.toUpperCase()}` : ""}
                                        </span>
                                    </span>
                                ) : (
                                    <span className="italic">{t("sameMajorElsewhereNoData")}</span>
                                )}
                                {m.sourceUrl && domain && (
                                    <a
                                        href={m.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-0.5 text-primary hover:underline break-all"
                                    >
                                        {domain}
                                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                    </a>
                                )}
                            </div>
                            {c?.methodLabel && (
                                <p className="text-[11px] text-muted-foreground italic break-words">
                                    {c.methodLabel}
                                </p>
                            )}
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
