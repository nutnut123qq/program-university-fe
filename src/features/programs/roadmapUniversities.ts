import { exactMatcher, foldSearch, hasDiacritics } from "@/lib/search-text"
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

/** A course's file name under `public/mock/roadmaps/<university>/` (the fetchers' rule in api.ts: `[^a-zA-Z0-9_-]` → `_`). */
export const roadmapFileKey = (code: string) => code.replace(/[^a-zA-Z0-9_\-]/g, "_")

/** At most this many /roadmap search suggestions (as at Base). */
export const ROADMAP_SUGGESTION_CAP = 8

/** code → foldSearch(name), folded once per names object (one per university's names file; v2.68 fix r1). */
const FOLDED_NAMES = new WeakMap<Readonly<Record<string, string>>, Record<string, string>>()
function foldedNamesOf(names: Readonly<Record<string, string>>): Record<string, string> {
    let folded = FOLDED_NAMES.get(names)
    if (folded === undefined) {
        folded = Object.fromEntries(Object.entries(names).map(([code, name]) => [code, foldSearch(name)]))
        FOLDED_NAMES.set(names, folded)
    }
    return folded
}

/**
 * The /roadmap search (v2.63, audit V9): the codes containing the query (letter case ignored — the Base rule), in index
 * order, then the courses whose folded name contains the folded query (search-text.ts foldSearch — a suggestion list
 * shows near matches too); at most ROADMAP_SUGGESTION_CAP. A query typed with diacritics lists first the names that
 * contain it as typed, then the names that match only once folded (v2.68, audit M18: "kinh tế vi mô" before "Kinh tế
 * vĩ mô"); each part in index order, so a query without diacritics keeps the index order. Both halves read the
 * trimmed query (fix r1): "PRO " lists the PRO codes first.
 * `names` = code → name from the university's names file; without it (loading or failed) only codes match.
 */
export function roadmapSuggestions(index: readonly string[], names: Readonly<Record<string, string>> | undefined, query: string): string[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const byCode = index.filter((code) => code.toLowerCase().includes(q))
    const f = foldSearch(query)
    const folded = names && foldedNamesOf(names)
    const byName = folded && f ? index.filter((code) => !code.toLowerCase().includes(q) && (folded[code] ?? "").includes(f)) : []
    const exact = exactMatcher(query)
    const ranked = names && hasDiacritics(query) ? [...byName.filter((c) => exact(names[c])), ...byName.filter((c) => !exact(names[c]))] : byName
    return [...byCode, ...ranked].slice(0, ROADMAP_SUGGESTION_CAP)
}
