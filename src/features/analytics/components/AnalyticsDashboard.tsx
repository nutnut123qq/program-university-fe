"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Award, BookOpen, GraduationCap, Building2, TrendingUp, CheckCircle2, ShieldCheck, Sparkles, Download, FileSpreadsheet, FileJson } from "lucide-react"
import { exportAnalyticsDatasetToCsv, exportAnalyticsDatasetToJson } from "@/lib/exportUtils"

const UNI_STATS = [
    { code: "NEU", name: "ĐH Kinh tế Quốc dân", count: 86, score: 8.77, status: "Xuất sắc", color: "bg-emerald-500 text-white" },
    { code: "VNU", name: "ĐHQG Hà Nội", count: 137, score: 8.63, status: "Tốt", color: "bg-emerald-500 text-white" },
    { code: "HCMUT", name: "ĐH Bách khoa ĐHQG-HCM", count: 373, score: 8.55, status: "Tốt", color: "bg-emerald-500 text-white" },
    { code: "FTU", name: "ĐH Ngoại thương", count: 33, score: 8.45, status: "Tốt", color: "bg-emerald-500 text-white" },
    { code: "UIT", name: "ĐH CNTT ĐHQG-HCM", count: 20, score: 8.26, status: "Tốt", color: "bg-emerald-500 text-white" },
    { code: "HUST", name: "ĐH Bách khoa Hà Nội", count: 64, score: 8.09, status: "Tốt", color: "bg-emerald-500 text-white" },
    { code: "UEH", name: "ĐH Kinh tế TP.HCM", count: 81, score: 7.88, status: "Tốt", color: "bg-emerald-500 text-white" },
    { code: "TDTU", name: "ĐH Tôn Đức Thắng", count: 120, score: 7.25, status: "Đạt", color: "bg-blue-500 text-white" },
    { code: "DTU", name: "ĐH Duy Tân", count: 82, score: 6.83, status: "Đạt", color: "bg-blue-500 text-white" },
    { code: "UET", name: "ĐH Công nghệ ĐHQGHN", count: 20, score: 6.78, status: "Đạt", color: "bg-blue-500 text-white" },
    { code: "HCMUS", name: "ĐH KHTN ĐHQG-HCM", count: 38, score: 6.74, status: "Đạt", color: "bg-blue-500 text-white" },
    { code: "FPT", name: "ĐH FPT", count: 39, score: 5.95, status: "Cần cải thiện", color: "bg-amber-500 text-white" },
]

const DISTRIBUTIONS = [
    { label: "9.0 - 10.0 (Xuất sắc AUN-QA Gold)", count: 359, pct: "32.8%", color: "text-emerald-500 border-emerald-500/20 bg-emerald-500/10" },
    { label: "7.5 - 8.9 (Tốt / Standard)", count: 359, pct: "32.8%", color: "text-blue-500 border-blue-500/20 bg-blue-500/10" },
    { label: "6.0 - 7.4 (Đạt yêu cầu)", count: 293, pct: "26.8%", color: "text-indigo-500 border-indigo-500/20 bg-indigo-500/10" },
    { label: "4.0 - 5.9 (Cần cải thiện)", count: 82, pct: "7.5%", color: "text-amber-500 border-amber-500/20 bg-amber-500/10" },
    { label: "1.0 - 3.9 (Phạt gắt thiếu PLO)", count: 0, pct: "0.0%", color: "text-emerald-500 border-emerald-500/20 bg-emerald-500/10" },
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
                            <span>100% Data Perfection Master Verified</span>
                        </Badge>
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>8.03/10.0 Mean Quality Score</span>
                        </Badge>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Dashboard Phân tích & So sánh 12 Trường Đại học</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Hệ thống thống kê toàn diện chất lượng 1.093 chương trình đào tạo & 57.935 môn học trên Thang điểm 10.0 SLM Strict Rubric.
                    </p>
                </div>

                {/* Export Action Buttons */}
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => exportAnalyticsDatasetToCsv(UNI_STATS, DISTRIBUTIONS)}
                        className="gap-1.5 text-xs"
                    >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                        <span>Tải Dataset (CSV)</span>
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => exportAnalyticsDatasetToJson(UNI_STATS, DISTRIBUTIONS)}
                        className="gap-1.5 text-xs"
                    >
                        <FileJson className="w-4 h-4 text-blue-500" />
                        <span>Tải Dataset (JSON)</span>
                    </Button>
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
                        <p className="text-[11px] text-emerald-500 font-medium mt-1">100% (1,093/1,093) ngành có danh mục môn</p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-blue-500/20 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Tổng Môn học Bóc tách</CardTitle>
                        <BookOpen className="w-4 h-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-500">57,935</div>
                        <p className="text-[11px] text-muted-foreground mt-1">100% môn học có đầy đủ tín chỉ & học kỳ</p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-indigo-500/20 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Điểm TB Toàn Hệ thống</CardTitle>
                        <TrendingUp className="w-4 h-4 text-indigo-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-indigo-500">8.03 / 10.0</div>
                        <p className="text-[11px] text-muted-foreground mt-1">Vươn lên mốc 8.03 điểm (Xếp loại Tốt)</p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-emerald-500/20 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Tỷ lệ Đạt & Xuất sắc (≥6.0)</CardTitle>
                        <Award className="w-4 h-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-500">92.5% (1,011 Ngành)</div>
                        <p className="text-[11px] text-emerald-500 font-medium mt-1">359 Ngành (32.8%) đạt AUN-QA Gold (9.0-10.0)</p>
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
                                <CardTitle className="text-lg">Xếp hạng Điểm SLM Trung bình theo Trường (Hoàn thiện Master)</CardTitle>
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
                                        <Badge className={`text-[10px] ${u.color}`}>{u.status}</Badge>
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
                            <CardTitle className="text-lg">Phân bố Điểm số SLM Strict (10.0 Scale)</CardTitle>
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
                                <span>Hoàn thiện Triệt để 4 Tiêu chí Dữ liệu</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs space-y-2 text-muted-foreground leading-relaxed">
                            <p>
                                🟢 **100% Phân bổ Học kỳ & Tín chỉ**: Xóa bỏ hoàn toàn tình trạng thiếu học kỳ hay tín chỉ môn học trên toàn bộ 57.935 môn.
                            </p>
                            <p>
                                🟢 **Chuẩn hóa Phân tầng Khối kiến thức**: Phân loại tự động 100% môn học theo đúng 4 nhóm: Đại cương, Cơ sở ngành, Chuyên ngành và Tốt nghiệp.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
