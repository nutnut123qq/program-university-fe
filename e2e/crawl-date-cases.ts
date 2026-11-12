/**
 * v2.73 FIX r1 (pre-review panel MINOR 3): the specs' own statement of the collection-day contract — NOT a copy of
 * src/lib/crawl-date.ts (no shared regex, no expected value derived from a rule).
 * - EDGE_CASES: hand-written inputs, each with its literal expected text (vi, en; null = "not recorded").
 * - snapshotDay(): the Vietnam day of a value the snapshot holds today, by UTC + 7 h arithmetic. It accepts only the two
 *   shapes in the data (`…+07:00` programs' lastCrawled, `…Z` FPT syllabi's lastSeenAt) and null/undefined, and throws on
 *   anything else, so a new shape in the data stops the spec instead of being judged by a copied rule.
 * Read by e2e/v273-crawl-date-surfaces.spec.ts and docs/_coord/round108/tools/mutation_helper.mjs (helper mutations A, B).
 */

/** [input, vi, en, why] — vi DD/MM/YYYY, en YYYY-MM-DD, null = none. */
export const EDGE_CASES: [string | null | undefined, string | null, string | null, string][] = [
    [null, null, null, "null"],
    [undefined, null, null, "undefined"],
    ["", null, null, "empty"],
    ["not a date", null, null, "text"],
    ["2026-06-25", "25/06/2026", "2026-06-25", "a bare date: as written"],
    ["2024-02-29", "29/02/2024", "2024-02-29", "a leap day"],
    ["2026-06-25T04:12", "25/06/2026", "2026-06-25", "no seconds, no offset: as written"],
    ["2026-06-25T04:12:00", "25/06/2026", "2026-06-25", "no offset: as written"],
    ["2026-06-25T12:00:00.123456+07:00", "25/06/2026", "2026-06-25", "microseconds +07:00 (the data's shape)"],
    ["2026-06-25T01:01:41.317998+07:00", "25/06/2026", "2026-06-25", "+07:00 before 07:00 (the UTC day is the 24th)"],
    ["2026-06-24T18:30:00Z", "25/06/2026", "2026-06-25", "Z: 01:30 the next day in Vietnam"],
    ["2026-06-24T16:59:59.999Z", "24/06/2026", "2026-06-24", "Z: 23:59:59 in Vietnam"],
    ["2026-06-24T17:00:00Z", "25/06/2026", "2026-06-25", "Z: midnight in Vietnam"],
    ["2026-06-25T00:30:00+09:00", "24/06/2026", "2026-06-24", "+09:00: 22:30 the day before in Vietnam"],
    ["2026-06-25T00:30:00+0900", "24/06/2026", "2026-06-24", "+0900"],
    ["2026-06-25T00:30:00+09", "24/06/2026", "2026-06-24", "+09 (hours only)"],
    ["2026-12-31T20:00:00-05:00", "01/01/2027", "2027-01-01", "-05:00 across a year end"],
    ["2026-07-05T05:03:31.115Z", "05/07/2026", "2026-07-05", "an FPT lastSeenAt"],
    ["2026-13-01", null, null, "month 13"],
    ["2026-13-01T00:00:00+07:00", null, null, "month 13 with a time"],
    ["2026-02-30", null, null, "30 February"],
    ["2026-02-29", null, null, "29 February in a common year"],
    ["2026-02-30T10:00:00+07:00", null, null, "30 February with a time (V8 would roll it to 2 March)"],
    ["2026-06-25T25:00:00", null, null, "hour 25"],
    ["2026-06-25T24:00:00+07:00", null, null, "hour 24"],
    ["2026-06-25T23:60:00Z", null, null, "minute 60"],
    ["2026-06-25junk", null, null, "trailing text"],
    ["2026-06-19T17:00:00Z\n", null, null, "trailing newline"],
    [" 2026-06-19", null, null, "leading space"],
    ["2026-06-24T18:30:00z", null, null, "a lowercase z"],
    ["2026-06-25T00:30:00+15:00", null, null, "an offset beyond 14:00"],
    ["2026-06-25T00:30:00+09:0", null, null, "a 3-digit offset"],
    ["0999-06-09", null, null, "a year before 1000"],
    ["10000-01-01", null, null, "a 5-digit year"],
]

/** The Vietnam day ("YYYY-MM-DD") of a value the snapshot holds today; throws on any other shape (see above). */
export function snapshotDay(v: unknown): string | null {
    if (v === null || v === undefined) return null
    if (typeof v !== "string" || !(v.endsWith("+07:00") || v.endsWith("Z")) || Number.isNaN(Date.parse(v)))
        throw new Error(`a snapshot value of an unexpected shape: ${JSON.stringify(v)} — add it to EDGE_CASES first`)
    return new Date(Date.parse(v) + 7 * 3_600_000).toISOString().slice(0, 10)
}

/** "YYYY-MM-DD" as the page prints it: vi DD/MM/YYYY, en as is. */
export const shownDay = (locale: "vi" | "en", day: string) => (locale === "vi" ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : day)
