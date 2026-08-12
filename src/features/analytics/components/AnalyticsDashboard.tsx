"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Award, BookOpen, GraduationCap, Building2, TrendingUp, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react"

const UNI_STATS = [
    { code: "NEU", name: "ĐH Kinh tế Quốc dân", count: 86, score: 8.74, status: "Tốt", color: "bg-emerald-500" },
    { code: "VNU", name: "ĐHQG Hà Nội", count: 137, score: 8.15, status: "Tốt", color: "bg-emerald-500" },
    { code: "FTU", name: "ĐH Ngoại thương", count: 33, score: 7.71, status: "Tốt", color: "bg-emerald-500" },
    { code: "UIT", name: "ĐH CNTT ĐHQG-HCM", count: 20, score: 7.69, status: "Tốt", color: "bg-emerald-500" },
    { code: "HUST", name: "ĐH Bách khoa Hà Nội", count: 64, score: 7.62, status: "Tốt", color: "bg-emerald-500" },
    { code: "UEH", name: "ĐH Kinh tế TP.HCM", count: 81, score: 7.31, status: "Đạt", color: "bg-blue-500" },
    { code: "HCMUT", name: "ĐH Bách khoa ĐHQG-HCM", count: 373, score: 6.79, status: "Đạt", color: "bg-blue-500" },
    { code: "DTU", name: "ĐH Duy Tân", count: 82, score: 6.44, status: "Đạt", color: "bg-blue-500" },
    { code: "TDTU", name: "ĐH Tôn Đức Thắng", count: 120, score: 5.61, status: "Cần cải thiện", color: "bg-amber-500" },
    { code: "FPT", name: "ĐH FPT", count: 39, score: 4.88, status: "Cần cải thiện", color: "bg-amber-500" },
    { code: "UET", name: "ĐH Công nghệ ĐHQGHN", count: 20, score: 4.88, status: "Cần cải thiện", color: "bg-amber-500" },
    { code: "HCMUS", name: "ĐH KHTN ĐHQG-HCM", count: 38, score: 3.97, status: "Thiếu dữ liệu", color: "bg-rose-500" },
]

const DISTRIBUTIONS = [
    { label: "9.0 - 10.0 (Xuất sắc AUN-QA)", count: 80, pct: "7.3%", color: "text-emerald-500 border-emerald-500/20 bg-emerald-500/10" },
    { label: "7.5 - 8.9 (Tốt / Standard)", count: 415, pct: "38.0%", color: "text-blue-500 border-blue-500/20 bg-blue-500/10" },
    { label: "6.0 - 7.4 (Đạt yêu cầu)", count: 389, pct: "35.6%", color: "text-indigo-500 border-indigo-500/20 bg-indigo-500/10" },
    { label: "4.0 - 5.9 (Cần cải thiện)", count: 139, pct: "12.7%", color: "text-amber-500 border-amber-500/20 bg-amber-500/10" },
    { label: "1.0 - 3.9 (Bị trừ gắt dữ liệu thô)", count: 70, pct: "6.4%", color: "text-rose-500 border-rose-500/20 bg-rose-500/10" },
]

export const AnalyticsDashboard = () => {
    return (
        <div className="container mx-auto py-8 px-4 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            <span>SLM Benchmark Analytics 10.0 (Backfilled)</span>
                        </Badge>
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>1,023/1,093 Ngành Hoàn Chỉnh Môn</span>
                        </Badge>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Dashboard Phân tích & So sánh 12 Trường Đại học</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Hệ thống thống kê toàn diện chất lượng 1.093 chương trình đào tạo & 57.165 môn học trên Thang điểm 10.0 SLM Strict Rubric.
                    </p>
                </div>
            </div>

            {/* Key Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-card/50 backdrop-blur border-primary/20 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Tổng Ngành học</CardTitle>
                        <GraduationCap className="w-4 h-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">1,093</div>
                        <p className="text-[11px] text-muted-foreground mt-1">1,023 ngành đã bóc tách đầy đủ khung môn</p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-blue-500/20 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Tổng Môn học Bóc tách</CardTitle>
                        <BookOpen className="w-4 h-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-500">57,165</div>
                        <p className="text-[11px] text-muted-foreground mt-1">Tăng +2.812 môn học sau bóc tách bổ sung</p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-indigo-500/20 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Điểm TB Toàn Hệ thống</CardTitle>
                        <TrendingUp className="w-4 h-4 text-indigo-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-indigo-500">6.89 / 10.0</div>
                        <p className="text-[11px] text-muted-foreground mt-1">Tăng từ 6.23 lên 6.89 điểm sau hoàn thiện data</p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-emerald-500/20 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Tỷ lệ Đạt & Tốt (≥6.0)</CardTitle>
                        <Award className="w-4 h-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-500">80.9% (884 Ngành)</div>
                        <p className="text-[11px] text-muted-foreground mt-1">Tỷ lệ ngành zero-course giảm xuống còn 6.4%</p>
                    </CardContent>
                </Card>
            </div>

            {/* University Quality Rankings */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 border-border/60">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-primary" />
                            <div>
                                <CardTitle className="text-lg">Xếp hạng Điểm SLM Trung bình theo Trường (Cập nhật)</CardTitle>
                                <CardDescription className="text-xs">So sánh chất lượng công bố CTĐT trên Thang điểm 10.0 giữa 12 trường đại học</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {UNI_STATS.map((u, i) => (
                            <div key={u.code} className="p-3 rounded-xl border bg-muted/20 space-y-2 hover:bg-muted/40 transition-colors">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-xs w-6 text-muted-foreground">#{i + 1}</span>
                                        <Badge variant="outline" className="font-mono text-xs font-semibold">{u.code}</Badge>
                                        <span className="font-medium text-xs hidden sm:inline">{u.name}</span>
                                        <span className="text-[11px] text-muted-foreground">({u.count} ngành)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-extrabold text-sm">{u.score.toFixed(2)} / 10.0</span>
                                        <Badge className={`text-[10px] ${u.color} text-white`}>{u.status}</Badge>
                                    </div>
                                </div>
                                <Progress value={(u.score / 10) * 100} className="h-2" />
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Score Distribution Breakdown */}
                <div className="space-y-6">
                    <Card className="border-border/60">
                        <CardHeader>
                            <CardTitle className="text-lg">Phân bố Điểm số SLM Strict</CardTitle>
                            <CardDescription className="text-xs">Tỷ lệ các phân vùng chất lượng 1.0 - 10.0</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {DISTRIBUTIONS.map((d, i) => (
                                <div key={i} className={`p-3 rounded-xl border ${d.color} flex items-center justify-between`}>
                                    <div>
                                        <p className="font-semibold text-xs">{d.label}</p>
                                        <p className="text-[11px] opacity-80">{d.count} chương trình đào tạo</p>
                                    </div>
                                    <span className="font-extrabold text-base">{d.pct}</span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Highlights */}
                    <Card className="border-border/60 bg-gradient-to-br from-card via-card to-primary/5">
                        <CardHeader>
                            <CardTitle className="text-sm flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                <span>Nhận xét Bóc tách Dữ liệu Bổ sung</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs space-y-2 text-muted-foreground leading-relaxed">
                            <p>
                                🟢 **HUST tăng vọt**: **HUST (7.62/10)** vươn lên nhóm Tốt nhờ bổ sung 1.048 môn học và 100% văn bản PLO.
                            </p>
                            <p>
                                🟢 **DTU được lấp đầy môn**: **DTU (6.44/10)** hoàn thành 100% khung môn học (1.764 môn) giúp tỷ lệ zero-course toàn hệ thống giảm xuống chỉ còn 6.4%.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
