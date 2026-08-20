"use client"

import React, { useState, useMemo } from "react"
import { motion } from "framer-motion"
import {
    BookOpen,
    Search,
    ExternalLink,
    GraduationCap,
    CheckCircle2,
    Sparkles,
    Filter,
    Layers,
    FileText,
    ChevronRight,
    Loader2,
} from "lucide-react"
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { fetchMaterials } from "@/features/programs/api"
import { SyllabusDetailModal } from "@/features/programs/components/SyllabusDetailModal"
import { Curriculum, SubjectMaterialSummary } from "@/features/programs/types"

type FilterType = "all" | "coursera" | "textbook"

export default function MaterialsPage() {
    const [searchQuery, setSearchQuery] = useState("")
    const [filterType, setFilterType] = useState<FilterType>("all")
    const [page, setPage] = useState(1)
    const PAGE_SIZE = 16

    const [selectedCourseForSyllabus, setSelectedCourseForSyllabus] = useState<Curriculum | null>(null)

    const { data: materialsList, isLoading } = useSWR("materials-list", fetchMaterials)

    const filteredMaterials = useMemo(() => {
        if (!materialsList) return []
        let result = [...materialsList]

        if (filterType === "coursera") {
            result = result.filter((m) => m.hasCoursera)
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            result = result.filter((item) => {
                const matchesSubject =
                    item.subjectCode.toLowerCase().includes(q) ||
                    item.subjectName.toLowerCase().includes(q) ||
                    (item.subjectEnglish && item.subjectEnglish.toLowerCase().includes(q))

                const matchesMaterials = item.materials.some(
                    (m) =>
                        m.materialDescription.toLowerCase().includes(q) ||
                        (m.author && m.author.toLowerCase().includes(q)) ||
                        (m.publisher && m.publisher.toLowerCase().includes(q)) ||
                        (m.isbn && m.isbn.toLowerCase().includes(q))
                )

                return matchesSubject || matchesMaterials
            })
        }

        return result
    }, [materialsList, searchQuery, filterType])

    const totalCount = filteredMaterials.length
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    const pagedItems = filteredMaterials.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const courseraCount = useMemo(() => {
        return (materialsList || []).filter((m) => m.hasCoursera).length
    }, [materialsList])

    const openSyllabus = (item: SubjectMaterialSummary) => {
        setSelectedCourseForSyllabus({
            id: item.subjectCode,
            programId: "materials",
            programName: "FPT Materials",
            year: 2026,
            courseName: item.subjectName,
            courseCode: item.subjectCode,
            credits: Number(item.credits) || 3,
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
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Kho Giáo trình & Khóa học Trực tuyến</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                    Thư viện Giáo trình & Coursera
                </h1>
                <p className="text-sm text-muted-foreground">
                    Tra cứu toàn bộ tài liệu học tập chính thống, sách giáo trình, ISBN và các khóa học Coursera/EdX được tích hợp trong chương trình đào tạo.
                </p>
            </motion.section>

            {/* Filter Bar & Search */}
            <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Tìm kiếm theo mã môn, tên môn, tên sách, tác giả, Coursera..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value)
                                setPage(1)
                            }}
                            className="pl-10 h-11 text-sm bg-card border-border shadow-sm rounded-xl"
                        />
                    </div>

                    {/* Filter Buttons */}
                    <div className="flex items-center gap-2">
                        <Button
                            variant={filterType === "all" ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                                setFilterType("all")
                                setPage(1)
                            }}
                            className="h-11 px-4 text-xs rounded-xl"
                        >
                            Tất cả ({materialsList?.length || 0})
                        </Button>
                        <Button
                            variant={filterType === "coursera" ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                                setFilterType("coursera")
                                setPage(1)
                            }}
                            className="h-11 px-4 text-xs rounded-xl gap-1.5"
                        >
                            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                            <span>Có Coursera ({courseraCount})</span>
                        </Button>
                    </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                    <span>
                        Hiển thị <strong>{pagedItems.length}</strong> / <strong>{totalCount}</strong> môn học
                    </span>
                    {searchQuery && (
                        <button
                            onClick={() => {
                                setSearchQuery("")
                                setPage(1)
                            }}
                            className="text-primary hover:underline"
                        >
                            Xóa bộ lọc tìm kiếm
                        </button>
                    )}
                </div>
            </div>

            {/* Content List */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm">Đang tải danh mục giáo trình...</p>
                </div>
            ) : pagedItems.length === 0 ? (
                <div className="p-12 rounded-2xl border border-dashed text-center text-muted-foreground space-y-2">
                    <BookOpen className="w-8 h-8 mx-auto text-muted-foreground/50" />
                    <h3 className="font-semibold text-base text-foreground">Không tìm thấy tài liệu phù hợp</h3>
                    <p className="text-xs">Hãy thử tìm với từ khóa hoặc mã môn khác.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pagedItems.map((item) => (
                        <Card
                            key={item.subjectCode}
                            className="border-border bg-card/70 hover:bg-card transition-all shadow-sm hover:shadow-md flex flex-col justify-between"
                        >
                            <CardContent className="p-5 space-y-3.5">
                                {/* Header */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="space-y-1 min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <Badge className="font-mono text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                                                {item.subjectCode}
                                            </Badge>
                                            <Badge variant="outline" className="font-mono text-[10px]">
                                                {item.credits} TC
                                            </Badge>
                                            {item.hasCoursera && (
                                                <Badge className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20 gap-1 font-medium">
                                                    <Sparkles className="w-2.5 h-2.5" />
                                                    Coursera
                                                </Badge>
                                            )}
                                        </div>
                                        <h3 className="font-bold text-sm text-foreground line-clamp-2 leading-snug">
                                            {item.subjectName}
                                        </h3>
                                        {item.subjectEnglish && (
                                            <p className="text-xs text-muted-foreground italic truncate">
                                                {item.subjectEnglish}
                                            </p>
                                        )}
                                    </div>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openSyllabus(item)}
                                        className="h-8 px-2.5 text-xs shrink-0 rounded-lg"
                                    >
                                        Đề cương
                                    </Button>
                                </div>

                                {/* Materials Items List */}
                                <div className="pt-2 border-t border-border/50 space-y-2">
                                    {item.materials.slice(0, 3).map((m, idx) => {
                                        return (
                                            <div
                                                key={idx}
                                                className="p-2.5 rounded-xl bg-muted/40 border border-border/40 text-xs space-y-1"
                                            >
                                                {m.isUrl ? (
                                                    <a
                                                        href={m.materialDescription}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-primary font-medium hover:underline inline-flex items-center gap-1.5 break-all"
                                                    >
                                                        <ExternalLink className="w-3 h-3 shrink-0" />
                                                        {m.materialDescription}
                                                    </a>
                                                ) : (
                                                    <p className="font-medium text-foreground leading-snug">
                                                        {m.materialDescription}
                                                    </p>
                                                )}

                                                {(m.author || m.publisher || m.isbn) && (
                                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                                                        {m.author && <span>Tác giả: <strong className="text-foreground/80">{m.author}</strong></span>}
                                                        {m.publisher && <span>NXB: {m.publisher}</span>}
                                                        {m.isbn && <span>ISBN: <strong className="font-mono">{m.isbn}</strong></span>}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}

                                    {item.materials.length > 3 && (
                                        <button
                                            onClick={() => openSyllabus(item)}
                                            className="text-[11px] text-primary hover:underline font-medium pt-1 block"
                                        >
                                            + Xem thêm {item.materials.length - 3} tài liệu khác trong đề cương →
                                        </button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="rounded-lg text-xs"
                    >
                        Trang trước
                    </Button>
                    <span className="text-xs font-medium px-3 text-muted-foreground font-mono">
                        Trang {page} / {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="rounded-lg text-xs"
                    >
                        Trang sau
                    </Button>
                </div>
            )}

            {/* Syllabus Detail Modal */}
            <SyllabusDetailModal
                course={selectedCourseForSyllabus}
                open={!!selectedCourseForSyllabus}
                onClose={() => setSelectedCourseForSyllabus(null)}
            />
        </div>
    )
}
