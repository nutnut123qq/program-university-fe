"use client"

import { Fragment, type ReactNode } from "react"
import { motion } from "framer-motion"
import { GraduationCap, Building2, BookOpen, ExternalLink, Clock, Award, Eye } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import { WishlistButton } from "@/features/wishlist/WishlistButton"
import { Program } from "../types"

/**
 * Optional score-filter hint (v1.3). Rendered only on score-filtered
 * result cards — normal catalog browsing never passes it. Each fragment
 * is hidden when its underlying value is null; nothing is invented.
 */
export interface ScoreHint {
    cutoff: number | null
    year: number | null
    scale: number | null
    /**
     * Admission method of the qualifying row (v1.4): `method` = raw code,
     * `methodLabel` = display label (falls back to the raw code). Both
     * come straight from the data; null => the label fragment is omitted.
     */
    method: string | null
    methodLabel: string | null
    delta: number | null
    deltaFromYear: number | null
    deltaToYear: number | null
    quota: number | null
    quotaYear: number | null
}

interface ProgramCardProps {
    program: Program
    index: number
    onViewDetail?: (program: Program) => void
    scoreHint?: ScoreHint
}

function extractCohorts(code?: string | null, name?: string | null): string[] {
    const text = `${code || ""} ${name || ""}`
    const matches = text.match(/\bK\d{2}[A-D]?\b/gi)
    if (!matches) return []
    return Array.from(new Set(matches.map((m) => m.toUpperCase())))
}

