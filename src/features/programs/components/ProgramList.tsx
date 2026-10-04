"use client"

import { useCallback, useMemo, useState } from "react"
import useSWR from "swr"
import useSWRInfinite from "swr/infinite"
import { motion } from "framer-motion"
import { GraduationCap, SearchX, Loader2, Heart } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
    latestYearDelta,
    pickQualifyingCutoff,
    type QualifyingCutoff,
} from "@/lib/admissionTrend"
import { ProgramCard, type ScoreHint } from "./ProgramCard"
import { ProgramFilters } from "./ProgramFilters"
import { ProgramDetailDialog } from "./ProgramDetailDialog"
import { ScoreFilter } from "./ScoreFilter"
import { WishlistDrawer } from "@/features/wishlist/WishlistDrawer"
import { useWishlist } from "@/features/wishlist/useWishlist"
import {
    fetchAdmissions,
    fetchDegreeTypes,
    fetchPrograms,
    fetchUniversities,
} from "../api"
import {
    AdmissionData,
    AdmissionScore,
    Program,
    ProgramFilters as ProgramFiltersType,
    ProgramsResponse,
    University,
} from "../types"

const PAGE_SIZE = 12

type UniversityWithCode = University & { code?: string | null }

/**
 * Per-program admission hint for score-filter result cards only.
 * cutoffYear/cutoff/scale/method* = the qualifying (scale, method)
 * series' newest point — the exact row that made the program eligible
 * (v1.4); delta* = that series' latest year-over-year delta (null when
 * it has <2 points); quota/quotaYear = newest program-scope quota row
 * (null when none).
 */
type AdmissionHint = {
    cutoffYear: number
    cutoff: number
    scale: number
    /** Raw method code of the qualifying series ("" => null). */
    method: string | null
    /** Label of the qualifying row (methodLabel, raw method fallback). */
    methodLabel: string | null
    delta: number | null
    deltaFromYear: number | null
    deltaToYear: number | null
    quota: number | null
    quotaYear: number | null
}

