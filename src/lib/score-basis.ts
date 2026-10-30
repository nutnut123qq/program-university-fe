type ScoreFields = { evaluationScore?: number | null; courseCount?: number | null; dataSufficiency?: string | null }

/**
 * "Enough data" for an SLM score: the program carries a score, has a course
 * list (without courses structure and knowledge blocks cannot be scored) and
 * is not marked dataSufficiency "insufficient" (PLO coverage < 50 %).
 * Only such a score is shown — dialog, compare (value + radar), chat context —
 * and only such programs count on the analytics page. Same rule as
 * scripts/build-analytics.mjs `enough` (plain node, keeps its own copy) and
 * exportUtils.ts `BASIS_RULE`.
 */
export const hasEnoughData = <T extends ScoreFields>(p: T): p is T & { evaluationScore: number } =>
    typeof p.evaluationScore === "number" && (p.courseCount ?? 0) > 0 && p.dataSufficiency !== "insufficient"
