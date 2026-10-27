"use client"

import React, { Suspense, useEffect, useMemo, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Scale, GraduationCap, ArrowRightLeft, CheckCircle2, AlertCircle, Share2, Check, Plus, X } from "lucide-react"
import { fetchPrograms, fetchProgramById, fetchCurricula } from "@/features/programs/api"
import { Program } from "@/features/programs/types"
import { AunRadarChart, AunCriterionScore } from "@/components/common/AunRadarChart"
import { cn } from "@/lib/utils"
import { CompareAdmissions } from "./CompareAdmissions"
import { useTranslations } from "next-intl"

// Query keys of the compare slots, in slot order (?a=&b= keeps working; c is optional).
const SLOT_KEYS = ["a", "b", "c"] as const
// Per-slot accent classes — full literals so Tailwind keeps them.
const SLOT_STYLES = [
    { card: "border-primary/30", text: "text-primary", badge: "bg-primary/10 text-primary border-primary/20" },
    { card: "border-indigo-500/30", text: "text-indigo-500", badge: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
    { card: "border-emerald-500/30", text: "text-emerald-500", badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
]

const curriculaKey = (p?: Program) => (p && (p.courseCount ?? 0) > 0 ? ["curricula-comp", p.id] : null)
const fetchCurriculaByKey = ([, id]: string[]) => fetchCurricula(id)
const normName = (name?: string | null) => (name || "").toLowerCase().trim()

const ProgramComparisonInner = () => {
    const t = useTranslations("programs")
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { data: programRes } = useSWR(["programs-list-all"], () => fetchPrograms({ page: 1, pageSize: 200 }))
    const programsList = useMemo(() => programRes?.items || [], [programRes])

    const queryIds = SLOT_KEYS.map((k) => searchParams.get(k) ?? "")
    const hasQuery = queryIds.some(Boolean)

    // Query ids may point at programs outside the first-200 browse options —
    // resolve them by direct fetch. resolved[i] === null means "does not exist".
    const { data: resolved, error: queryError } = useSWR(
        hasQuery ? ["compare-query-ids", ...queryIds] : null,
        ([, ...ids]: string[]) => Promise.all(ids.map((id) => (id ? fetchProgramById(id) : undefined)))
    )
    const querySettled = !hasQuery || resolved !== undefined || queryError !== undefined

    // A query-resolved program is merged into the pickers so it shows up as a
    // real, selectable option even though it is not part of the 200-row list.
    const optionsList = useMemo(() => {
        const base = [...programsList]
        for (const p of resolved ?? []) {
            if (p && !base.some((x) => String(x.id) === String(p.id))) base.push(p)
        }
        return base
    }, [programsList, resolved])

    // One entry per slot (2 or 3). "" = nothing picked yet; null = the link
    // named an id that does not resolve (honest error state for that slot).
    const [progIds, setProgIds] = useState<(string | null)[]>(["", ""])
    const [paramsApplied, setParamsApplied] = useState(false)
    const [copied, setCopied] = useState(false)

    // Apply ?a=<id>&b=<id>[&c=<id>] once the browse list is loaded AND the
    // query ids have been resolved. A valid id selects that program; an
    // invalid one leaves the slot empty (honest error state below) — never a
    // silent substitution with another program. The 3rd slot exists only when
    // the link asks for it. Render-time adjustment (React's documented
    // alternative to a mount/update effect): the guard converges after one
    // pass because paramsApplied flips true.
    if (!paramsApplied && programsList.length > 0 && querySettled) {
        const [aParam, bParam, cParam] = queryIds
        setProgIds([
            aParam ? (resolved?.[0]?.id ?? null) : programsList[0].id,
            bParam ? (resolved?.[1]?.id ?? null) : (programsList[1] ?? programsList[0]).id,
            ...(cParam ? [resolved?.[2]?.id ?? null] : []),
        ])
        setParamsApplied(true)
    }

    // Keep the address bar in sync with the current slots (no navigation).
    // A picker that is empty or holds a non-program value drops its param,
    // so invalid query ids (and a removed 3rd slot) leave the normalized URL.
    useEffect(() => {
        if (!paramsApplied || optionsList.length === 0) return
        const params = new URLSearchParams()
        progIds.forEach((id, i) => {
            if (id && optionsList.some((p) => String(p.id) === id)) params.set(SLOT_KEYS[i], id)
        })
        const cur = new URLSearchParams(window.location.search)
        if (SLOT_KEYS.every((k) => (cur.get(k) ?? "") === (params.get(k) ?? ""))) return
        const next = params.toString()
        // In-place URL update only: history.replaceState rewrites the address
        // bar without an RSC navigation. router.replace proved unreliable here
        // — on this SSG page its soft navigation can be dropped entirely,
        // leaving the URL stale while the pickers already changed.
        // Pass Next's own history.state: its __NA flag makes Next's patched
        // replaceState skip the router sync, so useSearchParams (queryIds) keeps
        // the link's ids; any other state would re-sync it on every slot change.
        window.history.replaceState(window.history.state, "", next ? `${pathname}?${next}` : pathname)
    }, [paramsApplied, progIds, optionsList, pathname])

    const handleShare = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
        } catch {
            // Clipboard unavailable (permissions/non-secure context) — stay silent.
        }
    }

    const setSlot = (i: number, id: string) => setProgIds((prev) => prev.map((x, j) => (j === i ? id : x)))

    // No fallback: a slot that resolves to nothing renders an honest error
    // state instead of silently substituting programsList[0]/[1].
    const progs = progIds.map((id) => optionsList.find((p) => String(p.id) === String(id)))

    const { data: c1 } = useSWR(curriculaKey(progs[0]), fetchCurriculaByKey)
    const { data: c2 } = useSWR(curriculaKey(progs[1]), fetchCurriculaByKey)
    const { data: c3 } = useSWR(curriculaKey(progs[2]), fetchCurriculaByKey)
    const curricula = [c1, c2, c3]

    // Courses shared by every selected program, listed in the 2nd selected
    // program's order. With two programs this is the original pairwise overlap.
    const filled = progs.flatMap((p, i) => (p ? [curricula[i] || []] : []))
    const nameSets = filled.map((cs) => new Set(cs.map((c) => normName(c.courseName))))
    const commonCourses = filled.length >= 2 ? filled[1].filter((c) => nameSets.every((s) => s.has(normName(c.courseName)))) : []

    const overlapPct = filled.length >= 2 && filled[0].length > 0 ? Math.round((commonCourses.length / Math.max(...filled.map((cs) => cs.length))) * 100) : 0

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

    const slotLabels = [t("compareProgram1"), t("compareProgram2"), t("compareProgram3")]
    const three = progIds.length === 3

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

            {/* Add 3rd program + Share */}
            <div className="flex flex-wrap justify-end gap-2">
                {paramsApplied && !three && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setProgIds((prev) => [...prev, ""])}
                        data-testid="compare-add-program"
                    >
                        <Plus className="w-4 h-4" />
                        <span>{t("compareAddProgram")}</span>
                    </Button>
                )}
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
            <div className={cn("grid grid-cols-1 gap-6", three ? "md:grid-cols-3" : "md:grid-cols-2")}>
                {progIds.map((id, i) => (
                    <Card key={i} className={cn(SLOT_STYLES[i].card, "bg-card/60")}>
                        <CardHeader className={cn("pb-3", i === 2 && "flex-row items-center justify-between space-y-0")}>
                            <CardTitle className={cn("text-sm font-semibold uppercase flex items-center gap-2", SLOT_STYLES[i].text)}>
                                <GraduationCap className="w-4 h-4" />
                                <span>{slotLabels[i]}</span>
                            </CardTitle>
                            {i === 2 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                    aria-label={t("compareRemoveProgram")}
                                    onClick={() => setProgIds((prev) => prev.slice(0, 2))}
                                    data-testid="compare-remove-3"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent>
                            <select
                                value={id ?? ""}
                                onChange={(e) => setSlot(i, e.target.value)}
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
                            {id === null && (
                                <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive" data-testid={`compare-invalid-${i + 1}`}>
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    <span>{t("compareInvalidProgram")}</span>
                                </p>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Overlap Summary Banner — meaningful only when at least two slots
                hold a real program; hidden while resolving or when slots are invalid */}
            {filled.length >= 2 && (
            <Card className="bg-gradient-to-r from-primary/10 via-indigo-500/10 to-emerald-500/10 border-primary/20" data-testid="compare-overlap">
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
                <div className={cn("grid grid-cols-1 gap-6", three ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
                    {progs.map((p, i) => {
                        if (!p) {
                            return progIds[i] === null ? (
                                <Card key={i} className="border-destructive/40" data-testid={`compare-slot-empty-${i + 1}`}>
                                    <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                                        <AlertCircle className="h-7 w-7 text-destructive/60" />
                                        <p className="text-sm text-muted-foreground">{t("compareInvalidProgram")}</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Card key={i} className="border-dashed" data-testid={`compare-slot-placeholder-${i + 1}`}>
                                    <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                                        <GraduationCap className="h-7 w-7 text-muted-foreground/50" />
                                        <p className="text-sm text-muted-foreground">{t("compareSelectPlaceholder")}</p>
                                    </CardContent>
                                </Card>
                            )
                        }
                        const radarScores = getRadarScores(p)
                        return (
                            <Card key={i} className="border-border/60" data-testid={`compare-card-${i + 1}`}>
                                <CardHeader>
                                    <Badge className={cn("w-fit mb-2", SLOT_STYLES[i].badge)}>{p.universityName}</Badge>
                                    <CardTitle className="text-xl font-bold">{p.name}</CardTitle>
                                    <CardDescription className="text-xs">{t("compareProgramCode", { code: p.code || "N/A" })}</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div className="p-2.5 rounded-lg border bg-muted/20">
                                            <span className="text-muted-foreground block text-[11px]">{t("compareDegreeLevel")}</span>
                                            <span className="font-semibold text-sm">{p.degreeType || "N/A"}</span>
                                        </div>
                                        <div className="p-2.5 rounded-lg border bg-muted/20">
                                            <span className="text-muted-foreground block text-[11px]">{t("compareTotalCredits")}</span>
                                            <span className={cn("font-semibold text-sm", SLOT_STYLES[i].text)}>{p.credits != null ? t("creditsShort", { count: p.credits }) : "N/A"}</span>
                                        </div>
                                        <div className="p-2.5 rounded-lg border bg-muted/20">
                                            <span className="text-muted-foreground block text-[11px]">{t("duration")}</span>
                                            <span className="font-semibold">{p.duration || "N/A"}</span>
                                        </div>
                                        <div className="p-2.5 rounded-lg border bg-muted/20">
                                            <span className="text-muted-foreground block text-[11px]">{t("slmRefScore")}</span>
                                            {p.dataSufficiency === "insufficient" ? (
                                                <span className="font-bold text-sm text-amber-600" title={t("evalInsufficientNote")}>{t("evalInsufficientBadge")}</span>
                                            ) : (
                                                <span className="font-extrabold text-sm text-emerald-500">{typeof p.evaluationScore === "number" ? `${p.evaluationScore.toFixed(1)} / 10.0` : "N/A"}</span>
                                            )}
                                            <span className="block text-[10px] font-normal text-muted-foreground leading-tight">{t("slmRefScoreNote")}</span>
                                        </div>
                                    </div>

                                    <div className="pt-2 border-t flex flex-col items-center">
                                        <span className="text-xs font-semibold mb-2">{t("compareRadarTitle")}</span>
                                        {radarScores.length > 0 ? (
                                            <AunRadarChart scores={radarScores} size={220} />
                                        ) : (
                                            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                                                <AlertCircle className="h-7 w-7 text-muted-foreground/50" />
                                                <p className="text-xs text-muted-foreground">{t("compareNoEval")}</p>
                                            </div>
                                        )}
                                    </div>

                                    <CompareAdmissions program={p} />
                                </CardContent>
                            </Card>
                        )
                    })}
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
