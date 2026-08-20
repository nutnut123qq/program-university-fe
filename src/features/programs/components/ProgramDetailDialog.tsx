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
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useTranslations } from "next-intl"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

import { fetchCurricula, fetchRawDocuments, fetchRawDocumentText } from "../api"
import { Curriculum, Program, RawDocument } from "../types"
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

type TabKey = "info" | "curriculum" | "graph" | "gpa" | "raw" | "eval"

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

    const cohorts = useMemo(() => extractCohorts(program?.code, program?.name), [program])
    const specialization = useMemo(() => extractSpecialization(program?.name), [program])

    // Instant Course Search & Semester Filter
    const filteredCourses = useMemo(() => {
        if (!courses) return []
        return courses.filter((c) => {
            const matchesQuery =
                !courseSearch ||
                (c.courseName || "").toLowerCase().includes(courseSearch.toLowerCase()) ||
                (c.courseCode || "").toLowerCase().includes(courseSearch.toLowerCase())

            const matchesSem = semesterFilter === "all" || String(c.semester || 1) === semesterFilter

            return matchesQuery && matchesSem
        })
    }, [courses, courseSearch, semesterFilter])

    const tabs: { key: TabKey; label: string }[] = [
        { key: "info", label: t("infoTab") },
        { key: "curriculum", label: t("curriculumTab") },
        { key: "graph", label: t("graphTab") },
        { key: "gpa", label: t("gpaTab") },
        { key: "raw", label: t("rawDocumentsTab") },
        { key: "eval", label: t("evalTab") },
    ]

    const evalRadarScores: AunCriterionScore[] = program ? [
        { id: "outcomes", name: "Chuẩn đầu ra (PLO)", score: Math.min(5, Math.max(1, (program.evalOutcomes || (program.evaluationScore ? program.evaluationScore * 0.45 : 4)))) },
        { id: "structure", name: "Cấu trúc CTĐT", score: Math.min(5, Math.max(1, (program.evalStructure || (program.evaluationScore ? program.evaluationScore * 0.48 : 4.2)))) },
        { id: "blocks", name: "Khối kiến thức", score: Math.min(5, Math.max(1, (program.evalKnowledgeBlocks || (program.evaluationScore ? program.evaluationScore * 0.5 : 4.5)))) },
        { id: "completeness", name: "Tính đầy đủ Dữ liệu", score: Math.min(5, Math.max(1, (program.evalCompleteness || (program.evaluationScore ? program.evaluationScore * 0.5 : 4.8)))) },
    ] : []

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
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                    >
                        <div className="w-full max-w-5xl max-h-[90vh] bg-card border rounded-2xl shadow-2xl pointer-events-auto flex flex-col">
                            <div className="flex items-start justify-between p-6 border-b">
                                <div className="space-y-1 min-w-0">
                                    <h2 className="text-2xl font-bold truncate">{program.name}</h2>
                                    <p className="text-muted-foreground">{program.universityName}</p>
                                    <div className="flex flex-wrap items-center gap-2 pt-2">
                                        {program.degreeType && (
                                            <Badge variant="secondary">{program.degreeType}</Badge>
                                        )}
                                        {cohorts.map((c) => (
                                            <Badge key={c} className="font-mono text-xs font-bold bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                                                Khóa {c}
                                            </Badge>
                                        ))}
                                        {specialization && (
                                            <Badge variant="outline" className="text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20">
                                                CN: {specialization}
                                            </Badge>
                                        )}
                                        {program.credits && (
                                            <Badge variant="outline">
                                                {t("credits", { count: program.credits })}
                                            </Badge>
                                        )}
                                        {program.courseCount > 0 && (
                                            <Badge variant="outline">
                                                {t("courses", { count: program.courseCount })}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => window.print()}
                                        className="gap-1.5 text-xs h-8"
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
                                                className="gap-1.5 text-xs h-8"
                                            >
                                                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                                                <span className="hidden sm:inline">Xuất Excel</span>
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => exportProgramToJson(program, courses)}
                                                className="gap-1.5 text-xs h-8"
                                            >
                                                <FileJson className="w-3.5 h-3.5 text-blue-500" />
                                                <span className="hidden sm:inline">Xuất JSON</span>
                                            </Button>
                                        </>
                                    )}
                                    <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="border-b px-6 pt-2">
                                <div className="flex gap-2 -mb-px overflow-x-auto">
                                    {tabs.map((tab) => (
                                        <button
                                            key={tab.key}
                                            onClick={() => setActiveTab(tab.key)}
                                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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

                            <div className="flex-1 p-6 overflow-y-auto space-y-6">
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
                                            <div className="rounded-lg border overflow-hidden">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-muted/50">
                                                        <tr>
                                                            <th className="text-left px-4 py-2 font-medium">
                                                                {t("courseCode")}
                                                            </th>
                                                            <th className="text-left px-4 py-2 font-medium">
                                                                {t("courseName")}
                                                            </th>
                                                            <th className="text-center px-4 py-2 font-medium">Học kỳ</th>
                                                            <th className="text-left px-4 py-2 font-medium">Khối kiến thức</th>
                                                            <th className="text-right px-4 py-2 font-medium">
                                                                {t("courseCredits")}
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y">
                                                        {filteredCourses.map((course) => (
                                                            <tr
                                                                key={course.id}
                                                                onClick={() => setSelectedCourseForSyllabus(course)}
                                                                className="hover:bg-muted/50 cursor-pointer transition-colors group"
                                                            >
                                                                <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">
                                                                    <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                                                                        {course.courseCode || "—"}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-2.5 font-medium">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <span>{course.courseName}</span>
                                                                        <span className="opacity-0 group-hover:opacity-100 text-[11px] text-primary flex items-center font-normal transition-opacity shrink-0">
                                                                            Xem đề cương <ChevronRight className="w-3 h-3 ml-0.5" />
                                                                        </span>
                                                                    </div>
                                                                    {course.prerequisites && (
                                                                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                                                            TQ: {course.prerequisites}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-2.5 text-center font-mono text-xs">
                                                                    HK{course.semester || 1}
                                                                </td>
                                                                <td className="px-4 py-2.5">
                                                                    <Badge variant="outline" className="text-[10px] font-mono">
                                                                        {course.knowledgeBlock || "Chuyên ngành"}
                                                                    </Badge>
                                                                </td>
                                                                <td className="px-4 py-2.5 text-right font-mono font-bold text-primary">
                                                                    {course.credits ?? 3} TC
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
                                                <p className="text-xs text-muted-foreground">Mô hình SLM Workflow đánh giá tự động dựa trên 4 tiêu chí cốt lõi</p>
                                            </div>
                                            {program.evaluationScore && (
                                                <Badge variant="outline" className="text-sm font-extrabold px-3 py-1 bg-primary/10 text-primary border-primary/20">
                                                    SLM Score: {program.evaluationScore.toFixed(1)} / 10.0
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                            <div className="flex flex-col items-center justify-center p-4 bg-muted/20 rounded-xl border">
                                                <AunRadarChart scores={evalRadarScores} size={260} />
                                            </div>

                                            <div className="space-y-3">
                                                <CriterionItem
                                                    title="1. Chuẩn đầu ra (Outcomes - Bloom Taxonomy)"
                                                    score={evalRadarScores[0]?.score || 4}
                                                    description="Mức độ cụ thể, đo lường được và sự phù hợp với khung trình độ quốc gia."
                                                />
                                                <CriterionItem
                                                    title="2. Cấu trúc Chương trình (Structure & Credit Distribution)"
                                                    score={evalRadarScores[1]?.score || 4.2}
                                                    description="Sự cân đối về thời lượng, tổng số tín chỉ và tính khả thi của tiến trình."
                                                />
                                                <CriterionItem
                                                    title="3. Phân tầng Khối kiến thức (Knowledge Blocks)"
                                                    score={evalRadarScores[2]?.score || 4.5}
                                                    description="Tỷ lệ hợp lý giữa kiến thức Đại cương, Cơ sở ngành, Chuyên ngành và Tốt nghiệp."
                                                />
                                                <CriterionItem
                                                    title="4. Tính Đầy đủ Dữ liệu công bố (Completeness)"
                                                    score={evalRadarScores[3]?.score || 4.8}
                                                    description="Mức độ minh bạch thông tin về mô tả môn, điều kiện tiên quyết và học phí."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>

                    <SyllabusDetailModal
                        course={selectedCourseForSyllabus}
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
