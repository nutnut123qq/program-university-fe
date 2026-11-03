"use client"

import { useId, useMemo, useState } from "react"
import type { KeyboardEvent } from "react"
import dayjs from "dayjs"
import {
    BookOpen,
    Check,
    Loader2,
    X,
    Calendar,
    Link as LinkIcon,
    FileText,
    AlertCircle,
    ExternalLink,
    FileSpreadsheet,
    FileJson,
    Printer,
    Search,
    ChevronRight,
    GraduationCap,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useLocale, useTranslations } from "next-intl"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

import { fetchAdmissions, fetchCurricula, fetchProgramById, fetchRawDocuments, fetchUniversityCode } from "../api"
import { AdmissionQuota, AdmissionScore, Curriculum, Program, RawDocument, TuitionRecord } from "../types"
import { AunRadarChart, AunCriterionScore } from "@/components/common/AunRadarChart"
import { PrerequisiteGraph } from "./PrerequisiteGraph"
import { GpaPlanner } from "./GpaPlanner"
import { KnowledgeBlockBreakdown } from "./KnowledgeBlockBreakdown"
import { SyllabusDetailModal } from "./SyllabusDetailModal"
import { compareSemesters, semesterKey, semesterLabel } from "../semester"
import { ElectiveGroups } from "./ElectiveGroups"
import { exportProgramToCsv, exportProgramToJson } from "@/lib/exportUtils"
import { hasEnoughData } from "@/lib/score-basis"
import {
    admissionKindText,
    admissionScopeText,
    admissionsForProgram,
    formatAdmissionNumber,
    tuitionAmountText,
    tuitionBasisText,
} from "@/lib/admissions-display"
import { safeHttpUrl, urlHost } from "@/lib/safe-url"
import { buildTrendSeries, deltaVsPreviousYear } from "@/lib/admissionTrend"
import { ScoreTrendChart } from "./ScoreTrendChart"
import { SameMajorElsewhere } from "./SameMajorElsewhere"
import { WishlistButton } from "@/features/wishlist/WishlistButton"
import { programLinkUrl, programPagePath } from "../programLink"
import { useModalFocus } from "@/hooks/useModalFocus"
import { tabKeyTarget } from "@/lib/tab-keys"

interface ProgramDetailDialogProps {
    program: Program | null
    open: boolean
    onClose: () => void
}

type TabKey = "info" | "admissions" | "curriculum" | "graph" | "gpa" | "raw" | "eval"

function extractCohorts(code?: string | null, name?: string | null): string[] {
    const text = `${code || ""} ${name || ""}`
    const matches = text.match(/\bK\d{2}[A-D]?\b/gi)
    if (!matches) return []
    return Array.from(new Set(matches.map((m) => m.toUpperCase())))
}

function extractSpecialization(name?: string | null): string | null {
    if (!name) return null
    const m = name.match(/chuy[êe]n\s+ng[àa]nh\s+([^(_,\n]+)/i)
    if (m) return m[1].trim()
    return null
}

function formatDate(value: string | null): string | null {
    if (!value) return null
    const d = dayjs(value)
    return d.isValid() ? d.format("DD/MM/YYYY HH:mm") : value
}

function formatDateOnly(value: string | null | undefined): string | null {
    if (!value) return null
    const d = dayjs(value)
    return d.isValid() ? d.format("DD/MM/YYYY") : value
}

// v2.54: raw documents are shown as a short excerpt, never in full. The snapshot already
// cuts extractedText to this; a longer value (older mock, API mode) is cut here the same way.
const RAW_EXCERPT_MAX = 300

function rawExcerpt(text: string | null | undefined): string | null {
    const t = (text ?? "").replace(/\s+/g, " ").trim()
    if (!t) return null
    if (t.replace(/…$/, "").length <= RAW_EXCERPT_MAX) return t
    const cut = t.slice(0, RAW_EXCERPT_MAX)
    const end = cut.search(/\s\S*$/) // last word boundary inside the limit
    return `${(end > 0 ? cut.slice(0, end) : cut).trimEnd()}…`
}

/**
 * Per-record provenance line: real source domain link + published/fetched
 * timestamps. Missing sourceUrl → explicit "no published source" text,
 * never a fabricated domain.
 */
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
    const href = safeHttpUrl(sourceUrl)
    const publishedText = formatDateOnly(publishedAt)
    const fetchedText = formatDate(fetchedAt ?? null)
    return (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {href ? (
                <span className="inline-flex items-center gap-1">
                    {t("admissionSourceLabel")}:{" "}
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        data-testid="admissions-source-link"
                    >
                        {urlHost(href)}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">{title}</h4>
            {children}
        </div>
    )
}

function MetadataItem({
    label,
    children,
}: {
    label: string
    children: React.ReactNode
}) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-sm font-medium">{children ?? "—"}</span>
        </div>
    )
}

function TextBlock({ text }: { text: string | null }) {
    if (!text) return <p className="text-sm text-muted-foreground italic">—</p>
    return (
        <div className="text-sm text-foreground whitespace-pre-line bg-muted/40 rounded-lg p-3 wrap-anywhere">
            {text}
        </div>
    )
}

