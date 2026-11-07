/**
 * The cohort codes of a program (v2.68, audit M44), read from its code or name, letter case ignored. FPT writes a cohort
 * as "K" + 2 digits + a class letter A–D ("BIT_AI_K16B"; "BCH_CL_K22" without a letter) and a curriculum shared by two
 * cohorts as a span whose later cohorts may drop their "K" or sit right after the class letter: "K15D, K16A",
 * "K16DK17A" (32 codes), "K18D19A", "K18D-19A", "K22D_23A", "K17D 18A", "K16D,17A" — once with no "K" at all,
 * "BJP_18D19A". So a span starts at a "K" + exactly 2 digits not glued to a letter or digit before it (or at two
 * "<2 digits><class letter>" right after "_"), and every 2-digit group of the span is a cohort (fix r1: the r0 rule read
 * only the "K" tokens and missed a cohort in 68 programs, incl. the 3 of K23). A "K" followed by more digits is an
 * admission code (TDTU "K7340101L"), not a cohort. The list's cohort filter (api.ts) reads this;
 * scripts/build-cohort-options.mjs keeps the same regex for the options (src/lib/cohort-options.json).
 */
// shortcut: only the shapes above are read ("K17C trở đi" = "from K17C on" and "từ K16B" = "from K16B" read their first
// cohort only); docs/_coord/round103/tools/measure_cohorts_r1.mjs lists every code shape — rerun it when codes change.
const SPAN = /(?<![0-9a-z])k\d{2}(?![0-9])[a-d]?(?:(?:[-_ ]|, ?)?k?\d{2}[a-d](?![0-9]))*|(?<=_)\d{2}[a-d](?:(?:[-_ ]|, ?)?\d{2}[a-d](?![0-9]))+/gi

export const cohortsOf = (code: string | null | undefined, name: string | null | undefined): string[] => [
    ...new Set([...`${code ?? ""} ${name ?? ""}`.matchAll(SPAN)].flatMap((m) => (m[0].match(/\d{2}/g) ?? []).map((d) => `K${d}`))),
]
