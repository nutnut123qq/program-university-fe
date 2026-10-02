"use client"

import { useMemo } from "react"
import useSWR from "swr"
import dayjs from "dayjs"
import { useTranslations } from "next-intl"
import { AlertCircle, ExternalLink, GraduationCap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { fetchAdmissions, fetchUniversityCode } from "@/features/programs/api"
import { AdmissionQuota, AdmissionScore, Program, TuitionRecord } from "@/features/programs/types"

/**
 * Admission snapshot block rendered inside each side of ProgramComparison.
 * Mirrors the semantics of ProgramDetailDialog's admissions tab
 * (SPEC-ADMISSION-DATA): program rows are matched by programId; rows with
 * programId === null and scope !== "program" are CONTEXT rows (group /
 * school / campus) and are always labeled as such — never presented as
 * per-program data. Scores keep their native scale ("score / scale") and
 * kind label; nothing is normalized or ranked across the two sides.
 */

function hostnameOf(url: string | null | undefined): string | null {
    if (!url) return null
    try {
        return new URL(url).hostname.replace(/^www\./, "")
    } catch {
        return url
    }
}

function formatDateOnly(value: string | null | undefined): string | null {
    if (!value) return null
    const d = dayjs(value)
    return d.isValid() ? d.format("DD/MM/YYYY") : value
}

function formatDateTime(value: string | null | undefined): string | null {
    if (!value) return null
    const d = dayjs(value)
    return d.isValid() ? d.format("DD/MM/YYYY HH:mm") : value
}

function formatMoney(amount: number | null | undefined, currency: string): string | null {
    if (amount == null) return null
    try {
        return new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(amount)
    } catch {
        return `${amount.toLocaleString("vi-VN")} ${currency}`
    }
}

function RecordProvenance({
    sourceUrl,
    publishedAt,
    fetchedAt,
}: {
    sourceUrl: string | null
    publishedAt?: string | null
    fetchedAt?: string | null
}) {
    const t = useTranslations("programs")
    const domain = hostnameOf(sourceUrl)
    const publishedText = formatDateOnly(publishedAt)
    const fetchedText = formatDateTime(fetchedAt ?? null)
    return (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {sourceUrl && domain ? (
                <span className="inline-flex items-center gap-1">
                    {t("admissionSourceLabel")}:{" "}
                    <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        data-testid="admissions-source-link"
                    >
                        {domain}
                        <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                </span>
            ) : (
                <span className="italic">{t("admissionNoSource")}</span>
            )}
            {publishedText && (
                <span>
                    {t("admissionPublishedLabel")}: {publishedText}
                </span>
            )}
            {fetchedText && (
                <span>
                    {t("admissionFetchedLabel")}: {fetchedText}
                </span>
            )}
        </p>
    )
}

function BlockSection({
    title,
    isEmpty,
    emptyText,
    testId,
    children,
}: {
    title: string
    isEmpty: boolean
    emptyText: string
    testId: string
    children: React.ReactNode
}) {
    return (
        <div className="space-y-2" data-testid={testId}>
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h4>
            {isEmpty ? (
                <p className="text-xs text-muted-foreground italic" data-testid="compare-admissions-block-empty">
                    {emptyText}
                </p>
            ) : (
                <div className="space-y-2">{children}</div>
            )}
        </div>
    )
}

export function CompareAdmissions({ program }: { program: Program }) {
    const t = useTranslations("programs")

    // Program → universityId → universities.code → /mock/admissions/<CODE>.json
    const { data: uniCode, isLoading: codeLoading } = useSWR(
        program?.universityId ? ["university-code", program.universityId] : null,
        () => fetchUniversityCode(program.universityId)
    )
    const {
        data: admissions,
        error: admissionsError,
        isLoading: admissionsFetching,
    } = useSWR(
        program && uniCode ? ["admissions-cmp", uniCode] : null,
        () => fetchAdmissions(uniCode as string)
    )
    const loading = codeLoading || admissionsFetching

    const view = useMemo(() => {
        if (!admissions || !program) return null
        const pid = program.id
        // Rows bound to this program by programId.
        const programScores = admissions.scores.filter((s) => s.programId === pid)
        const programQuotas = admissions.quotas.filter((q) => q.programId === pid)
        const programTuitions = admissions.tuitions.filter((x) => x.programId === pid)
        // Context rows: never tied to a specific program — shown separately
        // and labeled by scope so they are never read as per-program data.
        const contextScores = admissions.scores.filter(
            (s) => s.programId === null && s.scope !== "program"
        )
        const contextQuotas = admissions.quotas.filter(
            (q) => q.programId === null && q.scope !== "program"
        )
        const contextTuitions = admissions.tuitions.filter((x) => x.programId === null)
        const isEmpty =
            programScores.length === 0 &&
            contextScores.length === 0 &&
            programQuotas.length === 0 &&
            contextQuotas.length === 0 &&
            programTuitions.length === 0 &&
            contextTuitions.length === 0
        return {
            programScores,
            contextScores,
            programQuotas,
            contextQuotas,
            programTuitions,
            contextTuitions,
            isEmpty,
        }
    }, [admissions, program])

    const kindLabel = (kind: string): string =>
        kind === "floor"
            ? t("admissionKindFloor")
            : kind === "converted"
                ? t("admissionKindConverted")
                : t("admissionKindCutoff")

    const scopeBadgeLabel = (scope: string, scopeLabel: string | null): string => {
        const base =
            scope === "campus"
                ? t("admissionScopeCampus")
                : scope === "group"
                    ? t("admissionScopeGroup")
                    : scope === "school"
                        ? t("admissionScopeSchool")
                        : t("admissionScopeProgram")
        if (!scopeLabel) return base
        if (scopeLabel.trim().toLowerCase() === base.trim().toLowerCase()) return scopeLabel
        return scope === "campus" ? `${base} ${scopeLabel}` : `${base}: ${scopeLabel}`
    }

    const basisLabel = (basis: string): string =>
        basis === "per_credit"
            ? t("tuitionBasisPerCredit")
            : basis === "per_semester"
                ? t("tuitionBasisPerSemester")
                : basis === "per_year"
                    ? t("tuitionBasisPerYear")
                    : basis === "per_program"
                        ? t("tuitionBasisPerProgram")
                        : basis

    const methodLabelFor = (methodKey: string): string => {
        const all = [...(view?.programScores ?? []), ...(view?.contextScores ?? [])]
        return all.find((s) => s.method === methodKey)?.methodLabel || methodKey
    }

    const scoreText = (s: AdmissionScore): string =>
        s.score == null ? "—" : Number.isInteger(s.score) ? String(s.score) : s.score.toFixed(2)


    const renderScoreRow = (s: AdmissionScore, i: number) => (
        <div
            key={`${s.method}-${s.scope}-${s.scopeLabel ?? ""}-${s.kind}-${s.score}-${i}`}
            className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5"
        >
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-black font-mono text-primary">
                    {scoreText(s)}
                    {s.scale != null && (
                        <span className="text-xs font-semibold text-muted-foreground"> / {s.scale}</span>
                    )}
                </span>
                <Badge variant="outline" className="text-[10px] font-semibold">
                    {kindLabel(s.kind)}
                </Badge>
                {(s.scope !== "program" || s.scopeLabel) && (
                    <Badge variant="secondary" className="text-[10px] font-semibold">
                        {scopeBadgeLabel(s.scope, s.scopeLabel)}
                    </Badge>
                )}
                {s.methodLabel && (
                    <span className="text-xs text-muted-foreground">{s.methodLabel}</span>
                )}
            </div>
            {s.comboNote && (
                <p className="text-[11px] text-muted-foreground italic">{s.comboNote}</p>
            )}
            <RecordProvenance sourceUrl={s.sourceUrl} publishedAt={s.publishedAt} fetchedAt={s.fetchedAt} />
        </div>
    )

    const renderQuotaRow = (q: AdmissionQuota, i: number) => (
        <div
            key={`${q.scope}-${q.scopeLabel ?? ""}-${q.quota}-${i}`}
            className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5"
        >
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-black font-mono text-foreground">
                    {q.quota != null ? q.quota.toLocaleString("vi-VN") : "—"}
                </span>
                <span className="text-xs text-muted-foreground">{t("admissionQuotaUnit")}</span>
                <Badge
                    variant={q.scope === "program" ? "outline" : "secondary"}
                    className="text-[10px] font-semibold"
                >
                    {scopeBadgeLabel(q.scope, q.scopeLabel)}
                </Badge>
                <span className="text-[11px] text-muted-foreground">{q.year}</span>
            </div>
            {q.scope !== "program" && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 italic">
                    {t("admissionQuotaScopedNote")}
                </p>
            )}
            {q.methodSplit && Object.keys(q.methodSplit).length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                    {Object.entries(q.methodSplit)
                        .map(([k, v]) => `${methodLabelFor(k)}: ${v}%`)
                        .join(" · ")}
                </p>
            )}
            <RecordProvenance sourceUrl={q.sourceUrl} publishedAt={q.publishedAt} fetchedAt={q.fetchedAt} />
        </div>
    )

    const renderTuitionRow = (x: TuitionRecord, i: number) => {
        const amountText =
            x.amount != null
                ? formatMoney(x.amount, x.currency)
                : x.minAmount != null && x.maxAmount != null
                    ? `${formatMoney(x.minAmount, x.currency)} – ${formatMoney(x.maxAmount, x.currency)}`
                    : x.minAmount != null
                        ? `≥ ${formatMoney(x.minAmount, x.currency)}`
                        : x.maxAmount != null
                            ? `≤ ${formatMoney(x.maxAmount, x.currency)}`
                            : null
        return (
            <div
                key={`${x.academicYear ?? ""}-${x.basis}-${x.appliesTo ?? ""}-${i}`}
                className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5"
            >
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-black text-foreground">
                        {amountText ?? "—"}
                        {amountText && x.basis && (
                            <span className="text-xs font-semibold text-muted-foreground"> {basisLabel(x.basis)}</span>
                        )}
                    </span>
                    {x.academicYear && (
                        <Badge variant="secondary" className="text-[10px] font-semibold">
                            {t("admissionAcademicYear")}: {x.academicYear}
                        </Badge>
                    )}
                    {x.programId === null && (
                        <Badge variant="secondary" className="text-[10px] font-semibold">
                            {t("admissionScopeSchool")}
                        </Badge>
                    )}
                </div>
                {x.appliesTo && (
                    <p className="text-[11px] text-muted-foreground">
                        {t("admissionAppliesTo")}: {x.appliesTo}
                    </p>
                )}
                {x.notes && (
                    <p className="text-[11px] text-muted-foreground italic">{x.notes}</p>
                )}
                <RecordProvenance sourceUrl={x.sourceUrl} publishedAt={x.publishedAt} fetchedAt={x.fetchedAt} />
            </div>
        )
    }

    return (
        <div className="pt-3 border-t space-y-3" data-testid="compare-admissions">
            <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">
                    {t("admissionsTitle", { year: admissions?.years?.[0] ?? 2025 })}
                </h3>
            </div>

            {loading && (
                <div className="space-y-2 animate-pulse" data-testid="compare-admissions-loading">
                    <div className="h-14 rounded-xl bg-muted/60" />
                    <div className="h-14 rounded-xl bg-muted/60" />
                </div>
            )}

            {!loading && admissionsError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {t("admissionsError")}
                </div>
            )}

            {!loading && !admissionsError && (!view || view.isEmpty) && (
                <p className="text-xs text-muted-foreground py-2" data-testid="compare-admissions-empty">
                    {t("noAdmissions")}
                </p>
            )}

            {!loading && !admissionsError && view && !view.isEmpty && (
                <div className="space-y-4">
                    <BlockSection
                        title={t("admissionScoresTitle")}
                        testId="compare-admissions-scores"
                        isEmpty={view.programScores.length === 0 && view.contextScores.length === 0}
                        emptyText={t("admissionsBlockEmpty")}
                    >
                        {view.programScores.map((s, i) => renderScoreRow(s, i))}
                        {view.contextScores.length > 0 && (
                            <div className="space-y-2 pt-1">
                                <p className="text-[11px] font-semibold text-muted-foreground">
                                    {t("admissionContextTitle")}
                                </p>
                                {view.contextScores.map((s, i) => renderScoreRow(s, i))}
                            </div>
                        )}
                    </BlockSection>

                    <BlockSection
                        title={t("admissionQuotasTitle")}
                        testId="compare-admissions-quotas"
                        isEmpty={view.programQuotas.length === 0 && view.contextQuotas.length === 0}
                        emptyText={t("admissionsBlockEmpty")}
                    >
                        {view.programQuotas.map((q, i) => renderQuotaRow(q, i))}
                        {view.contextQuotas.map((q, i) => renderQuotaRow(q, i))}
                    </BlockSection>

                    <BlockSection
                        title={t("admissionTuitionTitle")}
                        testId="compare-admissions-tuition"
                        isEmpty={view.programTuitions.length === 0 && view.contextTuitions.length === 0}
                        emptyText={t("admissionsBlockEmpty")}
                    >
                        {view.programTuitions.map((x, i) => renderTuitionRow(x, i))}
                        {view.contextTuitions.map((x, i) => renderTuitionRow(x, i))}
                    </BlockSection>

                    <p className="text-[11px] text-muted-foreground italic border-l-2 border-amber-400/70 pl-3">
                        {t("admissionsWarning")}
                    </p>
                </div>
            )}
        </div>
    )
}
