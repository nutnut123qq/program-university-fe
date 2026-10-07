"use client"

import React, { Suspense, useEffect, useMemo, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Scale, GraduationCap, ArrowRightLeft, CheckCircle2, AlertCircle, Share2, Check } from "lucide-react"
import { fetchPrograms, fetchProgramById, fetchCurricula } from "@/features/programs/api"
import { Program } from "@/features/programs/types"
import { AunRadarChart, AunCriterionScore } from "@/components/common/AunRadarChart"
import { CompareAdmissions } from "./CompareAdmissions"
import { useTranslations } from "next-intl"

const ProgramComparisonInner = () => {
    const t = useTranslations("programs")
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { data: programRes } = useSWR(["programs-list-all"], () => fetchPrograms({ page: 1, pageSize: 200 }))
    const programsList = useMemo(() => programRes?.items || [], [programRes])

    const aParam = searchParams.get("a")
    const bParam = searchParams.get("b")

    // Query ids may point at programs outside the first-200 browse options —
    // resolve them by direct fetch. resolved.x === null means "does not exist".
    const { data: resolved, error: queryError } = useSWR(
        aParam || bParam ? ["compare-query-ids", aParam ?? "", bParam ?? ""] : null,
        async ([, a, b]) => ({
            a: a ? await fetchProgramById(a) : undefined,
            b: b ? await fetchProgramById(b) : undefined,
        })
    )
    const querySettled = !(aParam || bParam) || resolved !== undefined || queryError !== undefined

    // A query-resolved program is merged into the pickers so it shows up as a
    // real, selectable option even though it is not part of the 200-row list.
    const optionsList = useMemo(() => {
        const base = [...programsList]
        for (const p of [resolved?.a, resolved?.b]) {
            if (p && !base.some((x) => String(x.id) === String(p.id))) base.push(p)
        }
        return base
    }, [programsList, resolved])

    const [progId1, setProgId1] = useState<string>("")
    const [progId2, setProgId2] = useState<string>("")
    const [paramsApplied, setParamsApplied] = useState(false)
    const [copied, setCopied] = useState(false)

    // Apply ?a=<id>&b=<id> once the browse list is loaded AND the query ids
    // have been resolved. A valid id selects that program; an invalid one
    // leaves the slot empty (honest error state below) — never a silent
    // substitution with another program. Render-time adjustment (React's
    // documented alternative to a mount/update effect): the guard converges
    // after one pass because paramsApplied flips true.
    if (!paramsApplied && programsList.length > 0 && querySettled) {
        setProgId1(aParam ? (resolved?.a?.id ?? "") : programsList[0].id)
        setProgId2(bParam ? (resolved?.b?.id ?? "") : (programsList[1] ?? programsList[0]).id)
        setParamsApplied(true)
    }

    // Keep the address bar in sync with the current pair (no navigation).
    // A picker that is empty or holds a non-program value drops its param,
    // so invalid query ids are removed from the normalized URL.
    useEffect(() => {
        if (!paramsApplied || optionsList.length === 0) return
        const params = new URLSearchParams()
        if (progId1 && optionsList.some((p) => String(p.id) === progId1)) params.set("a", progId1)
        if (progId2 && optionsList.some((p) => String(p.id) === progId2)) params.set("b", progId2)
        const cur = new URLSearchParams(window.location.search)
        if ((cur.get("a") ?? "") === (params.get("a") ?? "") && (cur.get("b") ?? "") === (params.get("b") ?? "")) return
        const next = params.toString()
        // In-place URL update only: history.replaceState rewrites the address
        // bar without an RSC navigation and keeps Next's pathname/searchParams
        // hooks in sync. router.replace proved unreliable here — on this SSG
        // page its soft navigation can be dropped entirely, leaving the URL
        // stale while the pickers already changed.
        window.history.replaceState(window.history.state, "", next ? `${pathname}?${next}` : pathname)
    }, [paramsApplied, progId1, progId2, optionsList, pathname])

    const handleShare = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
        } catch {
            // Clipboard unavailable (permissions/non-secure context) — stay silent.
        }
    }

    // No fallback: a slot that resolves to nothing renders an honest error
    // state instead of silently substituting programsList[0]/[1].
    const p1 = optionsList.find(p => String(p.id) === String(progId1))
    const p2 = optionsList.find(p => String(p.id) === String(progId2))
    const invalid1 = paramsApplied && !!aParam && !p1
    const invalid2 = paramsApplied && !!bParam && !p2

    const { data: c1 } = useSWR(p1 && (p1.courseCount ?? 0) > 0 ? ["curricula-comp", p1.id] : null, () => (p1 ? fetchCurricula(p1.id) : []))
    const { data: c2 } = useSWR(p2 && (p2.courseCount ?? 0) > 0 ? ["curricula-comp", p2.id] : null, () => (p2 ? fetchCurricula(p2.id) : []))

    const courses1 = c1 || []
    const courses2 = c2 || []

    // Calculate common courses overlap
    const names1 = new Set(courses1.map(c => (c.courseName || "").toLowerCase().trim()))

    const commonCourses = courses2.filter(c => names1.has((c.courseName || "").toLowerCase().trim()))

    const overlapPct = courses1.length > 0 ? Math.round((commonCourses.length / Math.max(courses1.length, courses2.length)) * 100) : 0

    const getRadarScores = (prog?: Program): AunCriterionScore[] => {
        if (!prog) return []
        // Real per-criterion evaluation scores (1-5). All four must be present —
        // no interpolation from the aggregate evaluationScore.
        const evalComponents = [
            { id: "outcomes", name: t("evalOutcomes"), score: prog.evalOutcomes },
            { id: "structure", name: t("evalStructure"), score: prog.evalStructure },
            { id: "blocks", name: t("evalKnowledgeBlocks"), score: prog.evalKnowledgeBlocks },
            { id: "completeness", name: t("evalCompleteness"), score: prog.evalCompleteness },
        ]
        return evalComponents.every((c) => typeof c.score === "number")
            ? evalComponents.map((c) => ({ id: c.id, name: c.name, score: c.score as number }))
            : []
    }

    const radarScores1 = getRadarScores(p1)
    const radarScores2 = getRadarScores(p2)

    return (
        <div className="container mx-auto py-8 px-4 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="border-b pb-6 space-y-2">
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1">
                        <Scale className="w-3.5 h-3.5" />
                        <span>{t("compareBadge")}</span>
                    </Badge>
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight">{t("compareTitle")}</h1>
                <p className="text-muted-foreground text-sm">
                    {t("compareSubtitle", { score: t("slmRefScore"), note: t("slmRefScoreNote") })}
                </p>
            </div>

            {/* Share */}
            <div className="flex justify-end">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleShare}
                    data-testid="compare-share-button"
                >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
                    <span>{copied ? t("compareShareCopied") : t("compareShare")}</span>
                </Button>
            </div>

            {/* Program Selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-primary/30 bg-card/60">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold text-primary uppercase flex items-center gap-2">
                            <GraduationCap className="w-4 h-4" />
                            <span>{t("compareProgram1")}</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <select
                            value={progId1}
                            onChange={(e) => setProgId1(e.target.value)}
                            className="w-full font-medium flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                            <option value="" disabled>
                                {t("compareSelectPlaceholder")}
                            </option>
                            {optionsList.map(p => (
                                <option key={p.id} value={String(p.id)}>
                                    [{p.universityName}] {p.name} ({p.degreeType})
                                </option>
                            ))}
                        </select>
                        {invalid1 && (
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive" data-testid="compare-invalid-1">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                <span>{t("compareInvalidProgram")}</span>
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-indigo-500/30 bg-card/60">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold text-indigo-500 uppercase flex items-center gap-2">
                            <GraduationCap className="w-4 h-4" />
                            <span>{t("compareProgram2")}</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <select
                            value={progId2}
                            onChange={(e) => setProgId2(e.target.value)}
                            className="w-full font-medium flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                            <option value="" disabled>
                                {t("compareSelectPlaceholder")}
                            </option>
                            {optionsList.map(p => (
                                <option key={p.id} value={String(p.id)}>
                                    [{p.universityName}] {p.name} ({p.degreeType})
                                </option>
                            ))}
                        </select>
                        {invalid2 && (
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive" data-testid="compare-invalid-2">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                <span>{t("compareInvalidProgram")}</span>
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Overlap Summary Banner — meaningful only when both sides hold
                a real program; hidden while resolving or when a slot is invalid */}
            {p1 && p2 && (
            <Card className="bg-gradient-to-r from-primary/10 via-indigo-500/10 to-emerald-500/10 border-primary/20">
                <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/20 text-primary rounded-2xl">
                            <ArrowRightLeft className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-base">{t("compareOverlapTitle")}</h3>
                            <p className="text-xs text-muted-foreground">{t("compareOverlapDesc", { count: commonCourses.length })}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <span className="text-3xl font-black text-primary">{overlapPct}%</span>
                            <p className="text-[11px] text-muted-foreground">{t("compareOverlapPct")}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            )}

            {/* Detailed Side-by-Side Cards — only once query ids resolved,
                so a loading state never flashes the wrong fallback programs */}
            {paramsApplied && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Program 1 Details */}
                    {p1 ? (
                    <Card className="border-border/60">
                        <CardHeader>
                            <Badge className="w-fit bg-primary/10 text-primary border-primary/20 mb-2">{p1.universityName}</Badge>
                            <CardTitle className="text-xl font-bold">{p1.name}</CardTitle>
                            <CardDescription className="text-xs">{t("compareProgramCode", { code: p1.code || "N/A" })}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">{t("compareDegreeLevel")}</span>
                                    <span className="font-semibold text-sm">{p1.degreeType || "N/A"}</span>
                                </div>
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">{t("compareTotalCredits")}</span>
                                    <span className="font-semibold text-sm text-primary">{p1.credits != null ? t("creditsShort", { count: p1.credits }) : "N/A"}</span>
                                </div>
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">{t("duration")}</span>
                                    <span className="font-semibold">{p1.duration || "N/A"}</span>
                                </div>
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">{t("slmRefScore")}</span>
                                    {p1.dataSufficiency === "insufficient" ? (
                                        <span className="font-bold text-sm text-amber-600" title={t("evalInsufficientNote")}>{t("evalInsufficientBadge")}</span>
                                    ) : (
                                        <span className="font-extrabold text-sm text-emerald-500">{typeof p1.evaluationScore === "number" ? `${p1.evaluationScore.toFixed(1)} / 10.0` : "N/A"}</span>
                                    )}
                                    <span className="block text-[10px] font-normal text-muted-foreground leading-tight">{t("slmRefScoreNote")}</span>
                                </div>
                            </div>

                            <div className="pt-2 border-t flex flex-col items-center">
                                <span className="text-xs font-semibold mb-2">{t("compareRadarTitle")}</span>
                                {radarScores1.length > 0 ? (
                                    <AunRadarChart scores={radarScores1} size={220} />
                                ) : (
                                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                                        <AlertCircle className="h-7 w-7 text-muted-foreground/50" />
                                        <p className="text-xs text-muted-foreground">{t("compareNoEval")}</p>
                                    </div>
                                )}
                            </div>

                            <CompareAdmissions program={p1} />
                        </CardContent>
                    </Card>
                    ) : (
                    <Card className="border-destructive/40" data-testid="compare-slot-empty-1">
                        <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                            <AlertCircle className="h-7 w-7 text-destructive/60" />
                            <p className="text-sm text-muted-foreground">{t("compareInvalidProgram")}</p>
                        </CardContent>
                    </Card>
                    )}

                    {/* Program 2 Details */}
                    {p2 ? (
                    <Card className="border-border/60">
                        <CardHeader>
                            <Badge className="w-fit bg-indigo-500/10 text-indigo-500 border-indigo-500/20 mb-2">{p2.universityName}</Badge>
                            <CardTitle className="text-xl font-bold">{p2.name}</CardTitle>
                            <CardDescription className="text-xs">{t("compareProgramCode", { code: p2.code || "N/A" })}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">{t("compareDegreeLevel")}</span>
                                    <span className="font-semibold text-sm">{p2.degreeType || "N/A"}</span>
                                </div>
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">{t("compareTotalCredits")}</span>
                                    <span className="font-semibold text-sm text-indigo-500">{p2.credits != null ? t("creditsShort", { count: p2.credits }) : "N/A"}</span>
                                </div>
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">{t("duration")}</span>
                                    <span className="font-semibold">{p2.duration || "N/A"}</span>
                                </div>
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">{t("slmRefScore")}</span>
                                    {p2.dataSufficiency === "insufficient" ? (
                                        <span className="font-bold text-sm text-amber-600" title={t("evalInsufficientNote")}>{t("evalInsufficientBadge")}</span>
                                    ) : (
                                        <span className="font-extrabold text-sm text-emerald-500">{typeof p2.evaluationScore === "number" ? `${p2.evaluationScore.toFixed(1)} / 10.0` : "N/A"}</span>
                                    )}
                                    <span className="block text-[10px] font-normal text-muted-foreground leading-tight">{t("slmRefScoreNote")}</span>
                                </div>
                            </div>

                            <div className="pt-2 border-t flex flex-col items-center">
                                <span className="text-xs font-semibold mb-2">{t("compareRadarTitle")}</span>
                                {radarScores2.length > 0 ? (
                                    <AunRadarChart scores={radarScores2} size={220} />
                                ) : (
                                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                                        <AlertCircle className="h-7 w-7 text-muted-foreground/50" />
                                        <p className="text-xs text-muted-foreground">{t("compareNoEval")}</p>
                                    </div>
                                )}
                            </div>

                            <CompareAdmissions program={p2} />
                        </CardContent>
                    </Card>
                    ) : (
                    <Card className="border-destructive/40" data-testid="compare-slot-empty-2">
                        <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                            <AlertCircle className="h-7 w-7 text-destructive/60" />
                            <p className="text-sm text-muted-foreground">{t("compareInvalidProgram")}</p>
                        </CardContent>
                    </Card>
                    )}
                </div>
            )}

            {!paramsApplied && (
                <Card>
                    <CardContent className="p-6 text-sm text-muted-foreground">
                        {t("loading")}
                    </CardContent>
                </Card>
            )}

            {/* Common Courses Overlap Breakdown */}
            {commonCourses.length > 0 && (
                <Card className="border-border/60">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            <div>
                                <CardTitle className="text-base font-bold">{t("compareCommonTitle", { count: commonCourses.length })}</CardTitle>
                                <CardDescription className="text-xs">{t("compareCommonDesc")}</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {commonCourses.slice(0, 15).map((c, i) => (
                                <div key={i} className="p-2.5 rounded-lg border bg-muted/20 flex items-center justify-between text-xs">
                                    <span className="font-medium truncate">{c.courseName}</span>
                                    <Badge variant="outline" className="font-mono text-[10px] ml-2 shrink-0">{c.credits != null ? t("creditsShort", { count: c.credits }) : "N/A"}</Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

// /[locale]/compare is statically prerendered — useSearchParams must sit
// behind a Suspense boundary or `next build` fails.
export const ProgramComparison = () => (
    <Suspense fallback={null}>
        <ProgramComparisonInner />
    </Suspense>
)