function CriterionItem({ title, score, description }: { title: string; score: number; description: string }) {
    return (
        <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
            <div className="flex items-center justify-between">
                <span className="font-semibold text-xs">{title}</span>
                <Badge variant="outline" className="font-mono text-xs font-bold text-emerald-500 bg-emerald-500/10 border-emerald-500/20">
                    {score.toFixed(1)} / 5.0
                </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
    )
}

export function ProgramDetailDialog({ program, open, onClose }: ProgramDetailDialogProps) {
    const t = useTranslations("programs")
    const ta = useTranslations("analytics")
    const locale = useLocale()
    const num = (n: number, signed = false) => formatAdmissionNumber(n, locale, signed)
    const [activeTab, setActiveTab] = useState<TabKey>("info")
    const [courseSearch, setCourseSearch] = useState("")
    const [semesterFilter, setSemesterFilter] = useState<string>("all")
    const [selectedCourseForSyllabus, setSelectedCourseForSyllabus] = useState<Curriculum | null>(null)
    const [linkCopied, setLinkCopied] = useState(false)
    // Escape runs onClose — the X button's path (v2.48: history.back() on an own entry).
    const boxRef = useModalFocus<HTMLDivElement>(open && !!program, onClose)
    const baseId = useId()
    const titleId = `${baseId}-title`
    const panelId = `${baseId}-panel`
    const tabId = (key: TabKey) => `${baseId}-tab-${key}`

    const copyLink = async () => {
        if (!program) return
        try {
            await navigator.clipboard.writeText(programLinkUrl(locale, program.id))
            setLinkCopied(true)
            window.setTimeout(() => setLinkCopied(false), 2000)
        } catch {
            // Clipboard unavailable (permissions/non-secure context): the label never claims a copy.
        }
    }

    const { data: courses, error, isLoading } = useSWR(
        program ? ["curricula", program.id] : null,
        () => (program ? fetchCurricula(program.id) : [])
    )

    // Elective groups live in the per-program detail payload
    // (/mock/programs-by-id/<pid>.json). Skip the extra fetch entirely when
    // the program object already carries the key.
    const { data: programDetail } = useSWR(
        open && program && !program.electiveGroups ? ["program-detail", program.id] : null,
        () => (program ? fetchProgramById(program.id) : null)
    )
    const electiveGroups = program?.electiveGroups ?? programDetail?.electiveGroups

    const { data: rawDocs, error: rawError, isLoading: rawLoading } = useSWR(
        program ? ["raw-documents", program.id] : null,
        () => (program ? fetchRawDocuments(program.id) : [])
    )

    // Admission snapshot (SPEC-ADMISSION-DATA §4): lazy fetch when the dialog
    // opens. Program → universityId → universities.code → /mock/admissions/<CODE>.json
    const { data: admissionsUniCode, isLoading: admissionsUniLoading } = useSWR(
        open && program?.universityId ? ["university-code", program.universityId] : null,
        () => (program ? fetchUniversityCode(program.universityId) : null)
    )
    const {
        data: admissions,
        error: admissionsError,
        isLoading: admissionsFetching,
    } = useSWR(
        open && program && admissionsUniCode ? ["admissions", admissionsUniCode] : null,
        () => fetchAdmissions(admissionsUniCode as string)
    )
    const admissionsLoading = admissionsUniLoading || admissionsFetching
    const [admissionMethod, setAdmissionMethod] = useState<string | null>(null)

    const admissionsView = useMemo(() => {
        if (!admissions || !program) return null
        // Own rows + context rows (school/group/campus), one rule with the program page (v2.60).
        const rows = admissionsForProgram(admissions, program.id)
        const methods: { key: string; label: string }[] = []
        for (const s of [...rows.programScores, ...rows.contextScores]) {
            // Key carries year: the same method_code exists in both 2024 and
            // 2025 snapshots and must not merge into one selector entry.
            // Year-first keeps the newest year as the default selection.
            const key = `${s.year}|${s.method}`
            if (!methods.some((m) => m.key === key)) {
                methods.push({ key, label: `${s.methodLabel || s.method} · ${s.year}` })
            }
        }
        methods.sort((a, b) => b.key.localeCompare(a.key))
        return { ...rows, methods }
    }, [admissions, program])

    // v1.3 trend: same-scale + same-method cutoff series, computed once for
    // the whole program — renderScoreRow only looks its series up, never
    // rebuilds per row.
    const scoreTrendSeries = useMemo(
        () => buildTrendSeries(admissionsView?.programScores ?? []),
        [admissionsView]
    )

    const activeAdmissionMethod =
        admissionMethod && admissionsView?.methods.some((m) => m.key === admissionMethod)
            ? admissionMethod
            : (admissionsView?.methods[0]?.key ?? null)

    const methodLabelFor = (methodKey: string): string =>
        admissionsView?.methods.find((m) => m.key === methodKey)?.label || methodKey

    const scoreText = (s: AdmissionScore): string =>
        s.score == null ? "—" : num(s.score)

    /**
     * v1.3 delta badge: this row's year vs the closest earlier year in ITS
     * (scale, method) series. Only rows buildTrendSeries would include can
     * carry a delta — context/floor/converted rows must never borrow a
     * program series that happens to share scale+method.
     */
    const trendDeltaBadge = (s: AdmissionScore) => {
        if (s.scope !== "program" || s.kind !== "cutoff") return null
        const series = scoreTrendSeries.find((v) => v.scale === s.scale && v.method === s.method)
        const d = series ? deltaVsPreviousYear(series, s.year) : null
        if (!d) return null
        const deltaText = num(d.delta, true)
        return (
            <Badge
                variant="outline"
                className={`text-[10px] font-mono font-bold ${
                    d.delta > 0
                        ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                        : d.delta < 0
                          ? "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/25"
                          : "text-muted-foreground"
                }`}
            >
                {t("trendDelta", { delta: deltaText, year: d.fromYear })}
            </Badge>
        )
    }

    const renderScoreRow = (s: AdmissionScore, i: number) => (
        <div
            key={`${s.method}-${s.scope}-${s.scopeLabel ?? ""}-${s.kind}-${s.score}-${i}`}
            className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5"
        >
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-black font-mono text-primary">
                    {scoreText(s)}
                    {s.scale != null && (
                        <span className="text-xs font-semibold text-muted-foreground"> / {num(s.scale)}</span>
                    )}
                </span>
                <Badge variant="outline" className="text-[10px] font-semibold">
                    {admissionKindText(t, s.kind)}
                </Badge>
                <span className="text-[11px] font-semibold text-muted-foreground">{s.year}</span>
                {trendDeltaBadge(s)}
                {(s.scope !== "program" || s.scopeLabel) && (
                    <Badge variant="secondary" className="text-[10px] font-semibold">
                        {admissionScopeText(t, s.scope, s.scopeLabel)}
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
                    {q.quota != null ? num(q.quota) : "—"}
                </span>
                <span className="text-xs text-muted-foreground">{t("admissionQuotaUnit")}</span>
                <Badge
                    variant={q.scope === "program" ? "outline" : "secondary"}
                    className="text-[10px] font-semibold"
                >
                    {admissionScopeText(t, q.scope, q.scopeLabel)}
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
        const amountText = tuitionAmountText(x)
        return (
            <div
                key={`${x.academicYear ?? ""}-${x.basis}-${x.appliesTo ?? ""}-${i}`}
                className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5"
            >
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-black text-foreground">
                        {amountText ?? "—"}
                        {amountText && x.basis && (
                            <span className="text-xs font-semibold text-muted-foreground"> {tuitionBasisText(t, x.basis)}</span>
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

    const cohorts = useMemo(() => extractCohorts(program?.code, program?.name), [program])
    const specialization = useMemo(() => extractSpecialization(program?.name), [program])

    // Provenance: an http(s) sourceUrl only, its domain as the link text (no fabricated fallback)
    const sourceHref = safeHttpUrl(program?.sourceUrl)
    const lastCrawledText = program ? formatDate(program.lastCrawled) : null

    // Instant Course Search & Semester Filter: the options are the program's own semesters ("none" = not specified).
    const semesterOptions = useMemo(
        () => [...new Set((courses ?? []).map((c) => c.semester))].sort(compareSemesters),
        [courses]
    )
    // A choice made for another program falls back to "all" instead of an empty table under a hidden option.
    const semesterChoice = semesterOptions.some((s) => semesterKey(s) === semesterFilter) ? semesterFilter : "all"
    const filteredCourses = useMemo(() => {
        if (!courses) return []
        return courses.filter((c) => {
            const matchesQuery =
                !courseSearch ||
                (c.courseName || "").toLowerCase().includes(courseSearch.toLowerCase()) ||
                (c.courseCode || "").toLowerCase().includes(courseSearch.toLowerCase())

            const matchesSem = semesterChoice === "all" || semesterKey(c.semester) === semesterChoice

            return matchesQuery && matchesSem
        })
    }, [courses, courseSearch, semesterChoice])

    const tabs: { key: TabKey; label: string }[] = [
        { key: "info", label: t("infoTab") },
        { key: "admissions", label: t("admissionsTab") },
        { key: "curriculum", label: t("curriculumTab") },
        { key: "graph", label: t("graphTab") },
        { key: "gpa", label: t("gpaTab") },
        { key: "raw", label: t("rawDocumentsTab") },
        { key: "eval", label: t("evalTab") },
    ]

    // APG tabs: arrows (wrapping), Home and End move focus and select (one rule with the syllabus modal).
    const onTabKeyDown = (e: KeyboardEvent, index: number) => {
        const next = tabKeyTarget(e.key, index, tabs.length)
        if (next < 0) return
        e.preventDefault()
        setActiveTab(tabs[next].key)
        document.getElementById(tabId(tabs[next].key))?.focus()
    }

    const evalComponents: { id: string; name: string; score: number | undefined }[] = program ? [
        { id: "outcomes", name: t("evalOutcomeName"), score: program.evalOutcomes },
        { id: "structure", name: t("evalStructureName"), score: program.evalStructure },
        { id: "blocks", name: t("evalBlocksName"), score: program.evalKnowledgeBlocks },
        { id: "completeness", name: t("evalCompletenessName"), score: program.evalCompleteness },
    ] : []
    const enoughData = !!program && hasEnoughData(program)
    // A score the enough-data rule hides: say why instead of showing it.
    const hiddenScoreNote = program && !enoughData && typeof program.evaluationScore === "number"
        ? t(program.dataSufficiency === "insufficient" ? "evalInsufficientNote" : "evalNoCoursesNote")
        : null
    const hasEvalComponents = enoughData && evalComponents.every((c) => typeof c.score === "number")
    const evalRadarScores: AunCriterionScore[] = hasEvalComponents
        ? evalComponents.map((c) => ({ id: c.id, name: c.name, score: c.score as number }))
        : []

    return (
        <AnimatePresence>
            {open && program && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none"
                    >
                        <div
                            ref={boxRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby={titleId}
                            tabIndex={-1}
                            className="w-full max-w-5xl max-h-[94vh] sm:max-h-[90vh] bg-card border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl pointer-events-auto flex flex-col overflow-hidden outline-none"
                        >
                            {/* Below sm the buttons take their own row, so a long name gets the full width. */}
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between p-5 sm:p-6 border-b border-border">
                                <div className="space-y-1.5 min-w-0 sm:flex-1 sm:pr-2">
                                    <h2 id={titleId} className="text-xl sm:text-2xl font-black text-foreground break-words">{program.name}</h2>
                                    <p className="text-xs sm:text-sm text-muted-foreground font-medium">{program.universityName}</p>
                                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                                        {program.degreeType && (
                                            <Badge variant="secondary" className="text-xs font-semibold">{program.degreeType}</Badge>
                                        )}
                                        {cohorts.map((c) => (
                                            <Badge key={c} className="font-mono text-xs font-bold bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                                                {t("cohortBadge", { id: c })}
                                            </Badge>
                                        ))}
                                        {specialization && (
                                            <Badge variant="outline" className="text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 font-medium">
                                                CN: {specialization}
                                            </Badge>
                                        )}
                                        {/* null credits (missing or implausible for the degree, v2.54) = honest text, never "0" */}
                                        <Badge variant="outline" className={`text-xs ${program.credits ? "font-semibold" : "font-normal text-muted-foreground"}`}>
                                            {program.credits ? t("credits", { count: program.credits }) : t("creditsNotVerified")}
                                        </Badge>
                                        {program.courseCount > 0 && (
                                            <Badge variant="outline" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                                                {t("courses", { count: program.courseCount })}
                                            </Badge>
                                        )}
                                    </div>
                                    {(program.sourceUrl || program.lastCrawled) && (
                                        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5 text-[11px] text-muted-foreground">
                                            <span className="inline-flex items-center gap-1">
                                                {t("sourceLabel")}{" "}
                                                {sourceHref ? (
                                                    <a
                                                        href={sourceHref}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-0.5 text-primary hover:underline"
                                                    >
                                                        {urlHost(sourceHref)}
                                                        <ExternalLink className="h-2.5 w-2.5" />
                                                    </a>
                                                ) : (
                                                    "—"
                                                )}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                {t("updatedLabel")} {lastCrawledText ?? "—"}
                                            </span>
                                        </p>
                                    )}
                                    {/* The program's own page (v2.60): server-rendered, shareable, the copy-link target. */}
                                    <p className="pt-0.5 text-xs">
                                        <a href={programPagePath(locale, program.id)} className="font-semibold text-primary hover:underline">
                                            {t("programPageLink")}
                                        </a>
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => window.print()}
                                        aria-label={t("printPdf")}
                                        className="gap-1.5 text-xs h-8 rounded-lg"
                                    >
                                        <Printer className="w-3.5 h-3.5 text-indigo-500" />
                                        <span className="hidden sm:inline">{t("printPdf")}</span>
                                    </Button>
                                    {courses && courses.length > 0 && (
                                        <>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => exportProgramToCsv(program, courses)}
                                                aria-label={t("exportExcel")}
                                                className="gap-1.5 text-xs h-8 rounded-lg"
                                            >
                                                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                                                <span className="hidden sm:inline">{t("exportExcel")}</span>
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => exportProgramToJson(program, courses)}
                                                aria-label={t("exportJson")}
                                                className="gap-1.5 text-xs h-8 rounded-lg"
                                            >
                                                <FileJson className="w-3.5 h-3.5 text-blue-500" />
                                                <span className="hidden sm:inline">{t("exportJson")}</span>
                                            </Button>
                                        </>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={copyLink}
                                        data-testid="program-copy-link"
                                        aria-label={linkCopied ? t("compareShareCopied") : t("copyLink")}
                                        className="gap-1.5 text-xs h-8 rounded-lg"
                                    >
                                        {linkCopied ? (
                                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                                        ) : (
                                            <LinkIcon className="w-3.5 h-3.5 text-primary" />
                                        )}
                                        <span className="hidden sm:inline">{linkCopied ? t("compareShareCopied") : t("copyLink")}</span>
                                    </Button>
                                    <WishlistButton programId={program.id} size="sm" />
                                    <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("close")} className="h-8 w-8 rounded-full">
                                        <X className="h-4 w-4" aria-hidden />
                                    </Button>
                                </div>
                            </div>

                            <div className="border-b border-border px-4 sm:px-6 pt-2 bg-muted/20 shrink-0">
                                <div role="tablist" aria-label={t("detailTabsLabel")} className="flex gap-1 sm:gap-2 -mb-px overflow-x-auto no-scrollbar">
                                    {tabs.map((tab, i) => (
                                        <button
                                            key={tab.key}
                                            type="button"
                                            role="tab"
                                            id={tabId(tab.key)}
                                            aria-selected={activeTab === tab.key}
                                            aria-controls={activeTab === tab.key ? panelId : undefined}
                                            tabIndex={activeTab === tab.key ? 0 : -1}
                                            onClick={() => setActiveTab(tab.key)}
                                            onKeyDown={(e) => onTabKeyDown(e, i)}
                                            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                                                activeTab === tab.key
                                                    ? "border-primary text-primary"
                                                    : "border-transparent text-muted-foreground hover:text-foreground"
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div
                                id={panelId}
                                role="tabpanel"
                                aria-labelledby={tabId(activeTab)}
                                tabIndex={0}
                                className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6"
                            >
                                {activeTab === "info" && (
                                    <div className="space-y-6">
                                        <Card>
                                            <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                                <MetadataItem label={t("programCode")}>
                                                    {program.code}
                                                </MetadataItem>
                                                <MetadataItem label={t("duration")}>
                                                    {program.duration?.trim() || t("notVerified")}
                                                </MetadataItem>
                                                <MetadataItem label={t("tuition")}>
                                                    {program.tuition}
                                                </MetadataItem>
                                                <MetadataItem label={t("language")}>
                                                    {program.language}
                                                </MetadataItem>
                                                <MetadataItem label={t("formOfStudy")}>
                                                    {program.formOfStudy}
                                                </MetadataItem>
                                                <MetadataItem label={t("lastCrawled")}>
                                                    {formatDate(program.lastCrawled) && (
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="h-3.5 w-3.5" />
                                                            {formatDate(program.lastCrawled)}
                                                        </span>
                                                    )}
                                                </MetadataItem>
                                            </CardContent>
                                        </Card>

                                        {sourceHref && (
                                            <Section title={t("sourceUrl")}>
                                                <a
                                                    href={sourceHref}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
                                                >
                                                    <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                                                    {sourceHref}
                                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                                </a>
                                            </Section>
                                        )}

                                        <Section title={t("description")}>
                                            <TextBlock text={program.description} />
                                        </Section>

                                        {program.goals && (
                                            <Section title={t("goals")}>
                                                <TextBlock text={program.goals} />
                                            </Section>
                                        )}

                                        {program.careerOutlook && (
                                            <Section title={t("careerOutlook")}>
                                                <TextBlock text={program.careerOutlook} />
                                            </Section>
                                        )}

                                        {program.learningOutcomes && (
                                            <Section title={t("learningOutcomes")}>
                                                <TextBlock text={program.learningOutcomes} />
                                            </Section>
                                        )}
                                    </div>
                                )}

                                {activeTab === "admissions" && (
                                    <div className="space-y-6" data-testid="admissions-section">
                                        <div className="flex items-center gap-2">
                                            <GraduationCap className="h-4 w-4 text-primary" />
                                            <h3 className="font-semibold">
                                                {admissions?.years?.length
                                                    ? t("admissionsTitle", { year: Math.max(...admissions.years) })
                                                    : t("admissionsTitleNoYear")}
                                            </h3>
                                        </div>

                                        {admissionsLoading && (
                                            <div className="space-y-3 animate-pulse" data-testid="admissions-loading">
                                                <div className="h-20 rounded-xl bg-muted/60" />
                                                <div className="h-20 rounded-xl bg-muted/60" />
                                                <div className="h-16 rounded-xl bg-muted/60" />
                                            </div>
                                        )}

                                        {!admissionsLoading && admissionsError && (
                                            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
                                                <AlertCircle className="h-4 w-4" />
                                                {t("admissionsError")}
                                            </div>
                                        )}

                                        {!admissionsLoading && !admissionsError && (!admissionsView || admissionsView.isEmpty) && (
                                            <p className="text-sm text-muted-foreground py-4" data-testid="admissions-empty">
                                                {t("noAdmissions")}
                                            </p>
                                        )}

                                        {!admissionsLoading && !admissionsError && admissionsView && !admissionsView.isEmpty && (
                                            <div className="space-y-6">
                                                {/* ---- Điểm xét tuyển ---- */}
                                                {(admissionsView.programScores.length > 0 || admissionsView.contextScores.length > 0) && (
                                                    <Section title={t("admissionScoresTitle")}>
                                                        {admissionsView.methods.length > 1 && (
                                                            <div
                                                                className="flex flex-wrap items-center gap-1.5 pb-1"
                                                                data-testid="admissions-method-selector"
                                                            >
                                                                <span className="text-xs text-muted-foreground mr-1">
                                                                    {t("admissionMethodLabel")}:
                                                                </span>
                                                                {admissionsView.methods.map((m) => (
                                                                    <button
                                                                        key={m.key}
                                                                        onClick={() => setAdmissionMethod(m.key)}
                                                                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                                                                            activeAdmissionMethod === m.key
                                                                                ? "bg-primary text-primary-foreground border-primary"
                                                                                : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
                                                                        }`}
                                                                    >
                                                                        {m.label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}

                                                        <div className="space-y-2">
                                                            {admissionsView.programScores
                                                                .filter((s) => `${s.year}|${s.method}` === activeAdmissionMethod)
                                                                .map((s, i) => renderScoreRow(s, i))}
                                                        </div>

                                                        {admissionsView.contextScores.filter((s) => `${s.year}|${s.method}` === activeAdmissionMethod).length > 0 && (
                                                            <div className="space-y-2 pt-2">
                                                                <p className="text-xs font-semibold text-muted-foreground">
                                                                    {t("admissionContextTitle")}
                                                                </p>
                                                                {admissionsView.contextScores
                                                                    .filter((s) => `${s.year}|${s.method}` === activeAdmissionMethod)
                                                                    .map((s, i) => renderScoreRow(s, i))}
                                                            </div>
                                                        )}
                                                    </Section>
                                                )}

                                                {/* ---- Xu hướng điểm chuẩn 3 năm (v1.3) ---- */}
                                                {admissionsView.programScores.length > 0 && (
                                                    <Section title={t("trendTitle")}>
                                                        <ScoreTrendChart scores={admissionsView.programScores} />
                                                    </Section>
                                                )}

                                                {/* ---- Chỉ tiêu ---- */}
                                                {(admissionsView.programQuotas.length > 0 || admissionsView.contextQuotas.length > 0) && (
                                                    <Section title={t("admissionQuotasTitle")}>
                                                        <div className="space-y-2">
                                                            {admissionsView.programQuotas.map((q, i) => renderQuotaRow(q, i))}
                                                            {admissionsView.contextQuotas.map((q, i) => renderQuotaRow(q, i))}
                                                        </div>
                                                    </Section>
                                                )}

                                                {/* ---- Học phí ---- */}
                                                {(admissionsView.programTuitions.length > 0 || admissionsView.contextTuitions.length > 0) && (
                                                    <Section title={t("admissionTuitionTitle")}>
                                                        <div className="space-y-2">
                                                            {admissionsView.programTuitions.map((x, i) => renderTuitionRow(x, i))}
                                                            {admissionsView.contextTuitions.map((x, i) => renderTuitionRow(x, i))}
                                                        </div>
                                                    </Section>
                                                )}

                                                {/* ---- Ngành này ở trường khác (v1.3) ---- */}
                                                <SameMajorElsewhere program={program} />

                                                <p className="text-xs text-muted-foreground italic border-l-2 border-amber-400/70 pl-3">
                                                    {t("admissionsWarning")}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === "curriculum" && (
                                    <div className="space-y-4">
                                        {/* Knowledge Block Percentages Chart Component */}
                                        {courses && courses.length > 0 && (
                                            <KnowledgeBlockBreakdown courses={courses} totalCredits={program.credits || undefined} />
                                        )}

                                        {/* Search & Filter Header Bar */}
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                                            <div className="flex items-center gap-2">
                                                <BookOpen className="h-4 w-4 text-primary" />
                                                <h3 className="font-semibold">{t("curriculumTitle")}</h3>
                                                {courses && (
                                                    <Badge variant="outline" className="font-mono text-xs">
                                                        {t("coursesCount", { shown: filteredCourses.length, total: courses.length })}
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Search Input & Semester Select (wraps on phones: preparatory labels are long) */}
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="relative">
                                                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                                                    <input
                                                        type="text"
                                                        value={courseSearch}
                                                        onChange={(e) => setCourseSearch(e.target.value)}
                                                        placeholder={t("courseSearchPlaceholder")}
                                                        className="pl-8 pr-3 py-1.5 text-xs border rounded-lg bg-background focus:ring-1 focus:ring-primary focus:outline-none w-44"
                                                    />
                                                </div>
                                                <select
                                                    aria-label={t("semester")}
                                                    value={semesterChoice}
                                                    onChange={(e) => setSemesterFilter(e.target.value)}
                                                    className="py-1.5 px-2 text-xs border rounded-lg bg-background font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                                                >
                                                    <option value="all">{t("allSemesters")}</option>
                                                    {semesterOptions.map((s) => (
                                                        <option key={semesterKey(s)} value={semesterKey(s)}>{semesterLabel(t, s)}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {isLoading && (
                                            <div className="flex items-center justify-center py-12">
                                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                            </div>
                                        )}

                                        {error && (
                                            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                                                {t("curriculumError")}
                                            </div>
                                        )}

                                        {!isLoading && !error && (!courses || courses.length === 0) && (
                                            <p className="text-sm text-muted-foreground py-4">
                                                {t("noCurriculum")}
                                            </p>
                                        )}

                                        {courses && courses.length > 0 && (
                                            <div className="overflow-x-auto relative rounded-2xl border border-border shadow-sm">
                                                <table className="w-full text-sm min-w-[580px]">
                                                    <thead className="bg-muted/60 border-b border-border">
                                                        <tr>
                                                            <th className="text-left px-4 py-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">
                                                                {t("courseCode")}
                                                            </th>
                                                            <th className="text-left px-4 py-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">
                                                                {t("courseName")}
                                                            </th>
                                                            <th className="text-center px-4 py-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">{t("semester")}</th>
                                                            <th className="text-left px-4 py-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">{t("knowledgeBlock")}</th>
                                                            <th className="text-right px-4 py-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">
                                                                {t("courseCredits")}
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border/60">
                                                        {filteredCourses.map((course) => (
                                                            <tr
                                                                key={course.id}
                                                                onClick={() => setSelectedCourseForSyllabus(course)}
                                                                className="hover:bg-muted/50 cursor-pointer transition-colors group"
                                                            >
                                                                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                                                                    <span className="font-black text-foreground group-hover:text-primary transition-colors">
                                                                        {course.courseCode || "—"}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 font-semibold">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <span className="text-foreground">{course.courseName}</span>
                                                                        {/* The row's keyboard path to its syllabus (v2.62): a hover hint for the mouse,
                                                                            shown while it has keyboard focus; the row click stays for the mouse. */}
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                setSelectedCourseForSyllabus(course)
                                                                            }}
                                                                            aria-label={t("syllabusFor", {
                                                                                course: course.courseCode ? `${course.courseCode} ${course.courseName}` : course.courseName,
                                                                            })}
                                                                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[11px] text-primary flex items-center font-bold transition-opacity shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                                        >
                                                                            {t("syllabusLink")} <ChevronRight className="w-3 h-3 ml-0.5" />
                                                                        </button>
                                                                    </div>
                                                                    {course.prerequisites && (
                                                                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5 font-normal">
                                                                            {t("prereqShort", { prereqs: course.prerequisites })}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3 text-center font-mono text-xs font-bold text-muted-foreground">
                                                                    {course.semester == null ? "N/A" : course.semester <= 0 ? semesterLabel(t, course.semester) : `HK${course.semester}`}
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <Badge variant="outline" className="text-[10px] font-mono font-medium">
                                                                        {course.knowledgeBlock || "N/A"}
                                                                    </Badge>
                                                                </td>
                                                                <td className="px-4 py-3 text-right font-mono font-black text-primary">
                                                                    {course.credits != null ? `${course.credits} TC` : "N/A"}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {/* Elective groups — renders nothing when the
                                            program detail has no `electiveGroups` key. */}
                                        <ElectiveGroups groups={electiveGroups} courses={courses} />
                                    </div>
                                )}

                                {activeTab === "graph" && (
                                    <div>
                                        {isLoading ? (
                                            <div className="flex items-center justify-center py-12">
                                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                            </div>
                                        ) : (
                                            <PrerequisiteGraph
                                                courses={courses || []}
                                                onSelectCourseForSyllabus={setSelectedCourseForSyllabus}
                                            />
                                        )}
                                    </div>
                                )}

                                {activeTab === "gpa" && (
                                    <div>
                                        {isLoading ? (
                                            <div className="flex items-center justify-center py-12">
                                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                            </div>
                                        ) : error ? (
                                            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                                                {t("curriculumError")}
                                            </div>
                                        ) : (
                                            <GpaPlanner courses={courses || []} />
                                        )}
                                    </div>
                                )}

                                {activeTab === "raw" && (
                                    <div className="space-y-4">
                                        <h3 className="font-semibold flex items-center gap-2">
                                            <FileText className="h-4 w-4" />
                                            {t("rawDocumentsTitle")}
                                        </h3>

                                        {rawLoading && (
                                            <div className="flex items-center justify-center py-12">
                                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                            </div>
                                        )}

                                        {rawError && (
                                            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
                                                <AlertCircle className="h-4 w-4" />
                                                {t("rawDocumentsError")}
                                            </div>
                                        )}

                                        {!rawLoading && !rawError && (!rawDocs || rawDocs.length === 0) && (
                                            <p className="text-sm text-muted-foreground py-4">
                                                {t("noRawDocuments")}
                                            </p>
                                        )}

                                        {rawDocs && rawDocs.length > 0 && (
                                            <div className="space-y-3">
                                                {rawDocs.map((doc: RawDocument) => {
                                                    const excerpt = rawExcerpt(doc.extractedText)
                                                    const link = safeHttpUrl(doc.url)
                                                    return (
                                                        <Card key={doc.id} data-testid="raw-doc" className="overflow-hidden">
                                                            <CardContent className="p-4 space-y-3">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <Badge variant="secondary">{doc.docType}</Badge>
                                                                    {doc.status && (
                                                                        <Badge variant="outline">{doc.status}</Badge>
                                                                    )}
                                                                    {/* A character count of the source's extracted text (not bytes, v2.56). */}
                                                                    {doc.extractedTextLength != null && (
                                                                        <span data-testid="raw-doc-text-length" className="text-xs text-muted-foreground">
                                                                            {t("rawDocTextLength", { count: doc.extractedTextLength })}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {excerpt && (
                                                                    <figure className="space-y-1">
                                                                        <figcaption className="text-[11px] font-semibold text-muted-foreground">
                                                                            {t("rawDocExcerptLabel")}
                                                                        </figcaption>
                                                                        <blockquote
                                                                            data-testid="raw-doc-excerpt"
                                                                            className="rounded bg-muted/50 p-3 text-xs wrap-anywhere"
                                                                        >
                                                                            {excerpt}
                                                                        </blockquote>
                                                                    </figure>
                                                                )}
                                                                {link ? (
                                                                    <a
                                                                        href={link}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-sm text-primary hover:underline break-all flex items-center gap-1"
                                                                    >
                                                                        <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                                                                        {t("rawDocSourceLink", { domain: urlHost(link) ?? "" })}
                                                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                                                    </a>
                                                                ) : (
                                                                    <p className="text-xs text-muted-foreground italic">
                                                                        {t("rawDocNoPublicLink")}
                                                                    </p>
                                                                )}
                                                            </CardContent>
                                                        </Card>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === "eval" && (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between border-b pb-4">
                                            <div>
                                                <h3 className="font-bold text-base">{t("evalTitle")}</h3>
                                                <p className="text-xs text-muted-foreground">{t("evalModelDesc")} — {t("slmRefScoreNote")}</p>
                                            </div>
                                            {program.dataSufficiency === "insufficient" ? (
                                                <Badge variant="outline" className="text-sm font-extrabold px-3 py-1 bg-amber-500/10 text-amber-600 border-amber-500/30" title={t("evalInsufficientNote")}>
                                                    {t("evalInsufficientBadge")}
                                                </Badge>
                                            ) : hasEnoughData(program) ? (
                                                <Badge variant="outline" className="text-sm font-extrabold px-3 py-1 bg-primary/10 text-primary border-primary/20" title={t("slmRefScoreNote")}>
                                                    {t("slmRefScore")}: {program.evaluationScore.toFixed(1)} / 10.0
                                                </Badge>
                                            ) : hiddenScoreNote && (
                                                <Badge variant="outline" className="text-sm font-extrabold px-3 py-1 bg-amber-500/10 text-amber-600 border-amber-500/30" title={hiddenScoreNote}>
                                                    {ta("statusNoData")}
                                                </Badge>
                                            )}
                                        </div>

                                        {!hasEvalComponents ? (
                                            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                                                <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
                                                <p className="text-sm text-muted-foreground">
                                                    {hiddenScoreNote ?? t("evalEmpty")}
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                                <div className="flex flex-col items-center justify-center p-4 bg-muted/20 rounded-xl border">
                                                    <AunRadarChart scores={evalRadarScores} size={260} />
                                                </div>

                                                <div className="space-y-3">
                                                    <CriterionItem
                                                        title={t("evalCrit1Title")}
                                                        score={evalRadarScores[0].score}
                                                        description={t("evalCrit1Desc")}
                                                    />
                                                    <CriterionItem
                                                        title={t("evalCrit2Title")}
                                                        score={evalRadarScores[1].score}
                                                        description={t("evalCrit2Desc")}
                                                    />
                                                    <CriterionItem
                                                        title={t("evalCrit3Title")}
                                                        score={evalRadarScores[2].score}
                                                        description={t("evalCrit3Desc")}
                                                    />
                                                    <CriterionItem
                                                        title={t("evalCrit4Title")}
                                                        score={evalRadarScores[3].score}
                                                        description={t("evalCrit4Desc")}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>

                    <SyllabusDetailModal
                        course={selectedCourseForSyllabus}
                        universityId={program.universityId}
                        open={!!selectedCourseForSyllabus}
                        onClose={() => setSelectedCourseForSyllabus(null)}
                        onSelectCourseCode={(code) => {
                            const target = courses?.find(
                                (c) => (c.courseCode || "").toLowerCase() === code.toLowerCase()
                            )
                            if (target) {
                                setSelectedCourseForSyllabus(target)
                            } else if (selectedCourseForSyllabus) {
                                setSelectedCourseForSyllabus({
                                    ...selectedCourseForSyllabus,
                                    courseCode: code,
                                    courseName: code,
                                    id: code,
                                })
                            }
                        }}
                    />
                </>
            )}
        </AnimatePresence>
    )
}
