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

/**
 * A stored value that is a number equal to 0 ("0", "0.0"). A zero credit count, pass score or failing criterion says
 * nothing (v2.59, measured: TDTU 39 / FPT 6 zero-credit syllabi, FPT 2 pass scores, TDTU 4,165 criteria): a 0 does not
 * tell a non-credit course from one not recorded.
 */
export const isZeroValue = (v: unknown) => {
    const s = String(v ?? "").trim()
    return s !== "" && Number(s) === 0
}

const foldName = (s: string | null | undefined) => (s ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase()
/** Two names that read the same (NFC, spaces and letter case folded): an English line equal to its title is not shown (v2.59). */
export const sameName = (a: string | null | undefined, b: string | null | undefined) => foldName(a) === foldName(b)

/**
 * The syllabus as displayed: its university's filler fields and its zero credits / pass score / failing criteria blanked
 * (every reader skips an empty value; an empty criterion reads "not specified").
 */
export function withoutFiller(universityCode: string | null | undefined, syllabus: SyllabusDetail | null | undefined) {
    if (!syllabus) return syllabus
    const filler = SYLLABUS_FILLER.get(universityCode ?? "")
    const blank = <R extends object>(row: R, keys: (keyof R)[]): R => ({ ...row, ...Object.fromEntries(keys.map((k) => [k, ""])) })
    const zeros = <R extends object>(row: R, keys: (keyof R)[]) => keys.filter((k) => isZeroValue(row[k]))
    return {
        ...syllabus,
        info: syllabus.info && blank(syllabus.info, [...(filler?.info ?? []), ...zeros(syllabus.info, ["credits", "minAvgToPass"])]),
        assessments: syllabus.assessments?.map((a) => blank(a, zeros(a, ["completionCriteria"]))),
        sessions: filler ? syllabus.sessions?.map((s) => blank(s, filler.sessions)) : syllabus.sessions,
    }
}

/** A relation entry stored as a comma-joined list ("A, B" — 13 NEU prerequisites) shown as separate codes; data unchanged. */
export const relationCodes = (codes: string[] | undefined) => (codes ?? []).flatMap((c) => c.split(",").map((s) => s.trim()).filter(Boolean))
