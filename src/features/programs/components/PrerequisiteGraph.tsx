"use client"

import React, { useState, useMemo } from "react"
import { Curriculum } from "../types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sparkles, Network, ArrowRight, CheckCircle2, Info, RefreshCw } from "lucide-react"

interface PrerequisiteGraphProps {
    courses: Curriculum[]
}

interface GraphEdge {
    from: string
    to: string
    fromName: string
    toName: string
}

export function PrerequisiteGraph({ courses }: PrerequisiteGraphProps) {
    const [selectedCourseCode, setSelectedCourseCode] = useState<string | null>(null)

    // Group courses by semester
    const semesters = useMemo(() => {
        const map = new Map<number, Curriculum[]>()
        courses.forEach(c => {
            const sem = c.semester || 1
            if (!map.has(sem)) map.set(sem, [])
            map.get(sem)!.push(c)
        })

        const keys = Array.from(map.keys()).sort((a, b) => a - b)
        return keys.map(k => ({
            semester: k,
            courses: map.get(k)!
        }))
    }, [courses])

    // Generate directed edges (DAG)
    const edges = useMemo(() => {
        const list: GraphEdge[] = []
        const codeToCourse = new Map<string, Curriculum>()
        courses.forEach(c => {
            if (c.courseCode) codeToCourse.set(c.courseCode.toLowerCase().trim(), c)
            if (c.courseName) codeToCourse.set(c.courseName.toLowerCase().trim(), c)
        })

        courses.forEach(c => {
            if (c.prerequisites) {
                const reqs = c.prerequisites.split(/[,;|]+/)
                reqs.forEach(r => {
                    const cleanReq = r.trim().toLowerCase()
                    const target = codeToCourse.get(cleanReq)
                    if (target && target.courseCode !== c.courseCode) {
                        list.push({
                            from: target.courseCode || target.id,
                            to: c.courseCode || c.id,
                            fromName: target.courseName,
                            toName: c.courseName
                        })
                    }
                })
            }
        })

        // Fallback DAG generation based on sequence if explicit prerequisites are sparse
        if (list.length === 0 && courses.length > 1) {
            for (let i = 0; i < courses.length - 1; i++) {
                const curr = courses[i]
                const next = courses[i + 1]
                if (curr.semester && next.semester && next.semester > curr.semester) {
                    if ((curr.knowledgeBlock === "Đại cương" && next.knowledgeBlock === "Cơ sở ngành") ||
                        (curr.knowledgeBlock === "Cơ sở ngành" && next.knowledgeBlock === "Chuyên ngành") ||
                        (next.knowledgeBlock === "Tốt nghiệp")) {
                        list.push({
                            from: curr.courseCode || curr.id,
                            to: next.courseCode || next.id,
                            fromName: curr.courseName,
                            toName: next.courseName
                        })
                    }
                }
            }
        }

        return list
    }, [courses])

    // Highlighted paths when a course is selected
    const highlightedNodes = useMemo(() => {
        if (!selectedCourseCode) return new Set<string>()
        const set = new Set<string>([selectedCourseCode])

        // Add prerequisites (from -> selected)
        edges.forEach(e => {
            if (e.to === selectedCourseCode) set.add(e.from)
        })

        // Add dependents (selected -> to)
        edges.forEach(e => {
            if (e.from === selectedCourseCode) set.add(e.to)
        })

        return set
    }, [selectedCourseCode, edges])

    const getBlockColor = (kb?: string | null) => {
        switch (kb) {
            case "Đại cương":
                return "bg-blue-500/10 text-blue-500 border-blue-500/30 hover:bg-blue-500/20"
            case "Cơ sở ngành":
                return "bg-indigo-500/10 text-indigo-500 border-indigo-500/30 hover:bg-indigo-500/20"
            case "Chuyên ngành":
                return "bg-purple-500/10 text-purple-500 border-purple-500/30 hover:bg-purple-500/20"
            case "Tốt nghiệp":
            case "Thực tập":
                return "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20"
            default:
                return "bg-muted text-muted-foreground border-border hover:bg-muted/80"
        }
    }

    if (!courses || courses.length === 0) {
        return (
            <div className="p-8 text-center text-muted-foreground border rounded-xl bg-muted/10">
                <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">Chưa có dữ liệu môn học để dựng sơ đồ cây tiên quyết.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header & Stats Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border bg-card/60 backdrop-blur">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                        <Network className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm flex items-center gap-2">
                            <span>Sơ đồ Cây Môn học Tiên quyết (Prerequisite DAG Graph)</span>
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                Interactive Visualizer
                            </Badge>
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Trực quan hóa lộ trình tiến trình {semesters.length} học kỳ & liên kết tiên quyết
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary" className="font-mono">
                        {courses.length} Môn học
                    </Badge>
                    <Badge variant="secondary" className="font-mono">
                        {edges.length} Liên kết
                    </Badge>
                    {selectedCourseCode && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1"
                            onClick={() => setSelectedCourseCode(null)}
                        >
                            <RefreshCw className="w-3 h-3" />
                            <span>Bỏ chọn</span>
                        </Button>
                    )}
                </div>
            </div>

            {/* Knowledge Block Legend */}
            <div className="flex flex-wrap items-center gap-3 text-xs border-b pb-3">
                <span className="font-semibold text-muted-foreground">Chú giải Khối kiến thức:</span>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
                    Đại cương
                </Badge>
                <Badge variant="outline" className="bg-indigo-500/10 text-indigo-500 border-indigo-500/30">
                    Cơ sở ngành
                </Badge>
                <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/30">
                    Chuyên ngành
                </Badge>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                    Tốt nghiệp / Khóa luận
                </Badge>
            </div>

            {/* Interactive DAG Graph Tiers (Semesters) */}
            <div className="relative overflow-x-auto pb-4">
                <div className="flex gap-4 min-w-[800px]">
                    {semesters.map(s => (
                        <div key={s.semester} className="flex-1 min-w-[160px] space-y-3">
                            <div className="p-2 text-center rounded-lg bg-muted/40 border text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                Học kỳ {s.semester} ({s.courses.length} môn)
                            </div>

                            <div className="space-y-2">
                                {s.courses.map(c => {
                                    const code = c.courseCode || c.id
                                    const isSelected = selectedCourseCode === code
                                    const isHighlighted = highlightedNodes.has(code)

                                    return (
                                        <div
                                            key={c.id}
                                            onClick={() => setSelectedCourseCode(isSelected ? null : code)}
                                            className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${getBlockColor(c.knowledgeBlock)} ${
                                                isSelected
                                                    ? "ring-2 ring-primary border-primary shadow-lg scale-105"
                                                    : isHighlighted
                                                    ? "ring-1 ring-amber-400 border-amber-400 opacity-100"
                                                    : selectedCourseCode
                                                    ? "opacity-40"
                                                    : "opacity-100"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between font-mono font-bold text-[10px] mb-1">
                                                <span>{c.courseCode || "MÔN HỌC"}</span>
                                                <Badge variant="outline" className="text-[9px] px-1 py-0">
                                                    {c.credits || 3} TC
                                                </Badge>
                                            </div>
                                            <div className="font-semibold leading-snug line-clamp-2">{c.courseName}</div>
                                            {c.prerequisites && (
                                                <div className="mt-2 pt-1 border-t border-border/40 text-[9px] opacity-80 flex items-center gap-1">
                                                    <ArrowRight className="w-2.5 h-2.5" />
                                                    <span className="truncate">TQ: {c.prerequisites}</span>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Selected Node Details Summary Footer */}
            {selectedCourseCode && (
                <div className="p-4 rounded-xl border bg-primary/5 border-primary/20 space-y-2 animate-in fade-in">
                    <div className="flex items-center gap-2 text-xs font-bold text-primary">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Chi tiết Liên kết Môn học đang chọn: {selectedCourseCode}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div>
                            <span className="font-semibold text-muted-foreground block mb-1">Môn tiên quyết cần học trước:</span>
                            <div className="flex flex-wrap gap-1">
                                {edges.filter(e => e.to === selectedCourseCode).map((e, idx) => (
                                    <Badge key={idx} variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
                                        {e.fromName} ({e.from})
                                    </Badge>
                                ))}
                                {edges.filter(e => e.to === selectedCourseCode).length === 0 && (
                                    <span className="text-muted-foreground italic">Không có môn tiên quyết bắt buộc.</span>
                                )}
                            </div>
                        </div>

                        <div>
                            <span className="font-semibold text-muted-foreground block mb-1">Môn học tiếp theo được mở khóa:</span>
                            <div className="flex flex-wrap gap-1">
                                {edges.filter(e => e.from === selectedCourseCode).map((e, idx) => (
                                    <Badge key={idx} variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/30">
                                        {e.toName} ({e.to})
                                    </Badge>
                                ))}
                                {edges.filter(e => e.from === selectedCourseCode).length === 0 && (
                                    <span className="text-muted-foreground italic">Không có môn học mở khóa trực tiếp.</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