export function ProgramList() {
    const t = useTranslations("programs")
    const [filters, setFilters] = useState<ProgramFiltersType>({
        search: "",
        degreeType: "all",
        universityId: "",
        universityType: "all",
        sortBy: "newest",
    })
    const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)
    const [lastViewedProgram, setLastViewedProgram] = useState<Program | null>(null)
    const [wishlistOpen, setWishlistOpen] = useState(false)
    const { mounted: wishlistMounted, ids: wishlistIds } = useWishlist()

    const displayProgram = selectedProgram || lastViewedProgram

    const handleSelectProgram = (program: Program | null) => {
        if (program) {
            setLastViewedProgram(program)
        }
        setSelectedProgram(program)
    }

    const getKey = useCallback(
        (pageIndex: number, previousPageData: ProgramsResponse | null) => {
            if (previousPageData && !previousPageData.hasNextPage) return null
            return ["programs", filters, pageIndex + 1] as const
        },
        [filters]
    )

    const { data, error, isLoading, isValidating, size, setSize } = useSWRInfinite(
        getKey,
        ([, currentFilters, page]) =>
            fetchPrograms({
                page,
                pageSize: PAGE_SIZE,
                search: currentFilters.search || undefined,
                degreeType: currentFilters.degreeType === "all" ? undefined : currentFilters.degreeType,
                universityId: currentFilters.universityId || undefined,
                universityType: currentFilters.universityType,
                cohort: currentFilters.cohort === "all" ? undefined : currentFilters.cohort,
                sortBy: currentFilters.sortBy === "newest" ? "createdAt" : currentFilters.sortBy,
                sortDesc: currentFilters.sortBy === "newest" || currentFilters.sortBy === "credits",
            }),
        { revalidateFirstPage: false }
    )

    const allPrograms = useMemo(() => (data ? data.flatMap((page) => page.items) : []), [data])
    const totalCount = data?.[0]?.totalCount ?? 0
    const hasNextPage = data?.[data.length - 1]?.hasNextPage ?? false

    const { data: degreeTypes } = useSWR("degree-types", fetchDegreeTypes)
    const { data: universities } = useSWR("universities", fetchUniversities)

    // ------------------------------------------------------------------
    // Score filter ("Lọc theo điểm chuẩn")
    // Same-scale-only semantics: a user score compares exclusively against
    // admission rows with scale === selected scale. No normalization, no
    // cross-scale conversion, no ranking (SPEC-ADMISSION-DATA).
    // ------------------------------------------------------------------
    const [scoreInput, setScoreInput] = useState("")
    const [scoreScaleChoice, setScoreScaleChoice] = useState<number | null>(null)
    const [scoreMethod, setScoreMethod] = useState("") // "" = all methods

    const parsedScore = useMemo(() => {
        const raw = scoreInput.trim()
        if (raw === "") return null
        const n = Number(raw)
        return Number.isFinite(n) ? n : null
    }, [scoreInput])
    const scoreFilterRequested = parsedScore != null

    // Lazily load every university's admission snapshot the first time the
    // user engages the score filter. A missing/404 file resolves to null and
    // simply contributes nothing — never fabricated.
    const { data: admissionsByCode, isLoading: admissionsLoading } = useSWR(
        scoreFilterRequested && (universities?.length ?? 0) > 0
            ? "admissions-score-filter-all"
            : null,
        async () => {
            const map = new Map<string, AdmissionData | null>()
            await Promise.all(
                ((universities ?? []) as UniversityWithCode[]).map(async (u) => {
                    if (!u.code) return
                    try {
                        map.set(u.code, await fetchAdmissions(u.code))
                    } catch {
                        map.set(u.code, null)
                    }
                })
            )
            return map
        }
    )

    // Scale options are discovered from the data (all score rows, any
    // year — including school-scope scales so users can see they exist),
    // never hardcoded.
    const scoreScaleOptions = useMemo(() => {
        if (!admissionsByCode) return [] as number[]
        const set = new Set<number>()
        for (const adm of admissionsByCode.values()) {
            for (const s of adm?.scores ?? []) {
                if (typeof s.scale === "number") {
                    set.add(s.scale)
                }
            }
        }
        return [...set].sort((a, b) => a - b)
    }, [admissionsByCode])

    // Default scale is derived (not an effect): the national-exam 30 scale
    // when present, else the first discovered option — until the user picks
    // one explicitly.
    const scoreScale = scoreScaleChoice ?? (
        scoreScaleOptions.length === 0 ? null :
        scoreScaleOptions.includes(30) ? 30 : scoreScaleOptions[0]
    )

    // Method options: distinct program-scope cutoff methods that exist at the
    // selected scale (rows the filter can actually match), across all years —
    // the eligibility check below compares against each program's newest row.
    const scoreMethodOptions = useMemo(() => {
        if (!admissionsByCode || scoreScale == null) {
            return [] as { value: string; label: string }[]
        }
        const map = new Map<string, string | null>()
        for (const adm of admissionsByCode.values()) {
            for (const s of adm?.scores ?? []) {
                if (
                    s.scope === "program" &&
                    s.kind === "cutoff" &&
                    s.scale === scoreScale &&
                    s.method &&
                    !map.has(s.method)
                ) {
                    map.set(s.method, s.methodLabel)
                }
            }
        }
        return [...map.entries()].map(([value, label]) => ({
            value,
            label: label ?? value,
        }))
    }, [admissionsByCode, scoreScale])

    const scoreFilterActive =
        scoreFilterRequested && scoreScale != null && !!admissionsByCode

    // Eligibility ↔ hint share ONE per-program qualifying cutoff (v1.4
    // trust fix): the (scale, method-if-chosen) series+point that decides
    // eligibility is the exact one the card renders — with its method
    // label — so a hint can never contradict the threshold that let the
    // program pass. pickQualifyingCutoff keeps the same-scale-only,
    // scope=program, kind=cutoff invariants; no cross-scale conversion.
    // Each program is compared on its NEWEST program-scope cutoff year at
    // the selected scale (schools publish different scales in different
    // years — e.g. UEH moved to scale 100 in 2026 — so pinning one global
    // year would silently drop programs whose latest same-scale cutoff is
    // older); same-year ties break to the lowest score, which is the row
    // that qualifies. Missing data => no candidate => excluded.
    const qualifyingCutoffs = useMemo(() => {
        if (!scoreFilterActive || !admissionsByCode || scoreScale == null) {
            return null
        }
        const scoresByProgram = new Map<string, AdmissionScore[]>()
        for (const adm of admissionsByCode.values()) {
            if (!adm) continue
            for (const s of adm.scores ?? []) {
                if (s.scope !== "program" || s.kind !== "cutoff") continue
                if (!s.programId || typeof s.score !== "number") continue
                const rows = scoresByProgram.get(s.programId)
                if (rows) rows.push(s)
                else scoresByProgram.set(s.programId, [s])
            }
        }
        const map = new Map<string, QualifyingCutoff>()
        for (const [pid, rows] of scoresByProgram) {
            const q = pickQualifyingCutoff(rows, scoreScale, scoreMethod || null)
            if (q) map.set(pid, q)
        }
        return map
    }, [scoreFilterActive, admissionsByCode, scoreScale, scoreMethod])

    // A program is eligible when its qualifying cutoff <= the user's score.
    const eligibleProgramIds = useMemo(() => {
        if (!qualifyingCutoffs || parsedScore == null) return null
        const ids = new Set<string>()
        for (const [pid, q] of qualifyingCutoffs) {
            if (q.point.score <= parsedScore) ids.add(pid)
        }
        return ids
    }, [qualifyingCutoffs, parsedScore])

    // Card hints for score-filtered results: the SAME qualifying
    // (scale, method) series decides the displayed cutoff, the method
    // label and the trend delta (latestYearDelta — null => badge hidden),
    // plus the newest program-scope quota row. Null in normal browsing so
    // the map is never built and no hint is rendered there.
    const admissionHints = useMemo(() => {
        if (!qualifyingCutoffs || !admissionsByCode || scoreScale == null) {
            return null
        }
        const newestQuota = new Map<string, { year: number; quota: number }>()
        for (const adm of admissionsByCode.values()) {
            if (!adm) continue
            for (const q of adm.quotas ?? []) {
                if (q.scope !== "program" || !q.programId) continue
                if (typeof q.quota !== "number" || typeof q.year !== "number") continue
                const cur = newestQuota.get(q.programId)
                if (!cur || q.year > cur.year) {
                    newestQuota.set(q.programId, { year: q.year, quota: q.quota })
                }
            }
        }
        const hints = new Map<string, AdmissionHint>()
        for (const [pid, q] of qualifyingCutoffs) {
            const d = latestYearDelta(q.series)
            const quota = newestQuota.get(pid)
            hints.set(pid, {
                cutoffYear: q.point.year,
                cutoff: q.point.score,
                scale: q.series.scale,
                method: q.series.method || null,
                methodLabel: q.methodLabel,
                delta: d?.delta ?? null,
                deltaFromYear: d?.fromYear ?? null,
                deltaToYear: d?.toYear ?? null,
                quota: quota?.quota ?? null,
                quotaYear: quota?.year ?? null,
            })
        }
        return hints
    }, [qualifyingCutoffs, admissionsByCode, scoreScale])

    // While the score filter is active, fetch the whole catalog (with the
    // same search/filters applied — AND semantics) in one shot so programs
    // beyond the currently loaded pages are evaluated too.
    const { data: scorePool } = useSWR(
        scoreFilterActive && totalCount > 0
            ? ["programs-score-pool", filters, totalCount]
            : null,
        ([, f, count]) =>
            fetchPrograms({
                page: 1,
                pageSize: Math.max(Number(count) || PAGE_SIZE, PAGE_SIZE),
                search: f.search || undefined,
                degreeType: f.degreeType === "all" ? undefined : f.degreeType,
                universityId: f.universityId || undefined,
                universityType: f.universityType,
                cohort: f.cohort === "all" ? undefined : f.cohort,
                sortBy: f.sortBy === "newest" ? "createdAt" : f.sortBy,
                sortDesc: f.sortBy === "newest" || f.sortBy === "credits",
            })
    )

    // null while the pool is still loading so the UI shows the skeleton
    // instead of flashing a premature "0 results" empty state.
    const scoreFilteredPrograms = useMemo(() => {
        if (!scoreFilterActive || !scorePool || !eligibleProgramIds) return null
        return scorePool.items.filter((p) => eligibleProgramIds.has(p.id))
    }, [scoreFilterActive, scorePool, eligibleProgramIds])

    const displayedPrograms = scoreFilteredPrograms ?? allPrograms
    // totalCount === 0 means the catalog query itself returned nothing, so
    // the pool fetch is skipped (key null) and must not count as "loading".
    const scorePoolLoading = scoreFilterActive && totalCount > 0 && !scorePool

    // ProgramCard's prop names the cutoff year `year`; the map keeps the
    // more explicit `cutoffYear`. Missing hint => undefined (card hides it).
    const scoreHintFor = (programId: string): ScoreHint | undefined => {
        const h = admissionHints?.get(programId)
        if (!h) return undefined
        return {
            cutoff: h.cutoff,
            year: h.cutoffYear,
            scale: h.scale,
            method: h.method,
            methodLabel: h.methodLabel,
            delta: h.delta,
            deltaFromYear: h.deltaFromYear,
            deltaToYear: h.deltaToYear,
            quota: h.quota,
            quotaYear: h.quotaYear,
        }
    }

    const handleScoreScaleChange = (scale: number) => {
        setScoreScaleChoice(scale)
        setScoreMethod("") // method options are per-scale; reset selection
    }

    const handleScoreClear = () => {
        setScoreInput("")
        setScoreMethod("")
    }

    const handleFiltersChange = (newFilters: ProgramFiltersType) => {
        setFilters(newFilters)
        setSize(1)
    }

    const handleLoadMore = () => {
        if (hasNextPage) {
            setSize(size + 1)
        }
    }

    return (
        <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8 max-w-7xl space-y-8">
            {/* Hero */}
            <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-4 text-center max-w-3xl mx-auto"
            >
                <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/5 mb-2">
                    <GraduationCap className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                    {t("title")}
                </h1>
                <p className="text-lg text-muted-foreground">
                    {t("subtitle")}
                </p>
                <div className="flex justify-center pt-1">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setWishlistOpen(true)}
                        data-testid="wishlist-open"
                        className="gap-1.5 rounded-xl text-xs font-semibold"
                    >
                        <Heart className="h-3.5 w-3.5 text-rose-500" fill={wishlistMounted && wishlistIds.length > 0 ? "currentColor" : "none"} />
                        {t("wishlistOpen", { count: wishlistMounted ? wishlistIds.length : 0 })}
                    </Button>
                </div>
            </motion.section>

            {/* Filters */}
            <ProgramFilters
                filters={filters}
                universities={universities || []}
                degreeTypes={degreeTypes || []}
                onChange={handleFiltersChange}
                resultCount={allPrograms.length}
                totalCount={totalCount}
            />

            {/* Cutoff-score filter (same-scale only; lazy admissions data) */}
            <ScoreFilter
                score={scoreInput}
                onScoreChange={setScoreInput}
                scales={scoreScaleOptions}
                scale={scoreScale}
                onScaleChange={handleScoreScaleChange}
                methods={scoreMethodOptions}
                method={scoreMethod}
                onMethodChange={setScoreMethod}
                loading={scoreFilterRequested && admissionsLoading}
                dataLoaded={!!admissionsByCode}
                resultCount={scoreFilteredPrograms?.length ?? null}
                onClear={handleScoreClear}
            />

            {/* Loading */}
            {((isLoading && allPrograms.length === 0) || scorePoolLoading) && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-w-0">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="p-5 rounded-2xl border border-border bg-card/60 space-y-4 animate-pulse">
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <div className="h-4 w-16 bg-muted rounded-md" />
                                    <div className="h-4 w-12 bg-muted rounded-md" />
                                </div>
                                <div className="h-5 w-4/5 bg-muted rounded" />
                                <div className="h-3.5 w-1/2 bg-muted rounded" />
                            </div>
                            <div className="h-10 w-full bg-muted/60 rounded-md" />
                            <div className="flex gap-2">
                                <div className="h-5 w-14 bg-muted rounded-full" />
                                <div className="h-5 w-14 bg-muted rounded-full" />
                            </div>
                            <div className="pt-2 border-t border-border/40 flex gap-2">
                                <div className="h-9 flex-1 bg-muted rounded-xl" />
                                <div className="h-9 w-16 bg-muted rounded-xl" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Error */}
            {error && !isLoading && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
                    <p className="text-destructive font-medium">
                        {t("errorTitle")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                        {error.message}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={() => window.location.reload()}
                    >
                        {t("retry")}
                    </Button>
                </div>
            )}

            {/* Empty */}
            {!isLoading && !scorePoolLoading && !error && displayedPrograms.length === 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-16 text-center"
                >
                    <div className="rounded-full bg-muted p-4 mb-4">
                        <SearchX className="h-8 w-8 text-muted-foreground" />
                    </div>
                    {scoreFilterActive ? (
                        <h3 className="text-lg font-semibold" data-testid="score-filter-empty">
                            {t("scoreFilterEmpty")}
                        </h3>
                    ) : (
                        <>
                            <h3 className="text-lg font-semibold">{t("emptyTitle")}</h3>
                            <p className="text-muted-foreground mt-1">
                                {t("emptyDescription")}
                            </p>
                        </>
                    )}
                </motion.div>
            )}

            {/* Grid */}
            {displayedPrograms.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {displayedPrograms.map((program, index) => (
                        <ProgramCard
                            key={program.id}
                            program={program}
                            index={index}
                            onViewDetail={handleSelectProgram}
                            scoreHint={
                                // Hints only in score-filter mode — normal
                                // browsing never computes or renders them.
                                scoreFilteredPrograms ? scoreHintFor(program.id) : undefined
                            }
                        />
                    ))}
                </div>
            )}

            {/* Load more */}
            {hasNextPage && !scoreFilterActive && (
                <div className="flex justify-center pt-4">
                    <Button
                        size="lg"
                        onClick={handleLoadMore}
                        disabled={isValidating}
                        className="min-w-[200px]"
                    >
                        {isValidating ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t("loading")}
                            </>
                        ) : (
                            t("loadMore", { loaded: allPrograms.length, total: totalCount })
                        )}
                    </Button>
                </div>
            )}

            <ProgramDetailDialog
                program={displayProgram}
                open={!!selectedProgram}
                onClose={() => setSelectedProgram(null)}
            />

            <WishlistDrawer open={wishlistOpen} onOpenChange={setWishlistOpen} />
        </div>
    )
}
