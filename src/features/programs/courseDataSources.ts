/**
 * Where each university's course-level data (roadmaps, syllabi, materials) was collected from — the
 * attribution AGENTS.md §9 asks for on every data surface (v2.56). Fixed, with the evidence for each host
 * (measured on the published snapshot, `docs/_coord/round91/S2_provenance.log`):
 * - FPT: `crawlfpt/crawl_all_fpt.py:31` fetches `https://syllabase.online/api/v1`, whose own page
 *   (`crawlfpt/index.html`) says its data is compiled from `flm.fpt.edu.vn` and that it is not an official
 *   FPT University site — so both are named, the mirror as the collection path.
 * - NEU: `crawler/parsers/neu_parser.py` (course data from `courses.neu.edu.vn`); 1,109 of the 1,117 roadmap
 *   codes are course codes of NEU programs whose source is that host.
 * - TDTU: `crawler/parsers/tdtu_parser.py` (official API at `cktt-cdr.tdtu.edu.vn`); 2,053 of 2,504 codes.
 * - UIT: `crawler/parsers/uit_parser.py` (curriculum pages at `daa.uit.edu.vn`); 372 of 372 codes.
 * A university not listed here shows no attribution (it has no course-level data of this kind).
 */
export interface CourseDataSource {
    /** The official host the data comes from (shown as text, never as a link). */
    host: string
    /** An unofficial copy the data was collected through, when not collected from `host` itself. */
    via?: string
}

export const COURSE_DATA_SOURCES: ReadonlyMap<string, CourseDataSource> = new Map([
    ["FPT", { host: "flm.fpt.edu.vn", via: "syllabase.online" }],
    ["NEU", { host: "courses.neu.edu.vn" }],
    ["TDTU", { host: "cktt-cdr.tdtu.edu.vn" }],
    ["UIT", { host: "daa.uit.edu.vn" }],
])

export const courseDataSource = (universityCode: string | null | undefined) => COURSE_DATA_SOURCES.get(universityCode ?? "")
