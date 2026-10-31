"use client"

import { ExternalLink } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { displayMethod, formatAdmissionNumber } from "@/lib/admissions-display"
import { urlHost } from "@/lib/safe-url"
import type { AdmissionScore } from "../types"

/**
 * A scope label of a merged entry with only what its own rows carry: their combo notes, their source URLs and,
 * for rows bound to a program (group/campus rows with a programId), the names of those listed programs.
 */
export interface ThresholdScope {
    label: string | null
    notes: string[]
    sources: string[]
    programs: string[]
}

/** One school/group/campus threshold: rows equal in value merged, every label kept. */
export interface ThresholdEntry {
    method: string
    methodLabel: string | null
    year: number
    kind: string
    scope: string
    score: number
    scopes: ThresholdScope[]
}

export interface UniversityThresholds {
    code: string
    name: string
    entries: ThresholdEntry[]
}

/**
 * School/group/campus thresholds of one university at `scale`: rows outside the program scope that the score
 * filter never reads — `programId: null` rows (aggregate records by design), plus (v2.58) group/campus rows bound
 * to a listed program (`listed`: id → name) that has no program-scope cutoff at this scale, i.e. a program the
 * filter cannot test. The newest year per method only (method codes compared by `displayMethod`, so NEU
 * `thpt_2025`/`thpt_2026` are one method); rows equal in (raw method, year, kind, scope, score) merged into one
 * entry listing every scope label — each label keeps only the notes, sources and programs of its own rows (a
 * condition or source of one group must not read as applying to another). Information only: the score filter's
 * eligibility map never reads these rows.
 */
export function schoolThresholds(
    scores: AdmissionScore[],
    scale: number,
    listed: ReadonlyMap<string, string> = new Map()
): ThresholdEntry[] {
    const tested = new Set(
        scores
            .filter((s) => s.scope === "program" && s.kind === "cutoff" && s.programId && typeof s.score === "number" && s.scale === scale)
            .map((s) => s.programId)
    )
    const rows = scores.filter(
        (s) =>
            s.scope !== "program" &&
            typeof s.score === "number" &&
            s.scale === scale &&
            (s.programId == null || (listed.has(s.programId) && !tested.has(s.programId)))
    )
    const newest = new Map<string, number>()
    for (const s of rows) {
        const method = displayMethod(s)
        newest.set(method, Math.max(newest.get(method) ?? -Infinity, s.year))
    }
    const entries = new Map<string, ThresholdEntry>()
    for (const s of rows) {
        if (s.year !== newest.get(displayMethod(s))) continue
        const method = s.method ?? ""
        const key = [method, s.year, s.kind, s.scope, s.score].join("|")
        let e = entries.get(key)
        if (!e) {
            e = { method, methodLabel: s.methodLabel, year: s.year, kind: s.kind, scope: s.scope, score: s.score, scopes: [] }
            entries.set(key, e)
        }
        e.methodLabel ||= s.methodLabel
        const label = s.scopeLabel || null
        let scope = e.scopes.find((x) => x.label === label)
        if (!scope) {
            scope = { label, notes: [], sources: [], programs: [] }
            e.scopes.push(scope)
        }
        if (s.comboNote && !scope.notes.includes(s.comboNote)) scope.notes.push(s.comboNote)
        if (s.sourceUrl && !scope.sources.includes(s.sourceUrl)) scope.sources.push(s.sourceUrl)
        const name = s.programId ? listed.get(s.programId) : undefined
        if (name && !scope.programs.includes(name)) scope.programs.push(name)
    }
    return [...entries.values()].sort((a, b) => b.year - a.year || a.score - b.score)
}

