"use client"

import React, { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Curriculum } from "../types"
import { GitCommit, Layers, Maximize2, RotateCcw, Filter, CheckCircle2 } from "lucide-react"

interface PrerequisiteGraphProps {
    courses: Curriculum[]
}

const getBlockColor = (kb?: string | null) => {
    if (!kb) return "bg-purple-500/10 border-purple-500/40 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20"
    const lower = kb.toLowerCase()
    if (lower.includes("đại cương")) return "bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
    if (lower.includes("cơ sở")) return "bg-indigo-500/10 border-indigo-500/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20"
    if (lower.includes("chuyên ngành") || lower.includes("ngành")) return "bg-purple-500/10 border-purple-500/40 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20"
    if (lower.includes("tốt nghiệp") || lower.includes("thực tập") || lower.includes("đồ án")) return "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
    return "bg-slate-500/10 border-slate-500/40 text-slate-600 dark:text-slate-400 hover:bg-slate-500/20"
}

export const PrerequisiteGraph: React.FC<PrerequisiteGraphProps> = ({ courses }) => {
    const [selectedCourse, setSelectedCourse] = useState<Curriculum | null>(null)
    const [activeBlockFilter, setActiveBlockFilter] = useState<string>("all")
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false)

    // Group courses by semester
    const semesters = useMemo(() => {
        const map = new Map<number, Curriculum[]>()
        for (let i = 1; i <= 8; i++) map.set(i, [])

        courses.forEach((course) => {
            const sem = course.semester || 1
            const clampedSem = Math.min(Math.max(sem, 1), 8)
            const list = map.get(clampedSem) || []
            list.push(course)
            map.set(clampedSem, list)
        })

        return map
    }, [courses])

    // Find prerequisite and unlocked courses
    const { prereqCodes, unlockedCodes } = useMemo(() => {
        if (!selectedCourse) return { prereqCodes: new Set<string>(), unlockedCodes: new Set<string>() }

        const prereq = new Set<string>()
        if (selectedCourse.prerequisites) {
            selectedCourse.prerequisites.split(/[,;\n]/).forEach((p) => {
                const trimmed = p.trim()
                if (trimmed) prereq.add(trimmed.toLowerCase())
            })
        }

        const unlocked = new Set<string>()
        const targetCode = (selectedCourse.courseCode || "").toLowerCase()
        const targetName = (selectedCourse.courseName || "").toLowerCase()

        courses.forEach((c) => {
            if (c.prerequisites) {
                const lowerPre = c.prerequisites.toLowerCase()
                if ((targetCode && lowerPre.includes(targetCode)) || lowerPre.includes(targetName)) {
                    if (c.courseCode) unlocked.add(c.courseCode.toLowerCase())
                }
            }
        })

        return { prereqCodes: prereq, unlockedCodes: unlocked }
    }, [selectedCourse, courses])

    if (!courses || courses.length === 0) {
        return (
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-xl">
                Không có dữ liệu môn học để dựng Sơ đồ Cây Tiên quyết.
            </div>
        )
    }

    return (
        <div className={`space-y-4 ${isFullscreen ? "fixed inset-4 z-50 bg-background p-6 rounded-2xl border shadow-2xl overflow-y-auto" : ""}`}>
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-primary" />
                        <h3 className="font-extrabold text-base">Sơ đồ Cây Môn học Tiên quyết (DAG Graph)</h3>
                        <Badge variant="outline" className="font-mono text-xs bg-primary/10 text-primary border-primary/20">
                            {courses.length} môn học
                        </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Nhấp vào môn bất kỳ để xem các môn bắt buộc học trước và môn được mở khóa sau.
                    </p>
                </div>

                {/* Filter and View Controls */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Knowledge Block Filter */}
                    <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border text-xs">
                        <Filter className="w-3.5 h-3.5 text-muted-foreground ml-1" />
                        <button
                            onClick={() => setActiveBlockFilter("all")}
                            className={`px-2 py-0.5 rounded font-medium transition-colors ${activeBlockFilter === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                        >
                            Tất cả
                        </button>
                        <button
                            onClick={() => setActiveBlockFilter("đại cương")}
                            className={`px-2 py-0.5 rounded font-medium transition-colors ${activeBlockFilter === "đại cương" ? "bg-blue-500/20 text-blue-500 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                        >
                            Đại cương
                        </button>
                        <button
                            onClick={() => setActiveBlockFilter("cơ sở")}
                            className={`px-2 py-0.5 rounded font-medium transition-colors ${activeBlockFilter === "cơ sở" ? "bg-indigo-500/20 text-indigo-500 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                        >
                            Cơ sở
                        </button>
                        <button
                            onClick={() => setActiveBlockFilter("chuyên ngành")}
                            className={`px-2 py-0.5 rounded font-medium transition-colors ${activeBlockFilter === "chuyên ngành" ? "bg-purple-500/20 text-purple-500 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                        >
                            Chuyên ngành
                        </button>
                    </div>

                    {selectedCourse && (
                        <Button size="sm" variant="ghost" onClick={() => setSelectedCourse(null)} className="h-8 text-xs gap-1">
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Bỏ chọn</span>
                        </Button>
                    )}

                    <Button size="sm" variant="outline" onClick={() => setIsFullscreen(!isFullscreen)} className="h-8 text-xs gap-1">
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>{isFullscreen ? "Thu nhỏ" : "Toàn màn hình"}</span>
                    </Button>
                </div>
            </div>

            {/* Legend Bar */}
            <div className="flex flex-wrap items-center gap-4 text-xs bg-muted/20 p-2.5 rounded-xl border">
                <span className="font-semibold text-muted-foreground">Chú thích:</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Đại cương</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Cơ sở ngành</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Chuyên ngành</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Tốt nghiệp</span>
                {selectedCourse && (
                    <span className="ml-auto font-medium text-primary flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Đang chọn: <strong>{selectedCourse.courseName}</strong>
                    </span>
                )}
            </div>

            {/* DAG Semesters Columns Container */}
            <div className="overflow-x-auto pb-4">
                <div className="flex gap-4 min-w-[1200px]">
                    {Array.from(semesters.entries()).map(([semNum, semCourses]) => {
                        const filteredSemCourses = semCourses.filter((c) => {
                            if (activeBlockFilter === "all") return true
                            return (c.knowledgeBlock || "").toLowerCase().includes(activeBlockFilter)
                        })

                        const semCredits = filteredSemCourses.reduce((sum, c) => sum + (c.credits || 3), 0)

                        return (
                            <div key={semNum} className="flex-1 min-w-[150px] bg-muted/10 border rounded-xl p-3 space-y-3">
                                {/* Semester Column Header */}
                                <div className="border-b pb-2 text-center">
                                    <h4 className="font-bold text-xs text-foreground uppercase tracking-wider">Học kỳ {semNum}</h4>
                                    <span className="text-[10px] text-muted-foreground font-mono font-medium">
                                        {filteredSemCourses.length} môn ({semCredits} TC)
                                    </span>
                                </div>

                                {/* Courses List */}
                                <div className="space-y-2">
                                    {filteredSemCourses.map((c) => {
                                        const cCode = (c.courseCode || "").toLowerCase()
                                        const cName = (c.courseName || "").toLowerCase()
                                        const isSelected = selectedCourse?.id === c.id

                                        const isPrereq = selectedCourse && (prereqCodes.has(cCode) || (cCode && prereqCodes.has(cName)))
                                        const isUnlocked = selectedCourse && (unlockedCodes.has(cCode) || (cCode && unlockedCodes.has(cName)))

                                        let borderHighlight = "border-border/60"
                                        if (isSelected) borderHighlight = "ring-2 ring-primary border-primary bg-primary/20 shadow-md scale-105"
                                        else if (isPrereq) borderHighlight = "ring-2 ring-amber-500 border-amber-500 bg-amber-500/10 shadow-sm"
                                        else if (isUnlocked) borderHighlight = "ring-2 ring-emerald-500 border-emerald-500 bg-emerald-500/10 shadow-sm"

                                        return (
                                            <Card
                                                key={c.id}
                                                onClick={() => setSelectedCourse(isSelected ? null : c)}
                                                className={`p-2.5 text-xs cursor-pointer transition-all duration-200 border hover:shadow-md ${getBlockColor(
                                                    c.knowledgeBlock
                                                )} ${borderHighlight}`}
                                            >
                                                <div className="flex items-start justify-between gap-1">
                                                    <span className="font-mono font-bold text-[10px] opacity-80">{c.courseCode || "—"}</span>
                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono bg-background/60">
                                                        {c.credits || 3} TC
                                                    </Badge>
                                                </div>
                                                <p className="font-medium text-xs mt-1 line-clamp-2 leading-tight">{c.courseName}</p>
                                                {c.prerequisites && (
                                                    <div className="mt-1.5 pt-1 border-t border-border/30 flex items-center gap-1 text-[9px] opacity-70 truncate">
                                                        <GitCommit className="w-2.5 h-2.5 shrink-0" />
                                                        <span className="truncate">TQ: {c.prerequisites}</span>
                                                    </div>
                                                )}
                                            </Card>
                                        )
                                    })}

                                    {filteredSemCourses.length === 0 && (
                                        <div className="py-6 text-center text-[11px] text-muted-foreground italic">Trống</div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
