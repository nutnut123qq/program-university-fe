type Translate = (key: "semesterN" | "semesterPrep" | "gpaSemesterUnknown", values?: { n: number }) => string

/** Semesters ascending, "not specified" (null) last — the GPA tab's grouping and the curriculum filter's options. */
export const compareSemesters = (a: number | null, b: number | null) => (a == null ? 1 : b == null ? -1 : a - b)

/** A semester as a select value ("none" = not specified). */
export const semesterKey = (s: number | null) => (s == null ? "none" : String(s))

/**
 * A curriculum semester as a label (`programs` messages). A stored semester ≤ 0 (FPT only, measured v2.59: orientation,
 * preparation English, …) is FPT's "preparation phase" — its own wording — with the stored term number kept, so the
 * terms stay distinct and none is renumbered.
 */
export const semesterLabel = (t: Translate, n: number | null) =>
    n == null ? t("gpaSemesterUnknown") : n <= 0 ? t("semesterPrep", { n }) : t("semesterN", { n })