/** Collapsed per-university list of school/group/campus thresholds at the selected scale. */
export function ScoreThresholds({ scale, universities }: { scale: number; universities: UniversityThresholds[] }) {
    const t = useTranslations("programs")
    const locale = useLocale()
    if (universities.length === 0) return null
    const num = (n: number) => formatAdmissionNumber(n, locale)

    const kindLabel = (kind: string) =>
        kind === "cutoff"
            ? t("admissionKindCutoff")
            : kind === "floor"
              ? t("admissionKindFloor")
              : kind === "converted"
                ? t("admissionKindConverted")
                : kind
    const scopeName = (scope: string) =>
        scope === "school"
            ? t("admissionScopeSchool")
            : scope === "group"
              ? t("admissionScopeGroup")
              : scope === "campus"
                ? t("admissionScopeCampus")
                : scope

    // Source line of one label (or of the whole entry when every label has the same sources): http(s) links only.
    const sourceLine = (sources: string[]) => {
        const links = sources
            .map((url) => ({ url, host: urlHost(url) }))
            .filter((l): l is { url: string; host: string } => !!l.host)
        return (
            <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                {links.length > 0 ? (
                    <>
                        {t("admissionSourceLabel")}:
                        {links.map((l) => (
                            <a
                                key={l.url}
                                href={l.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-primary hover:underline"
                            >
                                {l.host}
                                <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                        ))}
                    </>
                ) : (
                    <span className="italic">{t("admissionNoSource")}</span>
                )}
            </p>
        )
    }

    return (
        <div data-testid="score-thresholds" className="space-y-2 border-t border-border/60 pt-3">
            <h3 className="text-xs font-semibold">{t("scoreThresholdsTitle", { scale: num(scale) })}</h3>
            <p className="text-[11px] text-muted-foreground">{t("scoreThresholdsNote")}</p>
            <div className="space-y-1.5">
                {universities.map((u) => (
                    <details
                        key={u.code}
                        data-testid="score-thresholds-uni"
                        data-university={u.code}
                        className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
                    >
                        <summary className="cursor-pointer text-xs font-semibold break-words">
                            {u.name} · {t("scoreThresholdsCount", { count: u.entries.length })}
                        </summary>
                        <ul className="mt-2 space-y-2">
                            {u.entries.map((e) => {
                                const sameSources = new Set(e.scopes.map((sc) => sc.sources.join("\n"))).size === 1
                                return (
                                    <li
                                        key={`${e.method}|${e.year}|${e.kind}|${e.scope}|${e.score}`}
                                        data-testid="score-threshold-entry"
                                        data-method={e.method}
                                        data-year={e.year}
                                        data-kind={e.kind}
                                        data-score={e.score}
                                        data-scope={e.scope}
                                        className="min-w-0 space-y-0.5 text-xs break-words"
                                    >
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                            <span className="font-mono font-bold text-primary">
                                                {num(e.score)}/{num(scale)}
                                            </span>
                                            <Badge variant="outline" data-testid="score-threshold-kind" className="text-[10px]">
                                                {kindLabel(e.kind)}
                                            </Badge>
                                            <span className="text-muted-foreground">{e.year}</span>
                                        </div>
                                        {e.methodLabel && <p className="text-muted-foreground">{e.methodLabel}</p>}
                                        {e.scopes.map((sc) => (
                                            <div key={sc.label ?? ""} data-testid="score-threshold-scope" className="min-w-0">
                                                <p>
                                                    {scopeName(e.scope)}
                                                    {sc.label && `: ${sc.label}`}
                                                </p>
                                                {sc.programs.length > 0 && (
                                                    <p data-testid="score-threshold-programs" className="text-[11px] text-muted-foreground">
                                                        {t("scoreThresholdsPrograms", { names: sc.programs.join(" · ") })}
                                                    </p>
                                                )}
                                                {sc.notes.map((n) => (
                                                    <p key={n} className="text-[11px] italic text-muted-foreground">
                                                        {n}
                                                    </p>
                                                ))}
                                                {!sameSources && sourceLine(sc.sources)}
                                            </div>
                                        ))}
                                        {sameSources && sourceLine(e.scopes[0]?.sources ?? [])}
                                    </li>
                                )
                            })}
                        </ul>
                    </details>
                ))}
            </div>
        </div>
    )
}
