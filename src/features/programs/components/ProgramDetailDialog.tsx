"use client"

import { useState, useMemo } from "react"
import dayjs from "dayjs"
import {
    BookOpen,
    Loader2,
    X,
    Calendar,
    Link as LinkIcon,
    FileText,
    AlertCircle,
    Eye,
    EyeOff,
    ExternalLink,
    FileSpreadsheet,
    FileJson,
    Printer,
    Search,
    Filter,
    ChevronRight,
    GraduationCap,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useTranslations } from "next-intl"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

import { fetchAdmissions, fetchCurricula, fetchRawDocuments, fetchRawDocumentText, fetchUniversityCode } from "../api"
import { AdmissionQuota, AdmissionScore, Curriculum, Program, RawDocument, TuitionRecord } from "../types"
import { AunRadarChart, AunCriterionScore } from "@/components/common/AunRadarChart"
import { PrerequisiteGraph } from "./PrerequisiteGraph"
import { GpaPlanner } from "./GpaPlanner"
import { KnowledgeBlockBreakdown } from "./KnowledgeBlockBreakdown"
import { SyllabusDetailModal } from "./SyllabusDetailModal"
import { exportProgramToCsv, exportProgramToJson } from "@/lib/exportUtils"

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

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
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

function hostnameOf(url: string | null | undefined): string | null {
    if (!url) return null
    try {
        return new URL(url).hostname.replace(/^www\./, "")
    } catch {
        return url
    }
}

