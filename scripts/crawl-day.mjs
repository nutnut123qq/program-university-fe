/**
 * crawl-day.mjs — the one guard the derived-file builds use for a program's lastCrawled (v2.73 FIX r1).
 *
 * The page prints collection days through src/lib/crawl-date.ts (TypeScript, not importable from these node scripts).
 * Instead of a second copy of its day rule, the builds accept only the shape the snapshot holds — a full timestamp with
 * a +07:00 offset — for which the written day IS the Asia/Ho_Chi_Minh day the helper prints and Date.parse reads one
 * unambiguous instant (no build-machine zone). null stays null; any other value stops the build.
 */

const VN_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?\+07:00$/

/** The written day ("YYYY-MM-DD") of a +07:00 lastCrawled, or null for null; throws on any other value. */
export function crawlDay(v) {
    if (v === null || v === undefined) return null
    if (typeof v !== "string" || !VN_STAMP.test(v) || Number.isNaN(Date.parse(v)))
        throw new Error(`lastCrawled ${JSON.stringify(v)} is not a +07:00 timestamp: its written day may not be the Vietnam day`)
    return v.slice(0, 10)
}
