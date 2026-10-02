"use client"

import { Loader2, RotateCcw, Target } from "lucide-react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectItem } from "@/components/ui/select"

export interface ScoreFilterMethodOption {
    value: string
    label: string
}

interface ScoreFilterProps {
    /** Raw text of the "my score" input. */
    score: string
    onScoreChange: (value: string) => void
    /** Scales discovered in the admissions data (never hardcoded). */
    scales: number[]
    scale: number | null
    onScaleChange: (scale: number) => void
    /** Methods discovered for the selected scale; "" = all methods. */
    methods: ScoreFilterMethodOption[]
    method: string
    onMethodChange: (method: string) => void
    /** True while the admission snapshots are being fetched lazily. */
    loading: boolean
    /** True once admission snapshots finished loading (even if all empty). */
    dataLoaded: boolean
    /** Filtered program count while active; null while still computing. */
    resultCount: number | null
    onClear: () => void
}

/**
 * "Filter by cutoff score" block for the program catalog.
 * Presentational only — ProgramList owns state and the matching logic.
 * IMPORTANT semantics (SPEC-ADMISSION-DATA): a user score is only ever
 * compared against admission rows with the SAME scale. Nothing here does
 * cross-scale conversion or ranking.
 */
export function ScoreFilter({
    score,
    onScoreChange,
    scales,
    scale,
    onScaleChange,
    methods,
    method,
    onMethodChange,
    loading,
    dataLoaded,
    resultCount,
    onClear,
}: ScoreFilterProps) {
    const t = useTranslations("programs")
    const hasInput = score.trim() !== ""

    return (
        <section
            data-testid="score-filter"
            className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5 space-y-4"
        >
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Target className="h-4 w-4 text-primary shrink-0" />
                    <h2 className="text-sm font-semibold truncate">
                        {t("scoreFilterTitle")}
                    </h2>
                    {loading && (
                        <Loader2
                            data-testid="score-filter-loading"
                            className="h-4 w-4 animate-spin text-muted-foreground shrink-0"
                        />
                    )}
                </div>
                {hasInput && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClear}
                        data-testid="score-filter-clear"
                        className="h-8 text-xs font-semibold gap-1.5 text-primary hover:text-primary/80 hover:bg-primary/10 rounded-lg"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{t("scoreFilterClear")}</span>
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    data-testid="score-filter-input"
                    aria-label={t("scoreFilterPlaceholder")}
                    placeholder={t("scoreFilterPlaceholder")}
                    value={score}
                    onChange={(e) => onScoreChange(e.target.value)}
                    className="h-9 bg-card"
                />

                <Select
                    value={scale != null ? String(scale) : ""}
                    onValueChange={(v) => onScaleChange(Number(v))}
                    placeholder={t("scoreFilterScale")}
                    aria-label={t("scoreFilterScale")}
                >
                    {scales.map((s) => (
                        <SelectItem key={s} value={String(s)}>
                            {s}
                        </SelectItem>
                    ))}
                </Select>

                <Select
                    value={method}
                    onValueChange={onMethodChange}
                    placeholder={t("scoreFilterMethodAll")}
                    aria-label={t("scoreFilterMethodAll")}
                >
                    <SelectItem value="">{t("scoreFilterMethodAll")}</SelectItem>
                    {methods.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                            {m.label}
                        </SelectItem>
                    ))}
                </Select>
            </div>

            {hasInput && dataLoaded && !loading && scales.length === 0 && (
                <p
                    data-testid="score-filter-no-data"
                    className="text-xs text-muted-foreground italic"
                >
                    {t("scoreFilterNoData")}
                </p>
            )}

            {hasInput && (
                <p
                    data-testid="score-filter-note"
                    className="text-[11px] text-muted-foreground italic border-l-2 border-amber-400/70 pl-3"
                >
                    {t("scoreFilterSameScaleNote")}
                </p>
            )}

            {resultCount != null && (
                <p
                    data-testid="score-filter-result"
                    className="text-sm font-medium"
                >
                    {t("scoreFilterResult", {
                        count: resultCount,
                        score: score.trim(),
                    })}
                </p>
            )}
        </section>
    )
}
