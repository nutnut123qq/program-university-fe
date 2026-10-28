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