function extractSpecialization(name?: string | null): string | null {
    if (!name) return null
    const m = name.match(/chuy[êe]n\s+ng[àa]nh\s+([^(_,\n]+)/i)
    if (m) return m[1].trim()
    return null
}

export function ProgramCard({ program, index, onViewDetail, scoreHint }: ProgramCardProps) {
    const t = useTranslations("programs")
    const cohorts = extractCohorts(program.code, program.name)
    const specialization = extractSpecialization(program.name)

    // Score-filter hint line: cutoff at the selected scale + trend delta +
    // newest quota. Fragments are joined by "·" and each is omitted when
    // its data is missing (delta null = no badge, quota null = omitted).
    const hintParts: ReactNode[] = []
    if (scoreHint) {
        if (scoreHint.cutoff != null && scoreHint.year != null && scoreHint.scale != null) {
            hintParts.push(
                t("scoreHintCutoff", {
                    year: scoreHint.year,
                    cutoff: scoreHint.cutoff,
                    scale: scoreHint.scale,
                })
            )
        }
        // Method of the row that qualified the program — required so a
        // method=all filter never shows a cutoff from an unnamed/wrong
        // method (v1.4). Omitted when the data has no label at all.
        if (scoreHint.methodLabel) {
            hintParts.push(
                <span
                    data-testid="score-hint-method"
                    data-method={scoreHint.method ?? undefined}
                >
                    {scoreHint.methodLabel}
                </span>
            )
        }
        if (scoreHint.delta != null && scoreHint.deltaFromYear != null) {
            const delta = scoreHint.delta
            const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→"
            const tone =
                delta > 0
                    ? "font-semibold text-emerald-600 dark:text-emerald-400"
                    : delta < 0
                      ? "font-semibold text-red-600 dark:text-red-400"
                      : "font-semibold text-muted-foreground"
            hintParts.push(
                <span className={tone}>
                    {arrow}{" "}
                    {t("scoreHintDelta", {
                        delta,
                        fromYear: scoreHint.deltaFromYear,
                    })}
                </span>
            )
        }
        if (scoreHint.quota != null && scoreHint.quotaYear != null) {
            hintParts.push(
                t("scoreHintQuota", {
                    year: scoreHint.quotaYear,
                    quota: scoreHint.quota,
                })
            )
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
            className="h-full min-w-0"
        >
            <Card data-testid="program-card" className="group h-full flex flex-col justify-between overflow-hidden border border-border bg-card/80 hover:bg-card hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1 rounded-2xl">
                <div>
                    <CardHeader className="p-5 pb-3 min-w-0">
                        <div className="flex items-start justify-between gap-2.5 min-w-0">
                            <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {program.code && (
                                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-muted text-foreground border border-border/50">
                                            {program.code}
                                        </span>
                                    )}
                                    {cohorts.slice(0, 2).map((c) => (
                                        <Badge key={c} className="font-mono text-[10px] font-bold px-1.5 py-0 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                                            {t("cohortBadge", { id: c })}
                                        </Badge>
                                    ))}
                                    {cohorts.length > 2 && (
                                        <span className="font-mono text-[10px] text-muted-foreground font-semibold">
                                            +{cohorts.length - 2}
                                        </span>
                                    )}
                                    {specialization && (
                                        <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md truncate max-w-[140px]">
                                            {specialization}
                                        </span>
                                    )}
                                </div>
                                <h3 className="font-extrabold text-base leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors pt-0.5">
                                    {program.name}
                                </h3>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
                                    <span className="truncate font-medium">{program.universityName}</span>
                                </div>
                            </div>
                            {program.degreeType && (
                                <Badge variant="secondary" className="shrink-0 text-xs font-semibold">
                                    {program.degreeType}
                                </Badge>
                            )}
                        </div>
                    </CardHeader>

                    <CardContent className="px-5 pt-0 pb-4 space-y-3.5 min-w-0">
                        {program.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed wrap-anywhere">
                                {program.description}
                            </p>
                        )}

                        <div className="flex flex-wrap gap-1.5">
                            {program.credits && (
                                <Badge variant="outline" className="flex items-center gap-1 font-semibold text-xs py-0.5 px-2 bg-muted/30">
                                    <BookOpen className="h-3 w-3 text-primary" />
                                    {t("credits", { count: program.credits })}
                                </Badge>
                            )}
                            {program.duration && (
                                <Badge variant="outline" className="flex items-center gap-1 font-normal text-xs py-0.5 px-2">
                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                    {program.duration}
                                </Badge>
                            )}
                            {program.language && (
                                <Badge variant="outline" className="flex items-center gap-1 font-normal text-xs py-0.5 px-2">
                                    <Award className="h-3 w-3 text-muted-foreground" />
                                    {program.language}
                                </Badge>
                            )}
                            {program.courseCount > 0 && (
                                <Badge variant="outline" className="flex items-center gap-1 font-semibold text-xs py-0.5 px-2 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                                    <GraduationCap className="h-3 w-3" />
                                    {t("courses", { count: program.courseCount })}
                                </Badge>
                            )}
                        </div>

                        {/* Score-filter hint (filtered results only). Inline
                            fragments wrap naturally — no overflow at 375px. */}
                        {hintParts.length > 0 && (
                            <p
                                data-testid="score-hint"
                                className="text-[11px] leading-relaxed text-muted-foreground break-words"
                            >
                                {hintParts.map((part, i) => (
                                    <Fragment key={i}>
                                        {i > 0 && " · "}
                                        {part}
                                    </Fragment>
                                ))}
                            </p>
                        )}
                    </CardContent>
                </div>

                <div className="px-5 pb-5 pt-0">
                    <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                        {onViewDetail && (
                            <button
                                onClick={() => onViewDetail(program)}
                                className={cn(
                                    buttonVariants({ variant: "default", size: "sm" }),
                                    "flex-1 h-10 sm:h-9 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm min-w-0"
                                )}
                            >
                                <Eye className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{t("viewDetail")}</span>
                            </button>
                        )}
                        {program.sourceUrl && (
                            <a
                                href={program.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                    buttonVariants({ variant: "outline", size: "sm" }),
                                    "h-10 sm:h-9 text-xs font-semibold rounded-xl flex items-center justify-center gap-1 px-3 shrink-0"
                                )}
                                title={t("sourceLinkTitle")}
                            >
                                <span className="hidden sm:inline">{t("admissionSourceLabel")}</span>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            </a>
                        )}
                        <WishlistButton programId={program.id} size="sm" />
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}

