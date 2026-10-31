/**
 * Display rules for admissions numbers and method codes (v2.58), shared by the program dialog, the
 * score-filter block and line, the score-filter card hint and compare (V6's program page reuses them).
 * Display only: the data and the score filter's eligibility are untouched.
 */

/**
 * Every cutoff score, scale and admissions count on those surfaces: the page locale's digits and grouping,
 * at most 2 decimals (the data has ≤ 2), no padded zeros — vi "18,5" / "1.200", en "18.5" / "1,200".
 * `signed` adds "+" to a positive difference (a zero stays "0"). A count that drives an ICU plural stays
 * a number for the message; ICU prints it with Intl.NumberFormat(locale) — the same text for an integer.
 */
export function formatAdmissionNumber(value: number, locale: string, signed = false): string {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, signDisplay: signed ? "exceptZero" : "auto" }).format(value)
}

/**
 * A method code with a trailing "_<the row's own year>" removed (NEU publishes `thpt_2025` / `thpt_2026`), so the
 * "newest year per method" rule sees one method. Only that exact suffix is removed: `thpt_100` stays as it is.
 */
export function displayMethod(row: { method: string | null; year: number }): string {
    const method = row.method ?? ""
    const suffix = `_${row.year}`
    return method.endsWith(suffix) ? method.slice(0, -suffix.length) : method
}
