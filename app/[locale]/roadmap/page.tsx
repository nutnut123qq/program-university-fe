"use client"

import React, { useState, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    GitFork,
    Search,
    ArrowRight,
    ArrowLeft,
    Layers,
    BookOpen,
    Loader2,
    CheckCircle2,
    Sparkles,
    GraduationCap,
    Clock,
    RotateCcw,
    ChevronRight,
    ExternalLink,
} from "lucide-react"
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { fetchRoadmap, fetchRoadmapsIndex, fetchSyllabus } from "@/features/programs/api"
import { SyllabusDetailModal } from "@/features/programs/components/SyllabusDetailModal"
import { Curriculum } from "@/features/programs/types"

const POPULAR_SUBJECTS = [
    "SWE201c",
    "PRF192",
    "PRO192",
    "CSD201",
    "DBI202",
    "MAS291",
    "PRJ301",
    "SWP391",
    "SWT301",
    "MAE101",
]

export default function RoadmapPage() {
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedCode, setSelectedCode] = useState("SWE201c")
    const [syllabusModalCourse, setSyllabusModalCourse] = useState<Curriculum | null>(null)

    const { data: indexList } = useSWR("roadmaps-index", fetchRoadmapsIndex)
    const { data: currentRoadmap, isLoading: isRoadmapLoading } = useSWR(
        selectedCode ? ["roadmap", selectedCode] : null,
        () => fetchRoadmap(selectedCode)
    )
    const { data: currentSyllabus } = useSWR(
        selectedCode ? ["syllabus", selectedCode] : null,
        () => fetchSyllabus(selectedCode)
    )

    // Autocomplete suggestions
    const suggestions = useMemo(() => {
        if (!searchQuery.trim() || !indexList) return []
        const q = searchQuery.toLowerCase()
        return indexList.filter((code) => code.toLowerCase().includes(q)).slice(0, 8)
    }, [searchQuery, indexList])

    const handleSelectCode = (code: string) => {
        setSelectedCode(code)
        setSearchQuery("")
    }

    const openSyllabusFor = (code: string, name?: string) => {
        setSyllabusModalCourse({
            id: code,
            programId: "roadmap",
            programName: "FPT Roadmap",
            year: 2026,
            courseName: name || currentRoadmap?.names?.[code] || code,
            courseCode: code,
            credits: 3,
            mandatory: true,
            semester: 1,
            hoursTheory: null,
            hoursPractice: null,
            description: null,
            prerequisites: null,
            createdAt: "",
            updatedAt: "",
        })
    }

    const directPrereqs = currentRoadmap?.directPrereqs || []
    const unlocks = currentRoadmap?.unlocks || []
    const names = currentRoadmap?.names || {}

    return (
        <div className="container mx-auto py-8 px-4 sm:px-6 space-y-8 max-w-6xl">
            {/* Hero Header */}
            <motion.section
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="text-center space-y-3 max-w-3xl mx-auto"
            >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-semibold">
                    <GitFork className="w-3.5 h-3.5" />
                    <span>Sơ đồ Tiên quyết & Mở khóa Môn học</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                    Tra cứu Lộ trình Môn học (Roadmap)
                </h1>
                <p className="text-sm text-muted-foreground">
                    Nhập bất kỳ mã môn học nào để phân tích chuỗi môn cần học trước (Prerequisites) và các môn sẽ được mở khóa (Unlocks) trong các kỳ tiếp theo.
                </p>
            </motion.section>

            {/* Search and Popular Subject Chips */}
            <div className="max-w-2xl mx-auto space-y-3">
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Nhập mã môn học (ví dụ: SWE201c, PRF192, DBI202...)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-11 text-sm bg-card border-border shadow-sm rounded-xl"
                    />
                    {searchQuery && suggestions.length > 0 && (
                        <div className="absolute top-full mt-1 left-0 right-0 z-30 bg-card border border-border rounded-xl shadow-xl overflow-hidden divide-y divide-border">
                            {suggestions.map((code) => (
                                <button
                                    key={code}
                                    onClick={() => handleSelectCode(code)}
                                    className="w-full px-4 py-2.5 text-left text-sm font-mono hover:bg-muted transition-colors flex items-center justify-between"
                                >
                                    <span className="font-bold text-primary">{code}</span>
                                    <span className="text-xs text-muted-foreground">Xem lộ trình →</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Popular chips */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Môn phổ biến:</span>
                    {POPULAR_SUBJECTS.map((code) => (
                        <button
                            key={code}
                            onClick={() => handleSelectCode(code)}
                            className={`px-2.5 py-1 rounded-lg font-mono text-xs transition-all ${
                                selectedCode === code
                                    ? "bg-primary text-primary-foreground font-bold shadow-sm"
                                    : "bg-muted/70 text-foreground hover:bg-muted hover:border-primary/40 border border-transparent"
                            }`}
                        >
                            {code}
                        </button>
                    ))}
                </div>
            </div>

            {/* Target Subject Active Banner */}
            <Card className="border-border bg-card shadow-sm overflow-hidden">
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge className="font-mono text-sm font-extrabold px-2.5 py-0.5 bg-primary/10 text-primary border-primary/20">
                                    {selectedCode}
                                </Badge>
                                {currentSyllabus?.info?.credits && (
                                    <Badge variant="outline" className="font-mono text-xs text-emerald-600 bg-emerald-500/10">
                                        {currentSyllabus.info.credits} Tín chỉ
                                    </Badge>
                                )}
                                {currentSyllabus?.info?.minAvgToPass && (
                                    <Badge variant="secondary" className="text-xs">
                                        Điểm qua môn: ≥ {currentSyllabus.info.minAvgToPass}/10
                                    </Badge>
                                )}
                            </div>
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                {currentRoadmap?.subjectName || currentSyllabus?.info?.syllabusName || selectedCode}
                            </h2>
                            {currentSyllabus?.info?.syllabusEnglish && (
                                <p className="text-xs text-muted-foreground italic">
                                    {currentSyllabus.info.syllabusEnglish}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                onClick={() => openSyllabusFor(selectedCode, currentRoadmap?.subjectName)}
                                className="gap-1.5 h-9 text-xs rounded-xl shadow-sm"
                            >
                                <BookOpen className="w-3.5 h-3.5" />
                                <span>Xem Đề cương chi tiết (Syllabus)</span>
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 3-Column Visual Roadmap Flow */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold flex items-center gap-2">
                        <Layers className="w-4 h-4 text-primary" />
                        Sơ đồ Phân luồng Học tập
                    </h3>
                    <span className="text-xs text-muted-foreground font-mono">
                        {directPrereqs.length} môn tiên quyết · {unlocks.length} môn mở khóa
                    </span>
                </div>

                {isRoadmapLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <p className="text-sm">Đang tính toán sơ đồ lộ trình...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* 1. Môn Tiên Quyết (Prerequisites) */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 pb-2 border-b border-border">
                                <ArrowLeft className="w-4 h-4 text-amber-500" />
                                <h4 className="font-bold text-sm text-foreground">
                                    Môn cần học trước (Tiên quyết)
                                </h4>
                                <Badge variant="outline" className="font-mono text-xs ml-auto">
                                    {directPrereqs.length} môn
                                </Badge>
                            </div>

                            {directPrereqs.length === 0 ? (
                                <div className="p-6 rounded-2xl border border-dashed border-border bg-muted/20 text-center text-xs text-muted-foreground space-y-1">
                                    <Sparkles className="w-5 h-5 text-muted-foreground/40 mx-auto" />
                                    <p className="font-medium text-foreground">Không có môn tiên quyết</p>
                                    <p>Sinh viên có thể đăng ký học ngay từ các kỳ đầu mà không cần học trước môn nào.</p>
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {directPrereqs.map((code) => (
                                        <Card
                                            key={code}
                                            className="border-border bg-card/70 hover:bg-card hover:border-amber-500/50 transition-all shadow-sm group"
                                        >
                                            <CardContent className="p-3.5 space-y-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                                                        {code}
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                                                        Bắt buộc trước
                                                    </Badge>
                                                </div>
                                                <p className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">
                                                    {names[code] || "—"}
                                                </p>
                                                <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleSelectCode(code)}
                                                        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-primary gap-1"
                                                    >
                                                        <RotateCcw className="w-3 h-3" />
                                                        Đổi tiêu điểm
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openSyllabusFor(code)}
                                                        className="h-6 px-2 text-[11px] gap-1"
                                                    >
                                                        Đề cương <ChevronRight className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 2. Môn Trọng Tâm Hiện Tại (Center Target) */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-center gap-2 pb-2 border-b border-border text-center">
                                <CheckCircle2 className="w-4 h-4 text-primary" />
                                <h4 className="font-bold text-sm text-foreground">
                                    Môn Trọng Tâm Đang Xét
                                </h4>
                            </div>

                            <Card className="border-2 border-primary bg-primary/5 shadow-md">
                                <CardContent className="p-5 space-y-4 text-center">
                                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground mx-auto shadow-md">
                                        <GraduationCap className="w-7 h-7" />
                                    </div>
                                    <div>
                                        <Badge className="font-mono text-xs font-bold px-3 py-1 bg-primary text-primary-foreground">
                                            {selectedCode}
                                        </Badge>
                                        <h3 className="font-bold text-base text-foreground mt-2">
                                            {currentRoadmap?.subjectName || selectedCode}
                                        </h3>
                                    </div>

                                    {currentSyllabus?.info?.decisionNo && (
                                        <p className="text-[11px] text-muted-foreground">
                                            Quyết định: <span className="font-mono font-medium text-foreground">{currentSyllabus.info.decisionNo}</span>
                                        </p>
                                    )}

                                    <Button
                                        onClick={() => openSyllabusFor(selectedCode, currentRoadmap?.subjectName)}
                                        className="w-full gap-1.5 rounded-xl text-xs h-9"
                                    >
                                        <BookOpen className="w-3.5 h-3.5" />
                                        <span>Xem Bảng Điểm & Lịch Trình</span>
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>

                        {/* 3. Môn Được Mở Khóa Tiếp Theo (Unlocks) */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 pb-2 border-b border-border">
                                <ArrowRight className="w-4 h-4 text-emerald-500" />
                                <h4 className="font-bold text-sm text-foreground">
                                    Môn được mở khóa tiếp theo
                                </h4>
                                <Badge variant="outline" className="font-mono text-xs ml-auto text-emerald-600 bg-emerald-500/10">
                                    {unlocks.length} môn
                                </Badge>
                            </div>

                            {unlocks.length === 0 ? (
                                <div className="p-6 rounded-2xl border border-dashed border-border bg-muted/20 text-center text-xs text-muted-foreground space-y-1">
                                    <GraduationCap className="w-5 h-5 text-muted-foreground/40 mx-auto" />
                                    <p className="font-medium text-foreground">Môn giai đoạn cuối / Đồ án tốt nghiệp</p>
                                    <p>Môn này là chặng kết thúc, không làm điều kiện tiên quyết cho môn nào khác.</p>
                                </div>
                            ) : (
                                <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                                    {unlocks.map((code) => (
                                        <Card
                                            key={code}
                                            className="border-border bg-card/70 hover:bg-card hover:border-emerald-500/50 transition-all shadow-sm group"
                                        >
                                            <CardContent className="p-3.5 space-y-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                                        {code}
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                                        Mở khóa
                                                    </Badge>
                                                </div>
                                                <p className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">
                                                    {names[code] || "—"}
                                                </p>
                                                <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleSelectCode(code)}
                                                        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-primary gap-1"
                                                    >
                                                        <RotateCcw className="w-3 h-3" />
                                                        Đổi tiêu điểm
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openSyllabusFor(code)}
                                                        className="h-6 px-2 text-[11px] gap-1"
                                                    >
                                                        Đề cương <ChevronRight className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Syllabus Modal */}
            <SyllabusDetailModal
                course={syllabusModalCourse}
                open={!!syllabusModalCourse}
                onClose={() => setSyllabusModalCourse(null)}
                onSelectCourseCode={(code) => {
                    handleSelectCode(code)
                    openSyllabusFor(code)
                }}
            />
        </div>
    )
}
