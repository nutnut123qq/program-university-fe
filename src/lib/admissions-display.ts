/**
 * Display rules for admissions numbers and method codes (v2.58), shared by the program dialog, the
 * score-filter block and line, the score-filter card hint and compare; since v2.60 also the dialog's row
 * selection and labels, which the server-rendered program page reuses.
 * Display only: the data and the score filter's eligibility are untouched.
 */
import type { AdmissionData, TuitionRecord } from "@/features/programs/types"

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

/**
 * A quota's split by method as "<key>: <share>%" entries joined by " · ", or null when nothing is printable (v2.67, audit
 * 2026-11-05 M1) — the one reader of `methodSplit` for the program dialog and compare. The field holds many shapes (method
 * descriptions, program codes, combo lists, URLs, a whole string, nested objects, seat counts, fractions); an entry is
 * printed only when its unit follows from the row itself: two or more numeric entries whose sum is 1 (fractions), 100
 * (percents) or the row's quota (seat counts). Every other entry, and every entry of a split whose numbers do not add up
 * to one of those wholes, is not printed. Keys are printed as stored.
 * shortcut: the wholes are tried in the order 1, 100, quota, so a sum within 0.01 of 1 reads as fractions (even a percent
 * split totalling 1 %) and a sum within 1 of 100 reads as percents (even seat counts whose quota is that sum, e.g. 99 or
 * 101 seats); 0 such rows today (round102 S2_methodsplit_numbers.log) — try the quota first if such data appears.
 */
export function quotaMethodSplitText(q: { quota: number | null; methodSplit: unknown }, locale: string): string | null {
    const ms = q.methodSplit
    if (!ms || typeof ms !== "object" || Array.isArray(ms)) return null
    const nums = Object.entries(ms).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]) && e[1] >= 0)
    if (nums.length < 2) return null
    const sum = nums.reduce((s, [, v]) => s + v, 0)
    const whole = Math.abs(sum - 1) <= 0.01 ? 1 : Math.abs(sum - 100) <= 1 ? 100 : q.quota != null && q.quota > 0 && sum === q.quota ? q.quota : null
    if (whole === null) return null
    return nums.map(([k, v]) => `${k}: ${formatAdmissionNumber((v / whole) * 100, locale)}%`).join(" · ")
}

/** Rows whose year is the newest of their method (`displayMethod`): the v2.58 threshold rule, shared with the program page (v2.60). */
export function newestPerMethod<R extends { method: string | null; year: number }>(rows: R[]): R[] {
    const newest = new Map<string, number>()
    for (const r of rows) newest.set(displayMethod(r), Math.max(newest.get(displayMethod(r)) ?? -Infinity, r.year))
    return rows.filter((r) => r.year === newest.get(displayMethod(r)))
}

/**
 * The admission rows shown for one program — the program dialog's selection, shared with the program page (v2.60).
 * Own rows: `programId` is the program (any scope: per-campus/group rows bound to it are its data). Context rows:
 * `programId` null outside the program scope (school/group/campus aggregates, never fanned out), shown apart and
 * labelled by scope so they never read as per-program data. Scores and quotas newest year first.
 */
export function admissionsForProgram(admissions: AdmissionData, pid: string) {
    const programScores = admissions.scores.filter((s) => s.programId === pid).sort((a, b) => b.year - a.year)
    const programQuotas = admissions.quotas.filter((q) => q.programId === pid).sort((a, b) => b.year - a.year)
    const programTuitions = admissions.tuitions.filter((x) => x.programId === pid)
    const contextScores = admissions.scores
        .filter((s) => s.programId === null && s.scope !== "program")
        .sort((a, b) => b.year - a.year)
    const contextQuotas = admissions.quotas
        .filter((q) => q.programId === null && q.scope !== "program")
        .sort((a, b) => b.year - a.year)
    const contextTuitions = admissions.tuitions.filter((x) => x.programId === null)
    const isEmpty =
        programScores.length === 0 &&
        contextScores.length === 0 &&
        programQuotas.length === 0 &&
        contextQuotas.length === 0 &&
        programTuitions.length === 0 &&
        contextTuitions.length === 0
    return { programScores, contextScores, programQuotas, contextQuotas, programTuitions, contextTuitions, isEmpty }
}

/** A lookup in the `programs` messages: `useTranslations("programs")` on the client, `getTranslations` on the server. */
type ProgramsT = (key: string) => string

/** Kind of a score row: floor, converted, anything else a cutoff. */
export function admissionKindText(t: ProgramsT, kind: string): string {
    return t(kind === "floor" ? "admissionKindFloor" : kind === "converted" ? "admissionKindConverted" : "admissionKindCutoff")
}

/** Scope of a row: the scope's name, then the row's own label — once when the label already spells out the scope. */
export function admissionScopeText(t: ProgramsT, scope: string, scopeLabel: string | null): string {
    const base = t(
        scope === "campus"
            ? "admissionScopeCampus"
            : scope === "group"
              ? "admissionScopeGroup"
              : scope === "school"
                ? "admissionScopeSchool"
                : "admissionScopeProgram"
    )
    if (!scopeLabel) return base
    // Avoid "Toàn trường: Toàn trường" when the label already spells out the scope.
    if (scopeLabel.trim().toLowerCase() === base.trim().toLowerCase()) return scopeLabel
    return scope === "campus" ? `${base} ${scopeLabel}` : `${base}: ${scopeLabel}`
}

/** Basis of a tuition amount; an unknown basis is printed as stored. */
export function tuitionBasisText(t: ProgramsT, basis: string): string {
    return basis === "per_credit"
        ? t("tuitionBasisPerCredit")
        : basis === "per_semester"
          ? t("tuitionBasisPerSemester")
          : basis === "per_year"
            ? t("tuitionBasisPerYear")
            : basis === "per_program"
              ? t("tuitionBasisPerProgram")
              : basis
}

function formatMoney(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(amount)
    } catch {
        return `${amount.toLocaleString("vi-VN")} ${currency}`
    }
}

/** A tuition row's amount (or range / bound), or null when it has none. */
export function tuitionAmountText(x: TuitionRecord): string | null {
    if (x.amount != null) return formatMoney(x.amount, x.currency)
    if (x.minAmount != null && x.maxAmount != null) return `${formatMoney(x.minAmount, x.currency)} – ${formatMoney(x.maxAmount, x.currency)}`
    if (x.minAmount != null) return `≥ ${formatMoney(x.minAmount, x.currency)}`
    if (x.maxAmount != null) return `≤ ${formatMoney(x.maxAmount, x.currency)}`
    return null
}
