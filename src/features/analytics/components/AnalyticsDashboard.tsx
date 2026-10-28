"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Award, BookOpen, GraduationCap, Building2, TrendingUp, CheckCircle2, ShieldCheck, Sparkles, FileSpreadsheet, FileJson } from "lucide-react"
import { useTranslations } from "next-intl"
import { exportAnalyticsDatasetToCsv, exportAnalyticsDatasetToJson, sharePct, type AnalyticsSnapshot } from "@/lib/exportUtils"
import snapshot from "@/lib/analytics-snapshot.json"

// Every number on this page comes from src/lib/analytics-snapshot.json, built
// by scripts/build-analytics.mjs from public/mock (no fetch of the 98 program
// chunks). Averages, shares and bands count only programs with enough data
// (SLM score + course list + not "insufficient"); e2e/v247 recomputes it and
// fails when the file is stale.
const S: AnalyticsSnapshot = snapshot
const avg = S.basis.mean.toFixed(2)
const topBand = S.bands[0] // bands run high → low
const pct = (k: number) => sharePct(k, S.basis.programs)

export const AnalyticsDashboard = () => {
    const t = useTranslations("programs")
    const ta = useTranslations("analytics")

    return (
        <div className="container mx-auto py-8 px-4 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            <span>{ta("officialDataBadge")}</span>
                        </Badge>
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>{avg}/10.0 {t("slmRefScore")}</span>
                        </Badge>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight">{ta("title", { universities: S.catalog.universities })}</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        {ta("subtitle", {
                            programs: S.catalog.programs,
                            courses: S.catalog.courses,
                            universities: S.catalog.universities,
                            basis: S.basis.programs,
                            note: t("slmRefScoreNote"),
                        })}
                    </p>
                </div>

                {/* Export Action Buttons */}
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => exportAnalyticsDatasetToCsv(S)}
                        className="gap-1.5 text-xs"
                    >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                        <span>{ta("exportCsv")}</span>
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => exportAnalyticsDatasetToJson(S)}
                        className="gap-1.5 text-xs"
                    >
                        <FileJson className="w-4 h-4 text-blue-500" />
                        <span>{ta("exportJson")}</span>
                    </Button>
                </div>
            </div>

            {/* Key Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-card/50 backdrop-blur border-primary/20 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">{ta("totalPrograms")}</CardTitle>
                        <GraduationCap className="w-4 h-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{S.catalog.programs.toLocaleString("en-US")}</div>
                        <p className="text-[11px] text-emerald-500 font-medium mt-1">{ta("totalProgramsNote", { noCourses: S.catalog.programsWithoutCourses, programs: S.catalog.programs })}</p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-blue-500/20 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">{ta("totalCourses")}</CardTitle>
                        <BookOpen className="w-4 h-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-500">{S.catalog.courses.toLocaleString("en-US")}</div>
                        <p className="text-[11px] text-muted-foreground mt-1">{ta("totalCoursesNote")}</p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-indigo-500/20 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">{ta("avgLabel", { name: t("slmRefScore"), basis: S.basis.programs })}</CardTitle>
                        <TrendingUp className="w-4 h-4 text-indigo-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-indigo-500">{avg} / 10.0</div>
                        <p className="text-[11px] text-muted-foreground mt-1">{avg}/10.0 — {t("slmRefScoreNote")}</p>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur border-emerald-500/20 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">{ta("passRate")}</CardTitle>
                        <Award className="w-4 h-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-500">{ta("passRateValue", { pct: pct(S.basis.atLeast6), count: S.basis.atLeast6 })}</div>
                        <p className="text-[11px] text-emerald-500 font-medium mt-1">{ta("passRateNote", { count: topBand.count, pct: pct(topBand.count), basis: S.basis.programs })}</p>
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
                                <CardTitle className="text-lg">{ta("rankingTitle", { name: t("slmRefScore") })}</CardTitle>
                                <CardDescription className="text-xs">{ta("rankingDesc", { basis: S.basis.programs })}</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Ranked rows first, then the n = 0 rows (unranked) — the snapshot's order. */}
                        {S.universities.map((u, i) => (
                            <div key={u.code} data-testid="uni-row" data-code={u.code} className="p-3 rounded-xl border bg-muted/20 space-y-2 hover:bg-muted/40 transition-colors">
                                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-bold text-xs w-6 text-muted-foreground">{u.mean === null ? "" : `#${i + 1}`}</span>
                                        <Badge variant="outline" className="font-mono text-xs font-semibold">{u.code}</Badge>
                                        <span className="font-medium text-xs hidden sm:inline">{u.name}</span>
                                        <span className="text-[11px] text-muted-foreground">({ta("uniBasis", { n: u.n, count: u.programs })})</span>
                                    </div>
                                    {u.mean === null ? (
                                        <span className="text-xs font-semibold text-muted-foreground">{ta("statusNoData")}</span>
                                    ) : (
                                        <span className="font-extrabold text-sm">{u.mean.toFixed(2)} / 10.0</span>
                                    )}
                                </div>
                                {u.mean !== null && <Progress value={u.mean * 10} className="h-2" />}
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Score Distribution Breakdown */}
                <div className="space-y-6">
                    <Card className="border-border/60">
                        <CardHeader>
                            <CardTitle className="text-lg">{ta("distTitle", { name: t("slmRefScore") })}</CardTitle>
                            <CardDescription className="text-xs">{ta("distDesc", { basis: S.basis.programs })}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {S.bands.map((b) => (
                                <div key={b.range} data-testid="score-band" data-range={b.range} className="p-3 rounded-xl border bg-muted/20 flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold text-xs">{b.range}</p>
                                        <p className="text-[11px] opacity-80">{ta("distProgramCount", { count: b.count })}</p>
                                    </div>
                                    <span className="font-extrabold text-base">{pct(b.count)}</span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Highlights */}
                    <Card className="border-border/60 bg-gradient-to-br from-card via-card to-primary/5">
                        <CardHeader>
                            <CardTitle className="text-sm flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                <span>{ta("qualityTitle")}</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs space-y-2 text-muted-foreground leading-relaxed">
                            <p>
                                {ta("qualityNote1")}
                            </p>
                            <p>
                                {ta("qualityNote2")}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