function formatMoney(amount: number | null | undefined, currency: string): string | null {
    if (amount == null) return null
    try {
        return new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(amount)
    } catch {
        return `${amount.toLocaleString("vi-VN")} ${currency}`
    }
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
    const domain = hostnameOf(sourceUrl)
    const publishedText = formatDateOnly(publishedAt)
    const fetchedText = formatDate(fetchedAt ?? null)
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
        <div className="text-sm text-foreground whitespace-pre-line bg-muted/40 rounded-lg p-3">
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
    const [activeTab, setActiveTab] = useState<TabKey>("info")
    const [viewingDocId, setViewingDocId] = useState<string | null>(null)
    const [courseSearch, setCourseSearch] = useState("")
    const [semesterFilter, setSemesterFilter] = useState<string>("all")
    const [selectedCourseForSyllabus, setSelectedCourseForSyllabus] = useState<Curriculum | null>(null)

    const { data: courses, error, isLoading } = useSWR(
        program ? ["curricula", program.id] : null,
        () => (program ? fetchCurricula(program.id) : [])
    )

    const { data: rawDocs, error: rawError, isLoading: rawLoading } = useSWR(
        program ? ["raw-documents", program.id] : null,
        () => (program ? fetchRawDocuments(program.id) : [])
    )

    const { data: docText, error: textError, isLoading: textLoading } = useSWR(
        viewingDocId ? ["raw-document-text", viewingDocId] : null,
        () => (viewingDocId ? fetchRawDocumentText(viewingDocId) : null)
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
        const pid = program.id
        // Rows bound to this program by programId (any scope, e.g. per-campus
        // rows still carry the programId and render as program-level data).
        const programScores = admissions.scores.filter((s) => s.programId === pid)
        const programQuotas = admissions.quotas.filter((q) => q.programId === pid)
        const programTuitions = admissions.tuitions.filter((x) => x.programId === pid)
        // Context rows: never tied to a specific program (programId null per
        // spec — group/school scopes are not fanned out); shown separately and
        // labeled by scope so they are never read as per-program data.
        const contextScores = admissions.scores.filter(
            (s) => s.programId === null && s.scope !== "program"
        )
        const contextQuotas = admissions.quotas.filter(
            (q) => q.programId === null && q.scope !== "program"
        )
        const contextTuitions = admissions.tuitions.filter((x) => x.programId === null)
        const methods: { key: string; label: string }[] = []
        for (const s of [...programScores, ...contextScores]) {
            if (!methods.some((m) => m.key === s.method)) {
                methods.push({ key: s.method, label: s.methodLabel || s.method })
            }
        }
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
            methods,
            isEmpty,
        }
    }, [admissions, program])

    const activeAdmissionMethod =
        admissionMethod && admissionsView?.methods.some((m) => m.key === admissionMethod)
            ? admissionMethod
            : (admissionsView?.methods[0]?.key ?? null)

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
        // Avoid duplication like "Toàn trường: Toàn trường" when the label
        // already spells out the scope.
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

    const methodLabelFor = (methodKey: string): string =>
        admissionsView?.methods.find((m) => m.key === methodKey)?.label || methodKey

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

    const cohorts = useMemo(() => extractCohorts(program?.code, program?.name), [program])
    const specialization = useMemo(() => extractSpecialization(program?.name), [program])

    // Provenance: display only the domain from the real sourceUrl (no fabricated fallback)
    const sourceDomain = useMemo(() => {
        if (!program?.sourceUrl) return null
        try {
            return new URL(program.sourceUrl).hostname.replace(/^www\./, "")
        } catch {
            return program.sourceUrl
        }
    }, [program?.sourceUrl])
    const lastCrawledText = program ? formatDate(program.lastCrawled) : null

    // Instant Course Search & Semester Filter
    const filteredCourses = useMemo(() => {
        if (!courses) return []
        return courses.filter((c) => {
            const matchesQuery =
                !courseSearch ||
                (c.courseName || "").toLowerCase().includes(courseSearch.toLowerCase()) ||
                (c.courseCode || "").toLowerCase().includes(courseSearch.toLowerCase())

            const matchesSem = semesterFilter === "all" || String(c.semester) === semesterFilter

            return matchesQuery && matchesSem
        })
    }, [courses, courseSearch, semesterFilter])

    const tabs: { key: TabKey; label: string }[] = [
        { key: "info", label: t("infoTab") },
        { key: "admissions", label: t("admissionsTab") },
        { key: "curriculum", label: t("curriculumTab") },
        { key: "graph", label: t("graphTab") },
        { key: "gpa", label: t("gpaTab") },
        { key: "raw", label: t("rawDocumentsTab") },
        { key: "eval", label: t("evalTab") },
    ]

    const evalComponents: { id: string; name: string; score: number | undefined }[] = program ? [
        { id: "outcomes", name: "Chuẩn đầu ra (PLO)", score: program.evalOutcomes },
        { id: "structure", name: "Cấu trúc CTĐT", score: program.evalStructure },
        { id: "blocks", name: "Khối kiến thức", score: program.evalKnowledgeBlocks },
        { id: "completeness", name: "Tính đầy đủ Dữ liệu", score: program.evalCompleteness },
    ] : []
    const hasEvalComponents = evalComponents.every((c) => typeof c.score === "number")
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
                        <div className="w-full max-w-5xl max-h-[94vh] sm:max-h-[90vh] bg-card border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl pointer-events-auto flex flex-col overflow-hidden">
                            <div className="flex items-start justify-between p-5 sm:p-6 border-b border-border">
                                <div className="space-y-1.5 min-w-0 flex-1 pr-2">
                                    <h2 className="text-xl sm:text-2xl font-black text-foreground truncate">{program.name}</h2>
                                    <p className="text-xs sm:text-sm text-muted-foreground font-medium">{program.universityName}</p>
                                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                                        {program.degreeType && (
                                            <Badge variant="secondary" className="text-xs font-semibold">{program.degreeType}</Badge>
                                        )}
                                        {cohorts.map((c) => (
                                            <Badge key={c} className="font-mono text-xs font-bold bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                                                Khóa {c}
                                            </Badge>
                                        ))}
                                        {specialization && (
                                            <Badge variant="outline" className="text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 font-medium">
                                                CN: {specialization}
                                            </Badge>
                                        )}
                                        {program.credits && (
                                            <Badge variant="outline" className="text-xs font-semibold">
                                                {t("credits", { count: program.credits })}
                                            </Badge>
                                        )}
                                        {program.courseCount > 0 && (
                                            <Badge variant="outline" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                                                {t("courses", { count: program.courseCount })}
                                            </Badge>
                                        )}
                                    </div>
                                    {(program.sourceUrl || program.lastCrawled) && (
                                        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5 text-[11px] text-muted-foreground">
                                            <span className="inline-flex items-center gap-1">
                                                Nguồn:{" "}
                                                {program.sourceUrl ? (
                                                    <a
                                                        href={program.sourceUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-0.5 text-primary hover:underline"
                                                    >
                                                        {sourceDomain}
                                                        <ExternalLink className="h-2.5 w-2.5" />
                                                    </a>
                                                ) : (
                                                    "—"
                                                )}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                Cập nhật: {lastCrawledText ?? "—"}
                                            </span>
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => window.print()}
                                        className="gap-1.5 text-xs h-8 rounded-lg"
                                    >
                                        <Printer className="w-3.5 h-3.5 text-indigo-500" />
                                        <span className="hidden sm:inline">In PDF</span>
                                    </Button>
                                    {courses && courses.length > 0 && (
                                        <>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => exportProgramToCsv(program, courses)}
                                                className="gap-1.5 text-xs h-8 rounded-lg"
                                            >
                                                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                                                <span className="hidden sm:inline">Xuất Excel</span>
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => exportProgramToJson(program, courses)}
                                                className="gap-1.5 text-xs h-8 rounded-lg"
                                            >
                                                <FileJson className="w-3.5 h-3.5 text-blue-500" />
                                                <span className="hidden sm:inline">Xuất JSON</span>
                                            </Button>
                                        </>
                                    )}
                                    <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="border-b border-border px-4 sm:px-6 pt-2 bg-muted/20 shrink-0">
                                <div className="flex gap-1 sm:gap-2 -mb-px overflow-x-auto no-scrollbar">
                                    {tabs.map((tab) => (
                                        <button
                                            key={tab.key}
                                            onClick={() => setActiveTab(tab.key)}
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

                            <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
                                {activeTab === "info" && (
                                    <div className="space-y-6">
                                        <Card>
                                            <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                                <MetadataItem label={t("programCode")}>
                                                    {program.code}
                                                </MetadataItem>
                                                <MetadataItem label={t("duration")}>
                                                    {program.duration}
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

                                        {program.sourceUrl && (
                                            <Section title={t("sourceUrl")}>
                                                <a
                                                    href={program.sourceUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
                                                >
                                                    <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                                                    {program.sourceUrl}
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
                                                {t("admissionsTitle", { year: admissions?.years?.[0] ?? 2025 })}
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
                                                                .filter((s) => s.method === activeAdmissionMethod)
                                                                .map((s, i) => renderScoreRow(s, i))}
                                                        </div>

                                                        {admissionsView.contextScores.filter((s) => s.method === activeAdmissionMethod).length > 0 && (
                                                            <div className="space-y-2 pt-2">
                                                                <p className="text-xs font-semibold text-muted-foreground">
                                                                    {t("admissionContextTitle")}
                                                                </p>
                                                                {admissionsView.contextScores
                                                                    .filter((s) => s.method === activeAdmissionMethod)
                                                                    .map((s, i) => renderScoreRow(s, i))}
                                                            </div>
                                                        )}
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
                                                        {filteredCourses.length} / {courses.length} môn
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Search Input & Semester Select */}
                                            <div className="flex items-center gap-2">
                                                <div className="relative">
                                                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                                                    <input
                                                        type="text"
                                                        value={courseSearch}
                                                        onChange={(e) => setCourseSearch(e.target.value)}
                                                        placeholder="Tìm môn học..."
                                                        className="pl-8 pr-3 py-1.5 text-xs border rounded-lg bg-background focus:ring-1 focus:ring-primary focus:outline-none w-44"
                                                    />
                                                </div>
                                                <select
                                                    value={semesterFilter}
                                                    onChange={(e) => setSemesterFilter(e.target.value)}
                                                    className="py-1.5 px-2 text-xs border rounded-lg bg-background font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                                                >
                                                    <option value="all">Tất cả Học kỳ</option>
                                                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                                                        <option key={s} value={String(s)}>Học kỳ {s}</option>
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
                                                            <th className="text-center px-4 py-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Học kỳ</th>
                                                            <th className="text-left px-4 py-3 font-bold text-xs text-muted-foreground uppercase tracking-wider">Khối kiến thức</th>
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
                                                                        <span className="opacity-0 group-hover:opacity-100 text-[11px] text-primary flex items-center font-bold transition-opacity shrink-0">
                                                                            Đề cương <ChevronRight className="w-3 h-3 ml-0.5" />
                                                                        </span>
                                                                    </div>
                                                                    {course.prerequisites && (
                                                                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5 font-normal">
                                                                            TQ: {course.prerequisites}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3 text-center font-mono text-xs font-bold text-muted-foreground">
                                                                    {course.semester != null ? `HK${course.semester}` : "N/A"}
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
                                                {rawDocs.map((doc: RawDocument) => (
                                                    <Card key={doc.id} className="overflow-hidden">
                                                        <CardContent className="p-4 space-y-3">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <Badge variant="secondary">{doc.docType}</Badge>
                                                                {doc.status && (
                                                                    <Badge variant="outline">{doc.status}</Badge>
                                                                )}
                                                                {doc.extractedTextLength !== null && (
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {formatBytes(doc.extractedTextLength)} text
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <a
                                                                href={doc.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-sm text-primary hover:underline break-all flex items-center gap-1"
                                                            >
                                                                <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                                                                {doc.url}
                                                            </a>
                                                            <div className="pt-2 border-t flex justify-end">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() =>
                                                                        setViewingDocId(
                                                                            viewingDocId === doc.id ? null : doc.id
                                                                        )
                                                                    }
                                                                    className="gap-1.5 text-xs"
                                                                >
                                                                    {viewingDocId === doc.id ? (
                                                                        <>
                                                                            <EyeOff className="h-3.5 w-3.5" />
                                                                            {t("hideText")}
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Eye className="h-3.5 w-3.5" />
                                                                            {t("viewText")}
                                                                        </>
                                                                    )}
                                                                </Button>
                                                            </div>
                                                            {viewingDocId === doc.id && (
                                                                <div className="pt-3 border-t">
                                                                    {textLoading && (
                                                                        <div className="flex items-center justify-center py-6">
                                                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                                        </div>
                                                                    )}
                                                                    {textError && (
                                                                        <p className="text-xs text-destructive">
                                                                            {t("textError")}
                                                                        </p>
                                                                    )}
                                                                    {docText !== undefined && docText !== null && (
                                                                        <div className="max-h-60 overflow-y-auto rounded bg-muted/50 p-3 text-xs font-mono whitespace-pre-wrap">
                                                                            {docText || t("emptyText")}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </CardContent>
                                                    </Card>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === "eval" && (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between border-b pb-4">
                                            <div>
                                                <h3 className="font-bold text-base">Đánh giá Chất lượng CTĐT (AUN-QA Rubric)</h3>
                                                <p className="text-xs text-muted-foreground">Mô hình SLM Workflow chấm trên 4 tiêu chí cốt lõi — {t("slmRefScoreNote")}</p>
                                            </div>
                                            {program.evaluationScore && (
                                                <Badge variant="outline" className="text-sm font-extrabold px-3 py-1 bg-primary/10 text-primary border-primary/20" title={t("slmRefScoreNote")}>
                                                    {t("slmRefScore")}: {program.evaluationScore.toFixed(1)} / 10.0
                                                </Badge>
                                            )}
                                        </div>

                                        {!hasEvalComponents ? (
                                            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                                                <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
                                                <p className="text-sm text-muted-foreground">
                                                    Chưa có dữ liệu đánh giá cho chương trình này.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                                <div className="flex flex-col items-center justify-center p-4 bg-muted/20 rounded-xl border">
                                                    <AunRadarChart scores={evalRadarScores} size={260} />
                                                </div>

                                                <div className="space-y-3">
                                                    <CriterionItem
                                                        title="1. Chuẩn đầu ra (Outcomes - Bloom Taxonomy)"
                                                        score={evalRadarScores[0].score}
                                                        description="Mức độ cụ thể, đo lường được và sự phù hợp với khung trình độ quốc gia."
                                                    />
                                                    <CriterionItem
                                                        title="2. Cấu trúc Chương trình (Structure & Credit Distribution)"
                                                        score={evalRadarScores[1].score}
                                                        description="Sự cân đối về thời lượng, tổng số tín chỉ và tính khả thi của tiến trình."
                                                    />
                                                    <CriterionItem
                                                        title="3. Phân tầng Khối kiến thức (Knowledge Blocks)"
                                                        score={evalRadarScores[2].score}
                                                        description="Tỷ lệ hợp lý giữa kiến thức Đại cương, Cơ sở ngành, Chuyên ngành và Tốt nghiệp."
                                                    />
                                                    <CriterionItem
                                                        title="4. Tính Đầy đủ Dữ liệu công bố (Completeness)"
                                                        score={evalRadarScores[3].score}
                                                        description="Mức độ minh bạch thông tin về mô tả môn, điều kiện tiên quyết và học phí."
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
