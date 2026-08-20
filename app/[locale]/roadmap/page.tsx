"use client"

import React, { useState, useMemo } from "react"
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
    X,
    HelpCircle,
    ArrowDown,
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
    "OSG202",
    "NWC203c",
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
                transition={{ duration: 0.3 }}
                className="text-center space-y-3 max-w-3xl mx-auto"
            >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-semibold">
                    <GitFork className="w-3.5 h-3.5" />
                    <span>Sơ đồ Tiên quyết & Mở khóa Môn học</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
                    Tra cứu Lộ trình Môn học (Roadmap)
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
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
                        className="pl-10 pr-10 h-12 text-sm bg-card border-border shadow-sm rounded-2xl focus-visible:ring-1 focus-visible:ring-primary"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                            aria-label="Xóa tìm kiếm"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}

                    {searchQuery && suggestions.length > 0 && (
                        <div className="absolute top-full mt-1.5 left-0 right-0 z-30 bg-card border border-border rounded-2xl shadow-xl overflow-hidden divide-y divide-border">
                            {suggestions.map((code) => (
                                <button
                                    key={code}
                                    onClick={() => handleSelectCode(code)}
                                    className="w-full px-4 py-3 text-left text-sm font-mono hover:bg-muted transition-colors flex items-center justify-between group"
                                >
                                    <span className="font-bold text-foreground group-hover:text-primary transition-colors">{code}</span>
                                    <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1 font-sans">
                                        Xem lộ trình <ArrowRight className="w-3.5 h-3.5" />
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Popular chips */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
                    <span className="text-muted-foreground font-medium mr-1">Môn phổ biến:</span>
                    {POPULAR_SUBJECTS.map((code) => (
                        <button
                            key={code}
                            onClick={() => handleSelectCode(code)}
                            className={`px-3 py-1 rounded-xl font-mono text-xs transition-all duration-200 ${
                                selectedCode === code
                                    ? "bg-primary text-primary-foreground font-bold shadow-sm scale-105"
                                    : "bg-muted/80 text-foreground hover:bg-muted hover:border-primary/40 border border-transparent"
                            }`}
                        >
                            {code}
                        </button>
                    ))}
                </div>
            </div>

            {/* Target Subject Active Banner */}
            <Card className="border-border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden rounded-2xl">
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge className="font-mono text-sm font-extrabold px-3 py-0.5 bg-primary/10 text-primary border-primary/20">
                                    {selectedCode}
                                </Badge>
                                {currentSyllabus?.info?.credits && (
                                    <Badge variant="outline" className="font-mono text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 font-bold">
                                        {currentSyllabus.info.credits} Tín chỉ
                                    </Badge>
                                )}
                                {currentSyllabus?.info?.minAvgToPass && (
                                    <Badge variant="secondary" className="text-xs font-semibold">
                                        Điểm qua môn: ≥ {currentSyllabus.info.minAvgToPass} / 10
                                    </Badge>
                                )}
                            </div>
                            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground truncate">
                                {currentRoadmap?.subjectName || currentSyllabus?.info?.syllabusName || selectedCode}
                            </h2>
                            {currentSyllabus?.info?.syllabusEnglish && (
                                <p className="text-xs text-muted-foreground italic truncate">
                                    {currentSyllabus.info.syllabusEnglish}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                onClick={() => openSyllabusFor(selectedCode, currentRoadmap?.subjectName)}
                                className="gap-2 h-10 px-4 text-xs font-bold rounded-xl shadow-sm hover:scale-[1.02] transition-all"
                            >
                                <BookOpen className="w-4 h-4" />
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
                        <span>Sơ đồ Phân luồng Học tập & Quan hệ Nhân quả</span>
                    </h3>
                    <span className="text-xs text-muted-foreground font-mono font-medium">
                        {directPrereqs.length} môn tiên quyết · {unlocks.length} môn mở khóa
                    </span>
                </div>

                {isRoadmapLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <p className="text-sm font-medium">Đang tính toán sơ đồ lộ trình...</p>
                    </div>
                ) : !currentRoadmap && !isRoadmapLoading ? (
                    <div className="p-12 rounded-3xl border border-dashed border-border text-center space-y-3 bg-muted/10">
                        <HelpCircle className="w-10 h-10 text-muted-foreground/50 mx-auto" />
                        <h4 className="font-bold text-base text-foreground">Không tìm thấy dữ liệu lộ trình</h4>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                            Hãy thử chọn một môn học từ danh sách gợi ý phía trên.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                        {/* 1. Môn Tiên Quyết (Prerequisites) */}
                        <div className="space-y-3 flex flex-col h-full">
                            <div className="flex items-center gap-2 pb-2.5 border-b border-border">
                                <ArrowLeft className="w-4 h-4 text-amber-500 shrink-0" />
                                <h4 className="font-bold text-sm text-foreground">
                                    1. Môn cần học trước (Tiên quyết)
                                </h4>
                                <Badge variant="outline" className="font-mono text-xs ml-auto">
                                    {directPrereqs.length} môn
                                </Badge>
                            </div>

                            {directPrereqs.length === 0 ? (
                                <div className="p-6 rounded-2xl border border-dashed border-border bg-muted/20 text-center text-xs text-muted-foreground space-y-1.5 flex-1 flex flex-col items-center justify-center">
                                    <Sparkles className="w-5 h-5 text-muted-foreground/50 mx-auto" />
                                    <p className="font-bold text-foreground">Không có môn tiên quyết</p>
                                    <p className="leading-relaxed">Sinh viên có thể đăng ký học ngay từ các kỳ đầu mà không cần điều kiện môn học trước.</p>
                                </div>
                            ) : (
                                <div className="space-y-2.5 flex-1">
                                    {directPrereqs.map((code) => (
                                        <Card
                                            key={code}
                                            className="border-border bg-card/80 hover:bg-card hover:border-amber-500/50 transition-all duration-200 shadow-sm hover:shadow-md group rounded-xl"
                                        >
                                            <CardContent className="p-4 space-y-2.5">
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="font-mono text-xs font-black text-amber-600 dark:text-amber-400">
                                                        {code}
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-bold">
                                                        Bắt buộc trước
                                                    </Badge>
                                                </div>
                                                <p className="text-xs font-bold text-foreground line-clamp-2 leading-snug">
                                                    {names[code] || "—"}
                                                </p>
                                                <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleSelectCode(code)}
                                                        className="h-7 px-2.5 text-[11px] font-semibold text-muted-foreground hover:text-primary gap-1 rounded-lg"
                                                    >
                                                        <RotateCcw className="w-3 h-3" />
                                                        Đổi tiêu điểm
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openSyllabusFor(code)}
                                                        className="h-7 px-2.5 text-[11px] font-semibold gap-1 rounded-lg"
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
                        <div className="space-y-3 flex flex-col h-full">
                            <div className="flex items-center justify-center gap-2 pb-2.5 border-b border-border text-center">
                                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                                <h4 className="font-bold text-sm text-foreground">
                                    2. Môn Trọng Tâm Đang Xét
                                </h4>
                            </div>

                            <Card className="border-2 border-primary bg-primary/5 shadow-md rounded-2xl flex-1 flex flex-col justify-center">
                                <CardContent className="p-6 space-y-4 text-center">
                                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mx-auto shadow-md">
                                        <GraduationCap className="w-8 h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <Badge className="font-mono text-xs font-black px-3 py-1 bg-primary text-primary-foreground">
                                            {selectedCode}
                                        </Badge>
                                        <h3 className="font-black text-base text-foreground mt-2 leading-tight">
                                            {currentRoadmap?.subjectName || selectedCode}
                                        </h3>
                                    </div>

                                    {currentSyllabus?.info?.decisionNo && (
                                        <p className="text-[11px] text-muted-foreground">
                                            QĐ Ban hành: <span className="font-mono font-bold text-foreground">{currentSyllabus.info.decisionNo}</span>
                                        </p>
                                    )}

                                    <Button
                                        onClick={() => openSyllabusFor(selectedCode, currentRoadmap?.subjectName)}
                                        className="w-full gap-2 rounded-xl text-xs font-bold h-10 shadow-sm"
                                    >
                                        <BookOpen className="w-4 h-4" />
                                        <span>Xem Bảng Điểm & Lịch Trình</span>
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>

                        {/* 3. Môn Được Mở Khóa Tiếp Theo (Unlocks) */}
                        <div className="space-y-3 flex flex-col h-full">
                            <div className="flex items-center gap-2 pb-2.5 border-b border-border">
                                <ArrowRight className="w-4 h-4 text-emerald-500 shrink-0" />
                                <h4 className="font-bold text-sm text-foreground">
                                    3. Môn được mở khóa tiếp theo
                                </h4>
                                <Badge variant="outline" className="font-mono text-xs ml-auto text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 font-bold">
                                    {unlocks.length} môn
                                </Badge>
                            </div>

                            {unlocks.length === 0 ? (
                                <div className="p-6 rounded-2xl border border-dashed border-border bg-muted/20 text-center text-xs text-muted-foreground space-y-1.5 flex-1 flex flex-col items-center justify-center">
                                    <GraduationCap className="w-5 h-5 text-muted-foreground/50 mx-auto" />
                                    <p className="font-bold text-foreground">Môn giai đoạn cuối / Khóa luận tốt nghiệp</p>
                                    <p className="leading-relaxed">Môn này là chặng kết thúc, không làm điều kiện tiên quyết cho môn nào khác.</p>
                                </div>
                            ) : (
                                <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1 flex-1">
                                    {unlocks.map((code) => (
                                        <Card
                                            key={code}
                                            className="border-border bg-card/80 hover:bg-card hover:border-emerald-500/50 transition-all duration-200 shadow-sm hover:shadow-md group rounded-xl"
                                        >
                                            <CardContent className="p-4 space-y-2.5">
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400">
                                                        {code}
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold">
                                                        Mở khóa
                                                    </Badge>
                                                </div>
                                                <p className="text-xs font-bold text-foreground line-clamp-2 leading-snug">
                                                    {names[code] || "—"}
                                                </p>
                                                <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleSelectCode(code)}
                                                        className="h-7 px-2.5 text-[11px] font-semibold text-muted-foreground hover:text-primary gap-1 rounded-lg"
                                                    >
                                                        <RotateCcw className="w-3 h-3" />
                                                        Đổi tiêu điểm
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openSyllabusFor(code)}
                                                        className="h-7 px-2.5 text-[11px] font-semibold gap-1 rounded-lg"
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
