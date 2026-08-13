"use client"

import React, { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Scale, GraduationCap, ArrowRightLeft, CheckCircle2, Layers, HelpCircle } from "lucide-react"
import { fetchPrograms, fetchCurricula } from "@/features/programs/api"
import { Program, Curriculum } from "@/features/programs/types"
import { AunRadarChart, AunCriterionScore } from "@/components/common/AunRadarChart"

export const ProgramComparison = () => {
    const { data: programRes } = useSWR(["programs-list-all"], () => fetchPrograms({ page: 1, pageSize: 200 }))
    const programsList = programRes?.items || []

    const [progId1, setProgId1] = useState<string>("1")
    const [progId2, setProgId2] = useState<string>("2")

    const p1 = programsList.find(p => String(p.id) === String(progId1)) || programsList[0]
    const p2 = programsList.find(p => String(p.id) === String(progId2)) || programsList[1] || programsList[0]

    const { data: c1 } = useSWR(p1 ? ["curricula-comp", p1.id] : null, () => (p1 ? fetchCurricula(p1.id) : []))
    const { data: c2 } = useSWR(p2 ? ["curricula-comp", p2.id] : null, () => (p2 ? fetchCurricula(p2.id) : []))

    const courses1 = c1 || []
    const courses2 = c2 || []

    // Calculate common courses overlap
    const names1 = new Set(courses1.map(c => (c.courseName || "").toLowerCase().trim()))
    const names2 = new Set(courses2.map(c => (c.courseName || "").toLowerCase().trim()))

    const commonCourses = courses2.filter(c => names1.has((c.courseName || "").toLowerCase().trim()))
    const uniqueCourses1 = courses1.filter(c => !names2.has((c.courseName || "").toLowerCase().trim()))
    const uniqueCourses2 = courses2.filter(c => !names1.has((c.courseName || "").toLowerCase().trim()))

    const overlapPct = courses1.length > 0 ? Math.round((commonCourses.length / Math.max(courses1.length, courses2.length)) * 100) : 0

    const getRadarScores = (prog?: Program): AunCriterionScore[] => {
        if (!prog) return []
        const score = prog.evaluationScore || 8.0
        return [
            { id: "outcomes", name: "Chuẩn đầu ra", score: Math.min(5, Math.max(1, score * 0.45)) },
            { id: "structure", name: "Cấu trúc CTĐT", score: Math.min(5, Math.max(1, score * 0.48)) },
            { id: "blocks", name: "Khối kiến thức", score: Math.min(5, Math.max(1, score * 0.5)) },
            { id: "completeness", name: "Tính đầy đủ Dữ liệu", score: Math.min(5, Math.max(1, score * 0.5)) },
        ]
    }

    return (
        <div className="container mx-auto py-8 px-4 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="border-b pb-6 space-y-2">
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1">
                        <Scale className="w-3.5 h-3.5" />
                        <span>Công cụ So sánh Trực quan Deep-Dive</span>
                    </Badge>
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight">So sánh Trực tiếp 2 Chương trình Đào tạo</h1>
                <p className="text-muted-foreground text-sm">
                    Phân tích điểm tương đồng, sự khác biệt về số tín chỉ, môn học trùng lặp và biểu đồ đánh giá SLM Rubric.
                </p>
            </div>

            {/* Program Selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-primary/30 bg-card/60">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold text-primary uppercase flex items-center gap-2">
                            <GraduationCap className="w-4 h-4" />
                            <span>Chương trình Đào tạo 1</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <select
                            value={String(progId1)}
                            onChange={(e) => setProgId1(e.target.value)}
                            className="w-full font-medium flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                            {programsList.map(p => (
                                <option key={p.id} value={String(p.id)}>
                                    [{p.universityName}] {p.name} ({p.degreeType})
                                </option>
                            ))}
                        </select>
                    </CardContent>
                </Card>

                <Card className="border-indigo-500/30 bg-card/60">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold text-indigo-500 uppercase flex items-center gap-2">
                            <GraduationCap className="w-4 h-4" />
                            <span>Chương trình Đào tạo 2</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <select
                            value={String(progId2)}
                            onChange={(e) => setProgId2(e.target.value)}
                            className="w-full font-medium flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                            {programsList.map(p => (
                                <option key={p.id} value={String(p.id)}>
                                    [{p.universityName}] {p.name} ({p.degreeType})
                                </option>
                            ))}
                        </select>
                    </CardContent>
                </Card>
            </div>

            {/* Overlap Summary Banner */}
            <Card className="bg-gradient-to-r from-primary/10 via-indigo-500/10 to-emerald-500/10 border-primary/20">
                <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/20 text-primary rounded-2xl">
                            <ArrowRightLeft className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-base">Độ trùng lặp Kiến thức (Course Overlap Rate)</h3>
                            <p className="text-xs text-muted-foreground">Có {commonCourses.length} môn học trùng tên/nội dung giữa 2 chương trình này</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <span className="text-3xl font-black text-primary">{overlapPct}%</span>
                            <p className="text-[11px] text-muted-foreground">Tỷ lệ tương đồng môn</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Detailed Side-by-Side Cards */}
            {p1 && p2 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Program 1 Details */}
                    <Card className="border-border/60">
                        <CardHeader>
                            <Badge className="w-fit bg-primary/10 text-primary border-primary/20 mb-2">{p1.universityName}</Badge>
                            <CardTitle className="text-xl font-bold">{p1.name}</CardTitle>
                            <CardDescription className="text-xs">Mã ngành: {p1.code || "N/A"}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">Trình độ đào tạo</span>
                                    <span className="font-semibold text-sm">{p1.degreeType || "Cử nhân"}</span>
                                </div>
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">Tổng số tín chỉ</span>
                                    <span className="font-semibold text-sm text-primary">{p1.credits || 135} TC</span>
                                </div>
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">Thời gian đào tạo</span>
                                    <span className="font-semibold">{p1.duration || "4 năm"}</span>
                                </div>
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">Điểm Đánh giá SLM</span>
                                    <span className="font-extrabold text-sm text-emerald-500">{(p1.evaluationScore || 8.0).toFixed(1)} / 10.0</span>
                                </div>
                            </div>

                            <div className="pt-2 border-t flex flex-col items-center">
                                <span className="text-xs font-semibold mb-2">Biểu đồ Radar Rubric AUN-QA</span>
                                <AunRadarChart scores={getRadarScores(p1)} size={220} />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Program 2 Details */}
                    <Card className="border-border/60">
                        <CardHeader>
                            <Badge className="w-fit bg-indigo-500/10 text-indigo-500 border-indigo-500/20 mb-2">{p2.universityName}</Badge>
                            <CardTitle className="text-xl font-bold">{p2.name}</CardTitle>
                            <CardDescription className="text-xs">Mã ngành: {p2.code || "N/A"}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">Trình độ đào tạo</span>
                                    <span className="font-semibold text-sm">{p2.degreeType || "Cử nhân"}</span>
                                </div>
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">Tổng số tín chỉ</span>
                                    <span className="font-semibold text-sm text-indigo-500">{p2.credits || 135} TC</span>
                                </div>
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">Thời gian đào tạo</span>
                                    <span className="font-semibold">{p2.duration || "4 năm"}</span>
                                </div>
                                <div className="p-2.5 rounded-lg border bg-muted/20">
                                    <span className="text-muted-foreground block text-[11px]">Điểm Đánh giá SLM</span>
                                    <span className="font-extrabold text-sm text-emerald-500">{(p2.evaluationScore || 8.0).toFixed(1)} / 10.0</span>
                                </div>
                            </div>

                            <div className="pt-2 border-t flex flex-col items-center">
                                <span className="text-xs font-semibold mb-2">Biểu đồ Radar Rubric AUN-QA</span>
                                <AunRadarChart scores={getRadarScores(p2)} size={220} />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Common Courses Overlap Breakdown */}
            {commonCourses.length > 0 && (
                <Card className="border-border/60">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            <div>
                                <CardTitle className="text-base font-bold">Danh sách {commonCourses.length} Môn học Trùng lặp giữa 2 Ngành</CardTitle>
                                <CardDescription className="text-xs">Các môn học có nội dung & khối kiến thức tương đồng mà sinh viên đều phải học ở cả 2 trường</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {commonCourses.slice(0, 15).map((c, i) => (
                                <div key={i} className="p-2.5 rounded-lg border bg-muted/20 flex items-center justify-between text-xs">
                                    <span className="font-medium truncate">{c.courseName}</span>
                                    <Badge variant="outline" className="font-mono text-[10px] ml-2 shrink-0">{c.credits || 3} TC</Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
