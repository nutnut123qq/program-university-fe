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
} from "lucide-react"
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { fetchSyllabus, fetchRoadmap } from "../api"
import { Curriculum } from "../types"

interface SyllabusDetailModalProps {
    course: Curriculum | null
    open: boolean
    onClose: () => void
    onSelectCourseCode?: (code: string) => void
}

type TabKey = "assessments" | "clos" | "sessions" | "materials" | "roadmap" | "rules"

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

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    transition={{ duration: 0.2 }}
                    className="relative w-full max-w-4xl max-h-[90vh] bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                >
                    {/* Top Header */}
                    <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge className="font-mono text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                                    {course.courseCode || "MÔN HỌC"}
                                </Badge>
                                {course.semester !== null && (
                                    <Badge variant="outline" className="font-mono text-xs">
                                        Học kỳ {course.semester}
                                    </Badge>
                                )}
                                <Badge variant="outline" className="font-mono text-xs text-emerald-600 bg-emerald-500/10 border-emerald-500/20">
                                    {course.credits ?? 3} Tín chỉ
                                </Badge>
                                {course.knowledgeBlock && (
                                    <Badge variant="secondary" className="text-[11px]">
                                        {course.knowledgeBlock}
                                    </Badge>
                                )}
                            </div>
                            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
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
                            className="rounded-full h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Quick Stat Pill Bar */}
                    {info && (
                        <div className="px-6 py-2.5 border-b border-border/50 bg-background/50 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            {info.decisionNo && (
                                <div className="truncate">
                                    <span className="text-muted-foreground">QĐ ban hành: </span>
                                    <span className="font-medium">{info.decisionNo}</span>
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
                                    <span className="font-mono font-medium">{info.prerequisite}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tabs Navigation */}
                    <div className="px-6 border-b border-border bg-muted/20 flex overflow-x-auto gap-2 no-scrollbar">
                        {[
                            { id: "assessments", label: "Cấu trúc điểm thi", icon: Percent, count: assessments.length },
                            { id: "clos", label: "Chuẩn đầu ra (CLOs)", icon: CheckCircle2, count: clos.length },
                            { id: "sessions", label: "Kế hoạch bài giảng", icon: ListChecks, count: sessions.length },
                            { id: "materials", label: "Giáo trình & Coursera", icon: BookOpen, count: materials.length },
                            { id: "roadmap", label: "Lộ trình mở khóa", icon: GitFork, count: directPrereqs.length + unlocks.length },
                            { id: "rules", label: "Phân bổ giờ & Quy định", icon: Clock },
                        ].map((tab) => {
                            const Icon = tab.icon
                            const isActive = activeTab === tab.id
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as TabKey)}
                                    className={`flex items-center gap-1.5 py-3 px-3 border-b-2 text-xs font-medium whitespace-nowrap transition-colors ${
                                        isActive
                                            ? "border-primary text-primary font-semibold"
                                            : "border-transparent text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    <span>{tab.label}</span>
                                    {tab.count !== undefined && tab.count > 0 && (
                                        <span className="ml-0.5 px-1.5 py-0.2 text-[10px] rounded-full bg-muted font-mono">
                                            {tab.count}
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>

                    {/* Main Modal Body */}
                    <div className="flex-1 p-6 overflow-y-auto space-y-6">
                        {isSyllabusLoading ? (
                            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                                <p className="text-sm">Đang tải chi tiết đề cương môn học...</p>
                            </div>
                        ) : !syllabus && activeTab !== "roadmap" ? (
                            <div className="py-12 text-center space-y-3">
                                <HelpCircle className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                                <h3 className="text-base font-semibold text-foreground">
                                    Đang cập nhật đề cương chi tiết
                                </h3>
                                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                                    Môn <span className="font-mono font-medium text-foreground">{course.courseCode}</span> ({course.courseName}) thuộc học kỳ {course.semester ?? 1} với {course.credits ?? 3} tín chỉ. Đề cương chi tiết sẽ được tự động đồng bộ khi có phiên bản mới.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Tab: Assessments (Cấu trúc điểm thi) */}
                                {activeTab === "assessments" && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-semibold flex items-center gap-1.5">
                                                <Percent className="h-4 w-4 text-primary" />
                                                Trọng số các đầu điểm & Tiêu chí qua môn
                                            </h4>
                                            <Badge variant="outline" className="font-mono text-xs">
                                                Thang điểm: {info?.scoringScale || "10"}
                                            </Badge>
                                        </div>

                                        {assessments.length === 0 ? (
                                            <p className="text-sm text-muted-foreground italic">Chưa có bảng phân bổ điểm chi tiết.</p>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {assessments.map((a, idx) => (
                                                    <Card key={idx} className="border-border bg-card/60 hover:bg-card transition-colors">
                                                        <CardContent className="p-4 space-y-2">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="space-y-0.5">
                                                                    <Badge variant="secondary" className="text-[10px] font-mono">
                                                                        {a.category}
                                                                    </Badge>
                                                                    <h5 className="font-semibold text-sm text-foreground">
                                                                        {a.type} {a.part ? `(Phần ${a.part})` : ""}
                                                                    </h5>
                                                                </div>
                                                                <span className="text-lg font-bold font-mono text-primary px-2.5 py-1 rounded-lg bg-primary/10">
                                                                    {a.weight}
                                                                </span>
                                                            </div>

                                                            <div className="pt-2 border-t border-border/40 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                                                <div>
                                                                    <span>Điểm liệt: </span>
                                                                    <span className="font-semibold text-foreground">
                                                                        {a.completionCriteria ? `≥ ${a.completionCriteria}` : "—"}
                                                                    </span>
                                                                </div>
                                                                {a.duration && (
                                                                    <div>
                                                                        <span>Thời gian: </span>
                                                                        <span className="font-medium text-foreground">{a.duration}</span>
                                                                    </div>
                                                                )}
                                                                {a.questionType && (
                                                                    <div className="col-span-2">
                                                                        <span>Hình thức: </span>
                                                                        <span className="font-medium text-foreground">{a.questionType}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                ))}
                                            </div>
                                        )}

                                        {info?.note && (
                                            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-foreground space-y-1">
                                                <div className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                                    <Sparkles className="h-3.5 w-3.5" />
                                                    Lưu ý & Công thức tính điểm tổng kết:
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
                                    <div className="space-y-3">
                                        <h4 className="text-sm font-semibold flex items-center gap-1.5">
                                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                            Chuẩn đầu ra môn học (Course Learning Outcomes)
                                        </h4>
                                        {clos.length === 0 ? (
                                            <p className="text-sm text-muted-foreground italic">Chưa có dữ liệu CLOs.</p>
                                        ) : (
                                            <div className="space-y-2.5">
                                                {clos.map((clo, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="p-3.5 rounded-xl border border-border/80 bg-card flex items-start gap-3"
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
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-semibold flex items-center gap-1.5">
                                                <ListChecks className="h-4 w-4 text-primary" />
                                                Lịch trình bài giảng ({sessions.length} buổi học)
                                            </h4>
                                        </div>

                                        {sessions.length === 0 ? (
                                            <p className="text-sm text-muted-foreground italic">Chưa có lịch trình buổi học.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {sessions.map((s, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="p-3 rounded-xl border border-border/70 bg-card/60 hover:bg-card transition-colors space-y-1.5"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="font-mono font-bold text-xs text-primary">
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
                                                        <p className="text-xs font-medium text-foreground whitespace-pre-line leading-snug">
                                                            {s.topic}
                                                        </p>
                                                        {s.studentTasks && (
                                                            <p className="text-[11px] text-muted-foreground italic">
                                                                <span className="font-medium text-foreground/80">Nhiệm vụ: </span>
                                                                {s.studentTasks}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Tab: Materials (Giáo trình & Coursera) */}
                                {activeTab === "materials" && (
                                    <div className="space-y-3">
                                        <h4 className="text-sm font-semibold flex items-center gap-1.5">
                                            <BookOpen className="h-4 w-4 text-primary" />
                                            Giáo trình & Khóa học trực tuyến (Coursera/References)
                                        </h4>
                                        {materials.length === 0 ? (
                                            <p className="text-sm text-muted-foreground italic">Chưa có danh mục tài liệu đính kèm.</p>
                                        ) : (
                                            <div className="space-y-2.5">
                                                {materials.map((m, idx) => {
                                                    const isUrl = m.materialDescription.startsWith("http")
                                                    return (
                                                        <div
                                                            key={idx}
                                                            className="p-3.5 rounded-xl border border-border bg-card space-y-1"
                                                        >
                                                            {isUrl ? (
                                                                <a
                                                                    href={m.materialDescription}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1.5 break-all"
                                                                >
                                                                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                                                    {m.materialDescription}
                                                                </a>
                                                            ) : (
                                                                <p className="text-xs font-semibold text-foreground leading-snug">
                                                                    {m.materialDescription}
                                                                </p>
                                                            )}

                                                            {(m.author || m.publisher || m.isbn) && (
                                                                <div className="pt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                                                                    {m.author && <span>Tác giả: <strong className="text-foreground/90">{m.author}</strong></span>}
                                                                    {m.publisher && <span>NXB: <strong className="text-foreground/90">{m.publisher}</strong></span>}
                                                                    {m.isbn && <span>ISBN: <strong className="font-mono text-foreground/90">{m.isbn}</strong></span>}
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
                                            <div className="flex justify-center py-8">
                                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                            </div>
                                        ) : (
                                            <>
                                                {/* Môn tiên quyết (Direct Prerequisites) */}
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-2">
                                                        <ArrowLeft className="h-4 w-4 text-amber-500" />
                                                        <h4 className="text-sm font-semibold">
                                                            Môn cần học trước (Tiên quyết)
                                                        </h4>
                                                        <Badge variant="outline" className="font-mono text-xs">
                                                            {directPrereqs.length} môn
                                                        </Badge>
                                                    </div>

                                                    {directPrereqs.length === 0 ? (
                                                        <p className="text-xs text-muted-foreground italic pl-6">
                                                            Không có môn tiên quyết (có thể học ngay từ đầu).
                                                        </p>
                                                    ) : (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-2">
                                                            {directPrereqs.map((code) => (
                                                                <button
                                                                    key={code}
                                                                    onClick={() => onSelectCourseCode && onSelectCourseCode(code)}
                                                                    className="p-2.5 rounded-lg border border-border bg-card/60 hover:bg-card hover:border-amber-500/40 text-left transition-all flex items-center justify-between group"
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 group-hover:underline">
                                                                            {code}
                                                                        </span>
                                                                        <p className="text-[11px] text-muted-foreground truncate">
                                                                            {names[code] || "—"}
                                                                        </p>
                                                                    </div>
                                                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Môn mở khóa tiếp theo (Unlocks) */}
                                                <div className="space-y-3 pt-2 border-t border-border/60">
                                                    <div className="flex items-center gap-2">
                                                        <ArrowRight className="h-4 w-4 text-emerald-500" />
                                                        <h4 className="text-sm font-semibold">
                                                            Môn được mở khóa tiếp theo (Hậu duệ)
                                                        </h4>
                                                        <Badge variant="outline" className="font-mono text-xs text-emerald-600 bg-emerald-500/10">
                                                            {unlocks.length} môn
                                                        </Badge>
                                                    </div>

                                                    {unlocks.length === 0 ? (
                                                        <p className="text-xs text-muted-foreground italic pl-6">
                                                            Môn kết thúc hoặc môn giai đoạn cuối (không mở khóa thêm môn nào).
                                                        </p>
                                                    ) : (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-2">
                                                            {unlocks.map((code) => (
                                                                <button
                                                                    key={code}
                                                                    onClick={() => onSelectCourseCode && onSelectCourseCode(code)}
                                                                    className="p-2.5 rounded-lg border border-border bg-card/60 hover:bg-card hover:border-emerald-500/40 text-left transition-all flex items-center justify-between group"
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 group-hover:underline">
                                                                            {code}
                                                                        </span>
                                                                        <p className="text-[11px] text-muted-foreground truncate">
                                                                            {names[code] || "—"}
                                                                        </p>
                                                                    </div>
                                                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
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
                                                <h4 className="text-sm font-semibold flex items-center gap-1.5">
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
                                                <h4 className="text-sm font-semibold flex items-center gap-1.5">
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
                                                <h4 className="text-sm font-semibold flex items-center gap-1.5">
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
                    <div className="px-6 py-3.5 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Mã môn: <strong className="font-mono text-foreground">{course.courseCode}</strong></span>
                        <Button variant="outline" size="sm" onClick={onClose} className="rounded-lg h-8 px-4 text-xs">
                            Đóng
                        </Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}
