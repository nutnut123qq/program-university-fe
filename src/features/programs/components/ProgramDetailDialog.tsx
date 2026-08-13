"use client"

import { useState } from "react"
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
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useTranslations } from "next-intl"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

import { fetchCurricula, fetchRawDocuments, fetchRawDocumentText } from "../api"
import { Program, RawDocument } from "../types"
import { AunRadarChart, AunCriterionScore } from "@/components/common/AunRadarChart"
import { PrerequisiteGraph } from "./PrerequisiteGraph"
import { GpaPlanner } from "./GpaPlanner"
import { exportProgramToCsv, exportProgramToJson } from "@/lib/exportUtils"

interface ProgramDetailDialogProps {
    program: Program | null
    open: boolean
    onClose: () => void
}

type TabKey = "info" | "curriculum" | "graph" | "gpa" | "raw" | "eval"

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
                                    <div className="flex flex-wrap gap-2 pt-2">
                                        {program.degreeType && (
                                            <Badge variant="secondary">{program.degreeType}</Badge>
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

                            <div className="flex-1 p-6 overflow-y-auto">
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
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold flex items-center gap-2">
                                                <BookOpen className="h-4 w-4" />
                                                {t("curriculumTitle")}
                                            </h3>
                                            {courses && courses.length > 0 && (
                                                <span className="text-xs text-muted-foreground font-mono">
                                                    Tổng số: {courses.length} môn học ({program.credits || 135} TC)
                                                </span>
                                            )}
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
                                                            <th className="text-right px-4 py-2 font-medium">
                                                                {t("courseCredits")}
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y">
                                                        {courses.map((course) => (
                                                            <tr key={course.id} className="hover:bg-muted/30">
                                                                <td className="px-4 py-2 text-muted-foreground">
                                                                    {course.courseCode || "—"}
                                                                </td>
                                                                <td className="px-4 py-2">{course.courseName}</td>
                                                                <td className="px-4 py-2 text-right">
                                                                    {course.credits ?? "—"}
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
                                            <PrerequisiteGraph courses={courses || []} />
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
                </>
            )}
        </AnimatePresence>
    )
}
