"use client"

import React, { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Curriculum } from "../types"
import { Calculator, Compass, Sparkles, Award, CheckCircle2, TrendingUp } from "lucide-react"

interface GpaPlannerProps {
    courses: Curriculum[]
}

const CAREER_TRACKS = [
    {
        id: "ai",
        title: "Kỹ sư Trí tuệ Nhân tạo (AI / Machine Learning Engineer)",
        description: "Tập trung vào Toán giải tích, Xác suất thống kê, Đại số tuyến tính, Học máy, Học sâu và Thị giác máy tính.",
        keywords: ["toán", "xác suất", "thống kê", "đại số", "máy", "học", "trí tuệ", "dữ liệu", "tín hiệu", "ai"],
    },
    {
        id: "web",
        title: "Lập trình viên Fullstack (Fullstack Software Developer)",
        description: "Tập trung vào Cấu trúc dữ liệu, Cơ sở dữ liệu, Mạng máy tính, Lập trình hướng đối tượng, Công nghệ Web và Kiến trúc Phần mềm.",
        keywords: ["lập trình", "cơ sở dữ liệu", "mạng", "phần mềm", "web", "đối tượng", "cấu trúc", "hệ điều hành"],
    },
    {
        id: "cyber",
        title: "Chuyên gia An toàn Thông tin (Cybersecurity Specialist)",
        description: "Tập trung vào Mạng máy tính, Mật mã học, An toàn hệ điều hành, An ninh mạng và Kiến trúc máy tính.",
        keywords: ["an toàn", "mạng", "mật mã", "bảo mật", "hệ thống", "máy tính", "vi xử lý"],
    },
]

const GRADE_SCALE: Record<string, number> = {
    "A (4.0 - Xuất sắc)": 4.0,
    "B+ (3.5 - Giỏi)": 3.5,
    "B (3.0 - Khá)": 3.0,
    "C+ (2.5 - TB Khá)": 2.5,
    "C (2.0 - Trung bình)": 2.0,
    "D (1.0 - Yếu)": 1.0,
}

export const GpaPlanner: React.FC<GpaPlannerProps> = ({ courses }) => {
    const [selectedTrack, setSelectedTrack] = useState<string>("ai")
    const [courseGrades, setCourseGrades] = useState<Record<string, number>>({})

    const currentTrack = CAREER_TRACKS.find((t) => t.id === selectedTrack) || CAREER_TRACKS[0]

    // Filter recommended courses for target track
    const recommendedCourses = courses.filter((c) => {
        const name = (c.courseName || "").toLowerCase()
        return currentTrack.keywords.some((kw) => name.includes(kw))
    })

    // Calculate GPA
    const totalSelectedCredits = Object.keys(courseGrades).reduce((sum, courseId) => {
        const course = courses.find((c) => String(c.id) === String(courseId))
        return sum + (course?.credits || 3)
    }, 0)

    const totalGradePoints = Object.entries(courseGrades).reduce((sum, [courseId, gradePoint]) => {
        const course = courses.find((c) => String(c.id) === String(courseId))
        return sum + gradePoint * (course?.credits || 3)
    }, 0)

    const calculatedGpa = totalSelectedCredits > 0 ? (totalGradePoints / totalSelectedCredits).toFixed(2) : "0.00"

    const getDegreeClassification = (gpa: number) => {
        if (gpa >= 3.6) return { text: "Xuất sắc (Excellent)", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" }
        if (gpa >= 3.2) return { text: "Giỏi (Very Good)", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" }
        if (gpa >= 2.5) return { text: "Khá (Good)", color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20" }
        return { text: "Trung bình (Average)", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" }
    }

    const classification = getDegreeClassification(parseFloat(calculatedGpa))

    return (
        <div className="space-y-6">
            {/* Career Track Recommender Header */}
            <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-background to-indigo-500/10">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Compass className="w-5 h-5 text-primary" />
                        <div>
                            <CardTitle className="text-base font-bold">Gợi ý Lộ trình Học tập theo Mục tiêu Nghề nghiệp</CardTitle>
                            <CardDescription className="text-xs">Hệ thống AI phân tích và lọc ra các môn học nòng cốt nhất trong CTĐT tương ứng với định hướng công việc</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Track Buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {CAREER_TRACKS.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setSelectedTrack(t.id)}
                                className={`p-3 rounded-xl border text-left transition-all ${
                                    selectedTrack === t.id
                                        ? "border-primary bg-primary/10 ring-1 ring-primary font-bold shadow-sm"
                                        : "bg-muted/20 border-border/60 hover:bg-muted/40"
                                }`}
                            >
                                <p className="text-xs font-bold leading-snug">{t.title}</p>
                            </button>
                        ))}
                    </div>

                    <p className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg border">{currentTrack.description}</p>

                    {/* Recommended Courses Grid */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            <span>{recommendedCourses.length} Môn học Khuyên học cho Định hướng này:</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {recommendedCourses.map((c) => (
                                <div key={c.id} className="p-2.5 rounded-lg border bg-background flex items-center justify-between text-xs">
                                    <span className="font-medium truncate">{c.courseName}</span>
                                    <Badge variant="outline" className="font-mono text-[10px] ml-2 shrink-0 bg-primary/10 text-primary border-primary/20">
                                        {c.credits || 3} TC
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* GPA Calculator Section */}
            <Card className="border-border/60">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <Calculator className="w-5 h-5 text-indigo-500" />
                            <div>
                                <CardTitle className="text-base font-bold">Mô phỏng & Tính điểm GPA Tích lũy (GPA Planner)</CardTitle>
                                <CardDescription className="text-xs">Thử nghiệm dự đoán điểm số thang 4.0 và xếp loại tốt nghiệp tương lai</CardDescription>
                            </div>
                        </div>

                        {/* Calculated GPA Display */}
                        <div className="flex items-center gap-3 bg-muted/40 p-3 rounded-xl border">
                            <div>
                                <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Dự kiến GPA (Thang 4)</span>
                                <span className="text-2xl font-black text-primary">{calculatedGpa} / 4.0</span>
                            </div>
                            <Badge className={`text-xs ${classification.color}`}>{classification.text}</Badge>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">Chọn điểm số dự kiến cho các môn học bên dưới để tính GPA:</p>
                    <div className="max-h-80 overflow-y-auto rounded-xl border divide-y">
                        {courses.slice(0, 15).map((c) => (
                            <div key={c.id} className="p-3 flex items-center justify-between gap-4 bg-background hover:bg-muted/20">
                                <div>
                                    <p className="font-medium text-xs">{c.courseName}</p>
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                        Mã: {c.courseCode || "N/A"} • {c.credits || 3} Tín chỉ
                                    </span>
                                </div>
                                <select
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value)
                                        setCourseGrades((prev) => ({ ...prev, [c.id]: val }))
                                    }}
                                    className="text-xs font-medium border rounded-lg px-2 py-1 bg-background focus:ring-1 focus:ring-primary"
                                >
                                    <option value="0">Chưa tính điểm</option>
                                    {Object.entries(GRADE_SCALE).map(([label, score]) => (
                                        <option key={label} value={score}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
