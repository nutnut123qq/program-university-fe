"use client"

import React, { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Curriculum } from "../types"
import { PieChart, CheckCircle2, AlertTriangle } from "lucide-react"

interface KnowledgeBlockBreakdownProps {
    courses: Curriculum[]
    totalCredits?: number
}

const MOET_GUIDELINES = [
    { block: "Đại cương", minPct: 20, maxPct: 35, color: "bg-blue-500", border: "border-blue-500/30", text: "text-blue-500" },
    { block: "Cơ sở ngành", minPct: 25, maxPct: 40, color: "bg-indigo-500", border: "border-indigo-500/30", text: "text-indigo-500" },
    { block: "Chuyên ngành", minPct: 30, maxPct: 45, color: "bg-purple-500", border: "border-purple-500/30", text: "text-purple-500" },
    { block: "Tốt nghiệp", minPct: 5, maxPct: 15, color: "bg-emerald-500", border: "border-emerald-500/30", text: "text-emerald-500" },
]

export const KnowledgeBlockBreakdown: React.FC<KnowledgeBlockBreakdownProps> = ({ courses, totalCredits }) => {
    const stats = useMemo(() => {
        const counts: Record<string, { courses: number; credits: number }> = {
            "Đại cương": { courses: 0, credits: 0 },
            "Cơ sở ngành": { courses: 0, credits: 0 },
            "Chuyên ngành": { courses: 0, credits: 0 },
            "Tốt nghiệp": { courses: 0, credits: 0 },
        }

        let calculatedSumCredits = 0

        courses.forEach((c) => {
            const kb = (c.knowledgeBlock || "").toLowerCase()
            const cr = c.credits || 3
            calculatedSumCredits += cr

            if (kb.includes("đại cương")) {
                counts["Đại cương"].courses += 1
                counts["Đại cương"].credits += cr
            } else if (kb.includes("cơ sở")) {
                counts["Cơ sở ngành"].courses += 1
                counts["Cơ sở ngành"].credits += cr
            } else if (kb.includes("tốt nghiệp") || kb.includes("thực tập") || kb.includes("đồ án")) {
                counts["Tốt nghiệp"].courses += 1
                counts["Tốt nghiệp"].credits += cr
            } else {
                counts["Chuyên ngành"].courses += 1
                counts["Chuyên ngành"].credits += cr
            }
        })

        const totalSum = totalCredits || calculatedSumCredits || 1

        return MOET_GUIDELINES.map((g) => {
            const data = counts[g.block] || { courses: 0, credits: 0 }
            const pct = Math.round((data.credits / totalSum) * 100)
            const isBalanced = pct >= g.minPct && pct <= g.maxPct

            return {
                ...g,
                courseCount: data.courses,
                credits: data.credits,
                pct,
                isBalanced,
            }
        })
    }, [courses, totalCredits])

    return (
        <Card className="border-border/60 bg-muted/20">
            <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                    <div className="flex items-center gap-2">
                        <PieChart className="w-4 h-4 text-primary" />
                        <h4 className="font-bold text-xs uppercase tracking-wider">Phân tích Tỷ lệ Khối kiến thức (MOET Standard)</h4>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px] bg-primary/10 text-primary border-primary/20">
                        {courses.length} môn học
                    </Badge>
                </div>

                {/* Progress Bars Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {stats.map((s) => (
                        <div key={s.block} className={`p-3 rounded-xl border bg-background space-y-2 ${s.border}`}>
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs">{s.block}</span>
                                <span className={`font-extrabold text-sm ${s.text}`}>{s.pct}%</span>
                            </div>
                            <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                                <div className={`${s.color} h-full transition-all duration-500`} style={{ width: `${Math.min(s.pct, 100)}%` }} />
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>{s.credits} Tín chỉ ({s.courseCount} môn)</span>
                                {s.isBalanced ? (
                                    <span className="text-emerald-500 font-semibold flex items-center gap-0.5">
                                        <CheckCircle2 className="w-3 h-3" /> Cân đối
                                    </span>
                                ) : (
                                    <span className="text-amber-500 font-semibold flex items-center gap-0.5">
                                        <AlertTriangle className="w-3 h-3" /> Chuẩn {s.minPct}-{s.maxPct}%
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
