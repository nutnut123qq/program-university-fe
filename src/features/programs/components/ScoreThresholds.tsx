"use client"

import { ExternalLink } from "lucide-react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import type { AdmissionScore } from "../types"

/** A scope label of a merged entry with only the notes of its own rows. */
export interface ThresholdScope {
    label: string | null
    notes: string[]
}

/** One school/group threshold: rows equal in value merged, every label kept. */
export interface ThresholdEntry {
    method: string
    methodLabel: string | null
    year: number
    kind: string
    scope: string
    score: number
    scopes: ThresholdScope[]
    sources: string[]
}

export interface UniversityThresholds {
    code: string
    name: string
    entries: ThresholdEntry[]
}

/**
 * School/group thresholds of one university at `scale`: rows with
 * `programId: null` outside the program scope (aggregate records by design —
 * never given a programId), the newest year per method code only, rows equal
 * in (method, year, kind, scope, score) merged into one entry that lists every
 * scope label — each label keeps only the combo notes of its own rows (a
 * condition of one group must not read as applying to another). Information
 * only: the score filter's eligibility map never reads these rows.
 */
export function schoolThresholds(scores: AdmissionScore[], scale: number): ThresholdEntry[] {
    const rows = scores.filter(
        (s) => s.programId == null && s.scope !== "program" && typeof s.score === "number" && s.scale === scale
    )
    const newest = new Map<string, number>()
    for (const s of rows) {
        const method = s.method ?? ""
        newest.set(method, Math.max(newest.get(method) ?? -Infinity, s.year))
    }
    const entries = new Map<string, ThresholdEntry>()
    for (const s of rows) {
        const method = s.method ?? ""
        if (s.year !== newest.get(method)) continue
        const key = [method, s.year, s.kind, s.scope, s.score].join("|")
        let e = entries.get(key)
        if (!e) {
            e = { method, methodLabel: s.methodLabel, year: s.year, kind: s.kind, scope: s.scope, score: s.score, scopes: [], sources: [] }
            entries.set(key, e)
        }
        e.methodLabel ||= s.methodLabel
        const label = s.scopeLabel || null
        let scope = e.scopes.find((x) => x.label === label)
        if (!scope) {
            scope = { label, notes: [] }
            e.scopes.push(scope)
        }
        if (s.comboNote && !scope.notes.includes(s.comboNote)) scope.notes.push(s.comboNote)
        if (s.sourceUrl && !e.sources.includes(s.sourceUrl)) e.sources.push(s.sourceUrl)
    }
    return [...entries.values()].sort((a, b) => b.year - a.year || a.score - b.score)
}

/** Hostname of an http(s) URL; null for any other scheme or a bad URL (no link then). */
function webHost(url: string): string | null {
    try {
        const u = new URL(url)
        return u.protocol === "http:" || u.protocol === "https:" ? u.hostname.replace(/^www\./, "") : null
    } catch {
        return null
    }
}

/** Collapsed per-university list of school/group thresholds at the selected scale. */
export function ScoreThresholds({ scale, universities }: { scale: number; universities: UniversityThresholds[] }) {
    const t = useTranslations("programs")
    if (universities.length === 0) return null

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

    return (
        <div data-testid="score-thresholds" className="space-y-2 border-t border-border/60 pt-3">
            <h3 className="text-xs font-semibold">{t("scoreThresholdsTitle", { scale })}</h3>
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
                                const links = e.sources
                                    .map((url) => ({ url, host: webHost(url) }))
                                    .filter((l): l is { url: string; host: string } => !!l.host)
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
                                                {Number(e.score.toFixed(2))}/{scale}
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
                                                {sc.notes.map((n) => (
                                                    <p key={n} className="text-[11px] italic text-muted-foreground">
                                                        {n}
                                                    </p>
                                                ))}
                                            </div>
                                        ))}
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
