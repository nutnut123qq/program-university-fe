import { AdmissionScore } from "@/features/programs/types"

/**
 * Shared same-scale + same-method trend math (v1.3 design rule — khóa):
 * scores are ONLY comparable within one (scale, method) series. A program
 * switching scale between years produces separate series — never join
 * them into a fake line. Callers must render an honest "chưa đủ năm"
 * state for series with fewer than 2 points.
 */

export interface TrendPoint {
    year: number
    score: number
}

export interface TrendSeries {
    /** `${scale}|${method}` */
    key: string
    scale: number
    method: string
    methodLabel: string | null
    /** Year-ascending points within this (scale, method) series. */
    points: TrendPoint[]
}

/**
 * Group program-scope cutoff rows into same-scale same-method series.
 * Non-cutoff kinds (floor/converted) and non-program scopes are excluded —
 * they are context data, not comparable cutoffs.
 */
export function buildTrendSeries(scores: AdmissionScore[]): TrendSeries[] {
    const groups = new Map<string, TrendSeries>()
    for (const s of scores) {
        if (s.scope !== "program" || s.kind !== "cutoff") continue
        if (typeof s.scale !== "number" || typeof s.score !== "number") continue
        const key = `${s.scale}|${s.method}`
        let g = groups.get(key)
        if (!g) {
            g = { key, scale: s.scale, method: s.method, methodLabel: s.methodLabel, points: [] }
            groups.set(key, g)
        }
        // Same-year dupes (e.g. multi-combo rows) collapse to the lowest
        // cutoff — that is the real eligibility threshold for the year.
        const existing = g.points.find((p) => p.year === s.year)
        if (existing) {
            if (s.score < existing.score) existing.score = s.score
        } else {
            g.points.push({ year: s.year, score: s.score })
        }
    }
    const list = [...groups.values()]
    for (const g of list) g.points.sort((a, b) => a.year - b.year)
    // Newest-year-first ordering so the primary series leads the UI.
    list.sort((a, b) => (b.points[b.points.length - 1]?.year ?? 0) - (a.points[a.points.length - 1]?.year ?? 0))
    return list
}

export interface YearDelta {
    /** score[toYear] - score[fromYear], same (scale, method) series. */
    delta: number
    fromYear: number
    toYear: number
}

/**
 * Delta between `year` and the closest earlier year in the same series.
 * Returns null when there is no earlier point — callers render nothing
 * (badge hidden) rather than inventing a comparison.
 */
export function deltaVsPreviousYear(series: TrendSeries, year: number): YearDelta | null {
    const idx = series.points.findIndex((p) => p.year === year)
    if (idx <= 0) return null
    const cur = series.points[idx]
    const prev = series.points[idx - 1]
    return { delta: cur.score - prev.score, fromYear: prev.year, toYear: cur.year }
}

/**
 * Delta between the two most recent years of a series (for list/card hints).
 * Null when the series has <2 points.
 */
export function latestYearDelta(series: TrendSeries): YearDelta | null {
    const n = series.points.length
    if (n < 2) return null
    const cur = series.points[n - 1]
    const prev = series.points[n - 2]
    return { delta: cur.score - prev.score, fromYear: prev.year, toYear: cur.year }
}
