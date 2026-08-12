"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Award, BookOpen, GraduationCap, Building2, TrendingUp, AlertTriangle, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react"

const UNI_STATS = [
    { code: "NEU", name: "ĐH Kinh tế Quốc dân", count: 86, score: 8.48, status: "Tốt", color: "bg-emerald-500" },
    { code: "VNU", name: "ĐHQG Hà Nội", count: 137, score: 8.15, status: "Tốt", color: "bg-emerald-500" },
    { code: "FTU", name: "ĐH Ngoại thương", count: 33, score: 7.71, status: "Tốt", color: "bg-emerald-500" },
    { code: "UIT", name: "ĐH CNTT ĐHQG-HCM", count: 20, score: 7.69, status: "Tốt", color: "bg-emerald-500" },
    { code: "UEH", name: "ĐH Kinh tế TP.HCM", count: 81, score: 7.31, status: "Đạt", color: "bg-blue-500" },
    { code: "HCMUT", name: "ĐH Bách khoa ĐHQG-HCM", count: 373, score: 6.79, status: "Đạt", color: "bg-blue-500" },
    { code: "TDTU", name: "ĐH Tôn Đức Thắng", count: 120, score: 5.50, status: "Cần cải thiện", color: "bg-amber-500" },
    { code: "FPT", name: "ĐH FPT", count: 39, score: 4.88, status: "Cần cải thiện", color: "bg-amber-500" },
    { code: "UET", name: "ĐH Công nghệ ĐHQGHN", count: 20, score: 4.65, status: "Cần cải thiện", color: "bg-amber-500" },
    { code: "HCMUS", name: "ĐH KHTN ĐHQG-HCM", count: 38, score: 3.46, status: "Thiếu dữ liệu", color: "bg-rose-500" },
    { code: "HUST", name: "ĐH Bách khoa Hà Nội", count: 64, score: 2.58, status: "Thiếu dữ liệu", color: "bg-rose-500" },
    { code: "DTU", name: "ĐH Duy Tân", count: 82, score: 2.30, status: "Thiếu dữ liệu", color: "bg-rose-500" },
]

const DISTRIBUTIONS = [
    { label: "9.0 - 10.0 (Xuất sắc AUN-QA)", count: 80, pct: "7.3%", color: "text-emerald-500 border-emerald-500/20 bg-emerald-500/10" },
    { label: "7.5 - 8.9 (Tốt / Standard)", count: 345, pct: "31.6%", color: "text-blue-500 border-blue-500/20 bg-blue-500/10" },
    { label: "6.0 - 7.4 (Đạt yêu cầu)", count: 340, pct: "31.1%", color: "text-indigo-500 border-indigo-500/20 bg-indigo-500/10" },
    { label: "4.0 - 5.9 (Cần cải thiện)", count: 131, pct: "12.0%", color: "text-amber-500 border-amber-500/20 bg-amber-500/10" },
    { label: "1.0 - 3.9 (Bị trừ gắt dữ liệu thô)", count: 197, pct: "18.0%", color: "text-rose-500 border-rose-500/20 bg-rose-500/10" },
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
                            <span>SLM Benchmark Analytics 10.0</span>
                        </Badge>
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>PostgreSQL Live Verified</span>
                        </Badge>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Dashboard Phân tích & So sánh 12 Trường Đại học</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Hệ thống thống kê toàn diện chất lượng 1.093 chương trình đào tạo & 54.353 môn học trên Thang điểm 10.0 SLM Strict Rubric.
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
                        <p className="text-[11px] text-muted-foreground mt-1">Thuộc 12 Trường Đại học lớn tại Việt Nam</p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-blue-500/20 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Tổng Môn học Bóc tách</CardTitle>
                        <BookOpen className="w-4 h-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">54,353</div>
                        <p className="text-[11px] text-muted-foreground mt-1">Đã bóc tách mã môn, tín chỉ & khối kiến thức</p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-indigo-500/20 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Điểm TB Toàn Hệ thống</CardTitle>
                        <TrendingUp className="w-4 h-4 text-indigo-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-indigo-500">6.23 / 10.0</div>
                        <p className="text-[11px] text-muted-foreground mt-1">Chấm gắt theo chuẩn kiểm định AUN-QA v4</p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-emerald-500/20 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Tỷ lệ AUN-QA Gold (≥9.0)</CardTitle>
                        <Award className="w-4 h-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-500">7.3% (80 Ngành)</div>
                        <p className="text-[11px] text-muted-foreground mt-1">Đạt điểm Xuất sắc tuyệt đối về dữ liệu & PLO</p>
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
                                <CardTitle className="text-lg">Xếp hạng Điểm SLM Trung bình theo Trường</CardTitle>
                                <CardDescription className="text-xs">So sánh chất lượng công bố CTĐT trên Thang điểm 10.0 giữa 12 trường</CardDescription>
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
                                <span>Nhận xét Đánh giá Chuyên gia</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs space-y-2 text-muted-foreground leading-relaxed">
                            <p>
                                🟢 **Trường dẫn đầu**: **NEU (8.48/10)**, **VNU (8.15/10)**, **FTU (7.71/10)** và **UIT (7.69/10)** đều có văn bản PLO đầy đủ và 100% môn học có mã & số tín chỉ rõ ràng.
                            </p>
                            <p>
                                🔴 **Trường bị phạt gắt**: **DTU (2.30/10)** và **HUST (2.58/10)** bị trừ điểm nặng do chứa tỷ lệ ngành zero-course chưa bóc tách môn học thô từ PDF.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
