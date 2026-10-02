"use client"

import { Layers } from "lucide-react"
import { useTranslations } from "next-intl"
import { Curriculum, ElectiveGroup } from "../types"

interface ElectiveGroupsProps {
    groups: ElectiveGroup[] | null | undefined
    /** Already-loaded curriculum rows, used to resolve courseCode → name. */
    courses: Curriculum[] | null | undefined
}

/**
 * Renders the "elective groups" block of a program curriculum.
 * Returns null when the source program detail carries no `electiveGroups`
 * key — the common case — so no empty header/section ever renders.
 */
export function ElectiveGroups({ groups, courses }: ElectiveGroupsProps) {
    const t = useTranslations("programs")

    if (!groups || groups.length === 0) return null

    const byCode = new Map<string, Curriculum>()
    for (const c of courses ?? []) {
        const code = (c.courseCode || "").trim()
        if (code && !byCode.has(code.toLowerCase())) {
            byCode.set(code.toLowerCase(), c)
        }
    }

    return (
        <div className="space-y-3 pt-2" data-testid="elective-groups">
            <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">{t("electiveGroups")}</h3>
            </div>
            <div className="space-y-2">
                {groups.map((g, gi) => (
                    <div
                        key={`${g.groupName}-${gi}`}
                        className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2"
                    >
                        <p className="text-sm font-semibold text-foreground">{g.groupName}</p>
                        {g.requiredCredits > 0 && (
                            <p className="text-xs text-muted-foreground">
                                {t("electiveMin", { credits: g.requiredCredits })}
                            </p>
                        )}
                        {g.courseCodes.length > 0 && (
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                                {g.courseCodes.map((code) => {
                                    const course = byCode.get(code.trim().toLowerCase())
                                    return (
                                        <li
                                            key={code}
                                            className="flex items-baseline gap-2 text-xs min-w-0"
                                        >
                                            <span className="font-mono font-bold text-foreground shrink-0">
                                                {code}
                                            </span>
                                            {course && (
                                                <span className="text-muted-foreground truncate">
                                                    {course.courseName}
                                                </span>
                                            )}
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
