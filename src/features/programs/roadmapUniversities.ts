import type { SyllabusDetail, SyllabusInfo, SyllabusSession } from "./types"

/**
 * Universities with a `public/mock/roadmaps/<code>/` folder (measured v2.53). This fixed list is the
 * allow-list for every roadmap/syllabus fetch path built from a picked university code.
 * - syllabus: `public/mock/syllabuses/<code>/` exists (FPT, TDTU).
 * - fullGraph: the files carry the whole prerequisite/unlock graph (FPT only). NEU lists some
 *   prerequisites and no unlocks, TDTU/UIT none — an empty column there means "not recorded".
 */
export const ROADMAP_UNIVERSITIES: ReadonlyMap<string, { syllabus: boolean; fullGraph: boolean }> = new Map([
    ["FPT", { syllabus: true, fullGraph: true }],
    ["NEU", { syllabus: false, fullGraph: false }],
    ["TDTU", { syllabus: true, fullGraph: false }],
    ["UIT", { syllabus: false, fullGraph: false }],
])

export const DEFAULT_ROADMAP_UNIVERSITY = "FPT"

/**
 * Displayed syllabus fields with the same value in every file of a university (measured v2.54 from
 * `public/mock/syllabuses/`): filler, not data, so never shown. Kept by hand —
 * `e2e/v254-filler-values.spec.ts` re-derives it from the mock and fails when it drifts.
 */
const SYLLABUS_FILLER: ReadonlyMap<string, { info: (keyof SyllabusInfo)[]; sessions: (keyof SyllabusSession)[] }> = new Map([
    ["TDTU", { info: ["decisionNo", "minAvgToPass", "scoringScale"], sessions: ["learningTeachingType", "studentTasks"] }],
])

/** The syllabus as displayed: its university's filler fields blanked (every reader skips an empty value). */
export function withoutFiller(universityCode: string | null | undefined, syllabus: SyllabusDetail | null | undefined) {
    const filler = SYLLABUS_FILLER.get(universityCode ?? "")
    if (!syllabus || !filler) return syllabus
    const blank = <R extends object>(row: R, keys: (keyof R)[]): R => ({ ...row, ...Object.fromEntries(keys.map((k) => [k, ""])) })
    return { ...syllabus, info: blank(syllabus.info, filler.info), sessions: syllabus.sessions?.map((s) => blank(s, filler.sessions)) }
}

/** A relation entry stored as a comma-joined list ("A, B" — 13 NEU prerequisites) shown as separate codes; data unchanged. */
export const relationCodes = (codes: string[] | undefined) => (codes ?? []).flatMap((c) => c.split(",").map((s) => s.trim()).filter(Boolean))
