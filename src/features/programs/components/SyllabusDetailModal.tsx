"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    BookOpen,
    FileText,
    CheckCircle2,
    Clock,
    Award,
    ListChecks,
    GraduationCap,
    ExternalLink,
    GitFork,
    Percent,
    X,
    Loader2,
    HelpCircle,
    ArrowRight,
    ArrowLeft,
    Sparkles,
    AlertTriangle,
    ShieldAlert,
} from "lucide-react"
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { fetchSyllabus, fetchRoadmap } from "../api"
import { Curriculum } from "../types"

interface SyllabusDetailModalProps {
    course: Curriculum | null
    open: boolean
    onClose: () => void
    onSelectCourseCode?: (code: string) => void
}

type TabKey = "assessments" | "clos" | "sessions" | "materials" | "roadmap" | "rules"

function parseWeightNumber(weightStr?: string): number {
    if (!weightStr) return 0
    const num = parseFloat(weightStr.replace("%", "").trim())
    return isNaN(num) ? 0 : num
}

function isStrictThreshold(criteria?: string): boolean {
    if (!criteria) return false
    const num = parseFloat(criteria.replace(/[^0-9.]/g, ""))
    return !isNaN(num) && num >= 4.0
}

export function SyllabusDetailModal({
    course,
    open,
    onClose,
    onSelectCourseCode,
}: SyllabusDetailModalProps) {
    const [activeTab, setActiveTab] = useState<TabKey>("assessments")

    const subjectCode = course?.courseCode || ""
    const { data: syllabus, isLoading: isSyllabusLoading } = useSWR(
        subjectCode ? ["syllabus", subjectCode] : null,
        () => fetchSyllabus(subjectCode)
    )

    const { data: roadmap, isLoading: isRoadmapLoading } = useSWR(
        subjectCode ? ["roadmap", subjectCode] : null,
        () => fetchRoadmap(subjectCode)
    )

    if (!open || !course) return null

    const info = syllabus?.info
    const clos = syllabus?.clos || []
    const assessments = syllabus?.assessments || []
    const sessions = syllabus?.sessions || []
    const materials = syllabus?.materials || []

    const directPrereqs = roadmap?.directPrereqs || []
    const unlocks = roadmap?.unlocks || []
    const names = roadmap?.names || {}

    const totalWeight = assessments.reduce((acc, curr) => acc + parseWeightNumber(curr.weight), 0)

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md transition-all">
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 30 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="relative w-full max-w-4xl max-h-[94vh] sm:max-h-[90vh] bg-background border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                >
                    {/* Top Sticky Header */}
                    <div className="sticky top-0 z-20 px-5 sm:px-6 py-4 border-b border-border bg-background/95 backdrop-blur-md flex items-start justify-between gap-4">
                        <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                <Badge className="font-mono text-xs font-extrabold px-2.5 py-0.5 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                                    {course.courseCode || "MÔN HỌC"}
                                </Badge>
                                {course.semester !== null && (
                                    <Badge variant="outline" className="font-mono text-xs">
                                        Học kỳ {course.semester}
                                    </Badge>
                                )}
                                <Badge variant="outline" className="font-mono text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 font-semibold">
                                    {course.credits ?? 3} Tín chỉ
                                </Badge>
                                {course.knowledgeBlock && (
                                    <Badge variant="secondary" className="text-[11px] font-medium">
                                        {course.knowledgeBlock}
                                    </Badge>
                                )}
                            </div>
                            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-foreground truncate">
                                {info?.syllabusName || course.courseName}
                            </h2>
                            {info?.syllabusEnglish && (
                                <p className="text-xs text-muted-foreground italic truncate">
                                    {info.syllabusEnglish}
                                </p>
                            )}
                        </div>

                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="rounded-full h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/80"
                            aria-label="Đóng"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Quick Stat Pill Bar */}
                    {info && (
                        <div className="px-5 sm:px-6 py-2.5 border-b border-border/60 bg-muted/30 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            {info.decisionNo && (
                                <div className="truncate">
                                    <span className="text-muted-foreground">QĐ ban hành: </span>
                                    <span className="font-medium text-foreground">{info.decisionNo}</span>
                                </div>
                            )}
                            {info.minAvgToPass && (
                                <div>
                                    <span className="text-muted-foreground">Điểm qua môn: </span>
                                    <span className="font-bold text-amber-600 dark:text-amber-400">≥ {info.minAvgToPass} / 10</span>
                                </div>
                            )}
                            {info.prerequisite && (
                                <div className="truncate sm:col-span-2">
                                    <span className="text-muted-foreground">Tiên quyết: </span>
                                    <span className="font-mono font-semibold text-primary">{info.prerequisite}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tabs Navigation */}
                    <div className="px-4 sm:px-6 border-b border-border bg-muted/10 flex overflow-x-auto gap-1 sm:gap-2 no-scrollbar">
                        {[
                            { id: "assessments", label: "Cấu trúc điểm thi", icon: Percent, count: assessments.length },
                            { id: "clos", label: "Chuẩn đầu ra (CLOs)", icon: CheckCircle2, count: clos.length },
                            { id: "sessions", label: "Kế hoạch bài giảng", icon: ListChecks, count: sessions.length },
                            { id: "materials", label: "Giáo trình & Coursera", icon: BookOpen, count: materials.length },
                            { id: "roadmap", label: "Lộ trình mở khóa", icon: GitFork, count: directPrereqs.length + unlocks.length },
                            { id: "rules", label: "Quy định & Giờ học", icon: Clock },
                        ].map((tab) => {
                            const Icon = tab.icon
                            const isActive = activeTab === tab.id
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as TabKey)}
                                    className={`relative flex items-center gap-1.5 py-3 px-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-all ${
                                        isActive
                                            ? "border-primary text-primary"
                                            : "border-transparent text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    <Icon className="h-3.5 w-3.5 shrink-0" />
                                    <span>{tab.label}</span>
                                    {tab.count !== undefined && tab.count > 0 && (
                                        <span className={`ml-0.5 px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold ${
                                            isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                                        }`}>
                                            {tab.count}
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>

                    {/* Main Modal Body */}
                    <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
                        {isSyllabusLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                                <p className="text-sm font-medium">Đang tải chi tiết đề cương môn học...</p>
                            </div>
                        ) : !syllabus && activeTab !== "roadmap" ? (
                            <div className="py-14 text-center space-y-3">
                                <HelpCircle className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                                <h3 className="text-base font-bold text-foreground">
                                    Đang cập nhật đề cương chi tiết
                                </h3>
                                <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                                    Môn <span className="font-mono font-bold text-foreground">{course.courseCode}</span> ({course.courseName}) thuộc học kỳ {course.semester ?? 1} với {course.credits ?? 3} tín chỉ. Đề cương chi tiết sẽ được tự động đồng bộ khi có phiên bản mới.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Tab: Assessments (Cấu trúc điểm thi) */}
                                {activeTab === "assessments" && (
                                    <div className="space-y-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div>
                                                <h4 className="text-sm font-bold flex items-center gap-1.5">
                                                    <Percent className="h-4 w-4 text-primary" />
                                                    Trọng số các đầu điểm & Tiêu chí chống liệt
                                                </h4>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    Tổng trọng số các đầu điểm: <strong className="text-foreground">{totalWeight || 100}%</strong>
                                                </p>
                                            </div>
                                            <Badge variant="outline" className="font-mono text-xs w-fit">
                                                Thang điểm: {info?.scoringScale || "10.0"}
                                            </Badge>
                                        </div>

                                        {assessments.length === 0 ? (
                                            <p className="text-sm text-muted-foreground italic py-4">Chưa có bảng phân bổ điểm chi tiết.</p>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                                {assessments.map((a, idx) => {
                                                    const weightNum = parseWeightNumber(a.weight)
                                                    const strict = isStrictThreshold(a.completionCriteria)
                                                    return (
                                                        <Card key={idx} className="border-border bg-card/80 hover:bg-card transition-all duration-200 shadow-sm hover:shadow-md">
                                                            <CardContent className="p-4 space-y-3">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="space-y-1 min-w-0">
                                                                        <Badge variant="secondary" className="text-[10px] font-mono font-semibold">
                                                                            {a.category}
                                                                        </Badge>
                                                                        <h5 className="font-bold text-sm text-foreground leading-snug">
                                                                            {a.type} {a.part ? `(Phần ${a.part})` : ""}
                                                                        </h5>
                                                                    </div>
                                                                    <div className="text-right shrink-0">
                                                                        <span className="text-base font-black font-mono text-primary px-2.5 py-1 rounded-lg bg-primary/10 inline-block">
                                                                            {a.weight}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {/* Visual weight progress bar */}
                                                                <div className="space-y-1">
                                                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                                                        <span>Tỷ trọng điểm</span>
                                                                        <span className="font-mono font-bold">{weightNum}%</span>
                                                                    </div>
                                                                    <Progress value={weightNum} className="h-1.5 bg-muted" />
                                                                </div>

                                                                {/* Criteria details & anti-paralysis warning */}
                                                                <div className="pt-2 border-t border-border/50 grid grid-cols-2 gap-2 text-xs">
                                                                    <div>
                                                                        <span className="text-muted-foreground block text-[11px]">Tiêu chí liệt:</span>
                                                                        {strict ? (
                                                                            <Badge className="text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 gap-1 mt-0.5">
                                                                                <AlertTriangle className="w-2.5 h-2.5" />
                                                                                ≥ {a.completionCriteria} (Điểm liệt)
                                                                            </Badge>
                                                                        ) : (
                                                                            <span className="font-semibold text-foreground">
                                                                                {a.completionCriteria ? `≥ ${a.completionCriteria}` : "Không quy định"}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {a.duration && (
                                                                        <div>
                                                                            <span className="text-muted-foreground block text-[11px]">Thời gian thi:</span>
                                                                            <span className="font-medium text-foreground">{a.duration}</span>
                                                                        </div>
                                                                    )}
                                                                    {a.questionType && (
                                                                        <div className="col-span-2 pt-1">
                                                                            <span className="text-muted-foreground text-[11px]">Hình thức: </span>
                                                                            <span className="font-medium text-foreground">{a.questionType}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    )
                                                })}
                                            </div>
                                        )}

                                        {info?.note && (
                                            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-foreground space-y-1.5 shadow-sm">
                                                <div className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                                    <ShieldAlert className="h-4 w-4" />
                                                    Lưu ý & Quy chế điểm tổng kết:
                                                </div>
                                                <div className="whitespace-pre-line text-muted-foreground leading-relaxed">
                                                    {info.note}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Tab: CLOs (Chuẩn đầu ra môn học) */}
                                {activeTab === "clos" && (
                                    <div className="space-y-3.5">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-bold flex items-center gap-1.5">
                                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                Chuẩn đầu ra môn học (Course Learning Outcomes - CLOs)
                                            </h4>
                                            <span className="text-xs text-muted-foreground font-mono">
                                                {clos.length} chuẩn đầu ra
                                            </span>
                                        </div>
                                        {clos.length === 0 ? (
                                            <p className="text-sm text-muted-foreground italic py-4">Chưa có dữ liệu CLOs.</p>
                                        ) : (
                                            <div className="space-y-2.5">
                                                {clos.map((clo, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="p-3.5 rounded-xl border border-border bg-card hover:bg-card/90 transition-colors flex items-start gap-3 shadow-sm"
                                                    >
                                                        <Badge className="font-mono text-xs font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 shrink-0">
                                                            {clo.cloName || `CLO${idx + 1}`}
                                                        </Badge>
                                                        <p className="text-xs text-foreground leading-relaxed flex-1">
                                                            {clo.loDetails}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Tab: Sessions (Kế hoạch bài giảng) */}
                                {activeTab === "sessions" && (
                                    <div className="space-y-3.5">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-bold flex items-center gap-1.5">
                                                <ListChecks className="h-4 w-4 text-primary" />
                                                Lịch trình bài giảng ({sessions.length} buổi học)
                                            </h4>
                                        </div>

                                        {sessions.length === 0 ? (
                                            <p className="text-sm text-muted-foreground italic py-4">Chưa có lịch trình buổi học.</p>
                                        ) : (
                                            <div className="space-y-2.5">
                                                {sessions.map((s, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="p-3.5 rounded-xl border border-border bg-card/70 hover:bg-card transition-colors space-y-2 shadow-sm"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="font-mono font-extrabold text-xs text-primary px-2 py-0.5 rounded bg-primary/10">
                                                                Buổi {s.sessionNo}
                                                            </span>
                                                            <Badge
                                                                variant="outline"
                                                                className={`text-[10px] font-mono ${
                                                                    s.learningTeachingType.toLowerCase().includes("online")
                                                                        ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                                                        : "bg-muted"
                                                                }`}
                                                            >
                                                                {s.learningTeachingType}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs font-semibold text-foreground whitespace-pre-line leading-snug">
                                                            {s.topic}
                                                        </p>
                                                        {s.studentTasks && (
                                                            <div className="text-[11px] text-muted-foreground bg-muted/30 p-2 rounded-lg leading-relaxed">
                                                                <strong className="text-foreground/80">Nhiệm vụ chuẩn bị: </strong>
                                                                {s.studentTasks}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Tab: Materials (Giáo trình & Coursera) */}
                                {activeTab === "materials" && (
                                    <div className="space-y-3.5">
                                        <h4 className="text-sm font-bold flex items-center gap-1.5">
                                            <BookOpen className="h-4 w-4 text-primary" />
                                            Giáo trình & Khóa học trực tuyến (Coursera/References)
                                        </h4>
                                        {materials.length === 0 ? (
                                            <p className="text-sm text-muted-foreground italic py-4">Chưa có danh mục tài liệu đính kèm.</p>
                                        ) : (
                                            <div className="space-y-3">
                                                {materials.map((m, idx) => {
                                                    const isUrl = m.materialDescription.startsWith("http")
                                                    return (
                                                        <div
                                                            key={idx}
                                                            className="p-4 rounded-xl border border-border bg-card space-y-2 shadow-sm"
                                                        >
                                                            {isUrl ? (
                                                                <a
                                                                    href={m.materialDescription}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1.5 break-all"
                                                                >
                                                                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                                                    {m.materialDescription}
                                                                </a>
                                                            ) : (
                                                                <p className="text-xs font-bold text-foreground leading-snug">
                                                                    {m.materialDescription}
                                                                </p>
                                                            )}

                                                            {(m.author || m.publisher || m.isbn) && (
                                                                <div className="pt-1 border-t border-border/40 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                                                                    {m.author && <span>Tác giả: <strong className="text-foreground">{m.author}</strong></span>}
                                                                    {m.publisher && <span>NXB: <strong className="text-foreground">{m.publisher}</strong></span>}
                                                                    {m.isbn && <span>ISBN: <strong className="font-mono text-foreground">{m.isbn}</strong></span>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Tab: Roadmap (Môn học trước & Môn mở khóa) */}
                                {activeTab === "roadmap" && (
                                    <div className="space-y-6">
                                        {isRoadmapLoading ? (
                                            <div className="flex justify-center py-12">
                                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                            </div>
                                        ) : (
                                            <>
                                                {/* Môn tiên quyết (Direct Prerequisites) */}
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-2">
                                                        <ArrowLeft className="h-4 w-4 text-amber-500" />
                                                        <h4 className="text-sm font-bold">
                                                            Môn cần học trước (Tiên quyết)
                                                        </h4>
                                                        <Badge variant="outline" className="font-mono text-xs ml-auto">
                                                            {directPrereqs.length} môn
                                                        </Badge>
                                                    </div>

                                                    {directPrereqs.length === 0 ? (
                                                        <div className="p-4 rounded-xl border border-dashed border-border bg-muted/20 text-xs text-muted-foreground text-center">
                                                            Không có môn tiên quyết (sinh viên có thể học ngay từ đầu).
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                            {directPrereqs.map((code) => (
                                                                <button
                                                                    key={code}
                                                                    onClick={() => onSelectCourseCode && onSelectCourseCode(code)}
                                                                    className="p-3 rounded-xl border border-border bg-card/80 hover:bg-card hover:border-amber-500/50 hover:shadow-md text-left transition-all flex items-center justify-between group"
                                                                    title={`Xem đề cương môn ${code}`}
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <span className="font-mono text-xs font-black text-amber-600 dark:text-amber-400 group-hover:underline">
                                                                            {code}
                                                                        </span>
                                                                        <p className="text-[11px] text-muted-foreground font-medium truncate mt-0.5">
                                                                            {names[code] || "—"}
                                                                        </p>
                                                                    </div>
                                                                    <span className="text-[11px] text-primary font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                                                                        Xem <ArrowRight className="h-3.5 w-3.5" />
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Môn mở khóa tiếp theo (Unlocks) */}
                                                <div className="space-y-3 pt-4 border-t border-border/60">
                                                    <div className="flex items-center gap-2">
                                                        <ArrowRight className="h-4 w-4 text-emerald-500" />
                                                        <h4 className="text-sm font-bold">
                                                            Môn được mở khóa tiếp theo (Hậu duệ)
                                                        </h4>
                                                        <Badge variant="outline" className="font-mono text-xs text-emerald-600 bg-emerald-500/10 ml-auto">
                                                            {unlocks.length} môn
                                                        </Badge>
                                                    </div>

                                                    {unlocks.length === 0 ? (
                                                        <div className="p-4 rounded-xl border border-dashed border-border bg-muted/20 text-xs text-muted-foreground text-center">
                                                            Môn kết thúc hoặc môn giai đoạn cuối (không mở khóa thêm môn nào).
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                            {unlocks.map((code) => (
                                                                <button
                                                                    key={code}
                                                                    onClick={() => onSelectCourseCode && onSelectCourseCode(code)}
                                                                    className="p-3 rounded-xl border border-border bg-card/80 hover:bg-card hover:border-emerald-500/50 hover:shadow-md text-left transition-all flex items-center justify-between group"
                                                                    title={`Xem đề cương môn ${code}`}
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400 group-hover:underline">
                                                                            {code}
                                                                        </span>
                                                                        <p className="text-[11px] text-muted-foreground font-medium truncate mt-0.5">
                                                                            {names[code] || "—"}
                                                                        </p>
                                                                    </div>
                                                                    <span className="text-[11px] text-primary font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                                                                        Xem <ArrowRight className="h-3.5 w-3.5" />
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Tab: Rules & Time Allocation */}
                                {activeTab === "rules" && (
                                    <div className="space-y-4">
                                        {info?.timeAllocation && (
                                            <div className="space-y-2">
                                                <h4 className="text-sm font-bold flex items-center gap-1.5">
                                                    <Clock className="h-4 w-4 text-primary" />
                                                    Phân bổ thời lượng học tập
                                                </h4>
                                                <div className="p-3.5 rounded-xl border border-border bg-muted/30 text-xs text-foreground font-mono leading-relaxed">
                                                    {info.timeAllocation}
                                                </div>
                                            </div>
                                        )}

                                        {info?.studentTasks && (
                                            <div className="space-y-2">
                                                <h4 className="text-sm font-bold flex items-center gap-1.5">
                                                    <GraduationCap className="h-4 w-4 text-primary" />
                                                    Yêu cầu đối với sinh viên
                                                </h4>
                                                <div className="p-3.5 rounded-xl border border-border bg-muted/30 text-xs text-foreground whitespace-pre-line leading-relaxed">
                                                    {info.studentTasks}
                                                </div>
                                            </div>
                                        )}

                                        {info?.description && (
                                            <div className="space-y-2">
                                                <h4 className="text-sm font-bold flex items-center gap-1.5">
                                                    <FileText className="h-4 w-4 text-primary" />
                                                    Mục tiêu & Tổng quan môn học
                                                </h4>
                                                <div className="p-3.5 rounded-xl border border-border bg-muted/30 text-xs text-foreground whitespace-pre-line leading-relaxed">
                                                    {info.description}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Modal Footer */}
                    <div className="sticky bottom-0 z-20 px-5 sm:px-6 py-3 border-t border-border bg-background/95 backdrop-blur-md flex items-center justify-between text-xs text-muted-foreground">
                        <span>Mã môn: <strong className="font-mono text-foreground">{course.courseCode}</strong></span>
                        <Button variant="outline" size="sm" onClick={onClose} className="rounded-xl h-9 px-4 text-xs font-semibold">
                            Đóng
                        </Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}

