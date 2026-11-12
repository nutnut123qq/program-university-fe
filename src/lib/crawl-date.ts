/**
 * The collection ("crawl") date on the v2.73 surfaces (AGENTS.md §9): the program card, each compare column, the
 * analytics page and its downloads, and the course-data attribution line (roadmap, syllabus modal, materials).
 * Not on it yet: the detail dialog (`formatDate`, browser time zone + the time) and the program page (`isoDate` in
 * program-snapshot.ts) still print `lastCrawled` on their own, and `isoDate` falls back to the written day where this
 * helper returns none (Someday v2.73).
 *
 * Accepted, over the whole string: `YYYY-MM-DD`, or `YYYY-MM-DDThh:mm[:ss[.fraction]]` with an optional offset `Z`,
 * `±hh`, `±hhmm` or `±hh:mm` (at most 14:00). The date and time must exist (no rollover: 2026-02-30 and 25:00 are none)
 * and the year must be 1000 or later (an earlier year is no crawl date: none, not padded). With an offset → the
 * Asia/Ho_Chi_Minh day of that instant (the program page's rule); without → the day as written. Anything else → null,
 * and the caller prints "not recorded" — never "Invalid Date". Format: vi DD/MM/YYYY, other locales YYYY-MM-DD
 * (DataAttribution's, v2.56).
 */

const SHAPE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/
const VN_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" })

/** Offset in minutes east of UTC ("Z", "+07", "+0700", "+07:00"); null beyond ±14:00 or with minutes ≥ 60. */
function offsetMinutes(off: string): number | null {
    if (off === "Z") return 0
    const hours = Number(off.slice(1, 3))
    const minutes = off.length > 3 ? Number(off.slice(-2)) : 0
    if (minutes >= 60 || hours * 60 + minutes > 14 * 60) return null
    return (off[0] === "-" ? -1 : 1) * (hours * 60 + minutes)
}

/** "YYYY-MM-DD", the Vietnam calendar day of an ISO date or timestamp; null when the value is not one (see above). */
export function collectedIsoDay(value: string | null | undefined): string | null {
    const m = SHAPE.exec(value ?? "")
    if (!m) return null
    const [, y, mo, d, hh = "00", mi = "00", ss = "00", off] = m
    const [year, month, day, hour, minute, second] = [y, mo, d, hh, mi, ss].map(Number)
    if (year < 1000) return null
    // The written fields must survive a round trip (Date.UTC rolls 02-30 over to 03-02 and 25:00 to the next day).
    const at = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    if (
        at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day ||
        at.getUTCHours() !== hour || at.getUTCMinutes() !== minute || at.getUTCSeconds() !== second
    )
        return null
    if (off === undefined) return `${y}-${mo}-${d}`
    const shift = offsetMinutes(off)
    if (shift === null) return null
    const part = Object.fromEntries(VN_DAY.formatToParts(new Date(at.getTime() - shift * 60_000)).map((p) => [p.type, p.value]))
    return `${part.year}-${part.month}-${part.day}`
}

/** The collection day in the page locale (vi DD/MM/YYYY, otherwise YYYY-MM-DD); null when there is none. */
export function collectedDay(value: string | null | undefined, locale: string): string | null {
    const day = collectedIsoDay(value)
    if (!day) return null
    return locale === "vi" ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : day
}
