"use client"

import React, { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Curriculum } from "../types"
import { useTranslations } from "next-intl"
import { Calculator } from "lucide-react"

interface GpaPlannerProps {
    courses: Curriculum[]
}

const GRADE_SCALE: { key: string; score: number }[] = [
    { key: "gpaGradeA", score: 4.0 },
    { key: "gpaGradeBPlus", score: 3.5 },
    { key: "gpaGradeB", score: 3.0 },
    { key: "gpaGradeCPlus", score: 2.5 },
    { key: "gpaGradeC", score: 2.0 },
    { key: "gpaGradeD", score: 1.0 },
]

export const GpaPlanner: React.FC<GpaPlannerProps> = ({ courses }) => {
    const t = useTranslations("programs")
    const [courseGrades, setCourseGrades] = useState<Record<string, number>>({})

    // Every course of the program gets a grade row, grouped by semester
    // (ascending, courses without one last); one unlabelled group when the
    // program has no semester data at all.
    const groups = useMemo(() => {
        const bySemester = new Map<number | null, Curriculum[]>()
        for (const c of courses) {
            const list = bySemester.get(c.semester)
            if (list) list.push(c)
            else bySemester.set(c.semester, [c])
        }
        return [...bySemester.entries()].sort(([a], [b]) => (a == null ? 1 : b == null ? -1 : a - b))
    }, [courses])
    const hasSemesters = groups.some(([semester]) => semester != null)

    if (courses.length === 0) {
        return <p className="text-sm text-muted-foreground py-4">{t("noCurriculum")}</p>
    }

    // Calculate GPA
    const totalSelectedCredits = Object.keys(courseGrades).reduce((sum, courseId) => {
        const course = courses.find((c) => String(c.id) === String(courseId))
        return sum + (course?.credits ?? 0)
    }, 0)

    const totalGradePoints = Object.entries(courseGrades).reduce((sum, [courseId, gradePoint]) => {
        const course = courses.find((c) => String(c.id) === String(courseId))
        return sum + gradePoint * (course?.credits ?? 0)
    }, 0)

    const calculatedGpa = totalSelectedCredits > 0 ? (totalGradePoints / totalSelectedCredits).toFixed(2) : "0.00"

    const getDegreeClassification = (gpa: number) => {
        if (gpa >= 3.6) return { text: t("gpaClassExcellent"), color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" }
        if (gpa >= 3.2) return { text: t("gpaClassVeryGood"), color: "text-blue-500 bg-blue-500/10 border-blue-500/20" }
        if (gpa >= 2.5) return { text: t("gpaClassGood"), color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20" }
        return { text: t("gpaClassAverage"), color: "text-amber-500 bg-amber-500/10 border-amber-500/20" }
    }

    const classification = getDegreeClassification(parseFloat(calculatedGpa))

    return (
        <Card className="border-border/60">
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-indigo-500" />
                        <div>
                            <CardTitle className="text-base font-bold">{t("gpaTitle")}</CardTitle>
                            <CardDescription className="text-xs">{t("gpaDesc")}</CardDescription>
                        </div>
                    </div>

                    {/* Calculated GPA Display */}
                    <div className="flex items-center gap-3 bg-muted/40 p-3 rounded-xl border">
                        <div>
                            <span className="text-[10px] text-muted-foreground uppercase block font-semibold">{t("gpaExpected")}</span>
                            <span className="text-2xl font-black text-primary">{calculatedGpa} / 4.0</span>
                        </div>
                        <Badge className={`text-xs ${classification.color}`}>{classification.text}</Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{t("gpaSelectHint")}</p>
                <div className="max-h-80 overflow-y-auto rounded-xl border divide-y">
                    {groups.map(([semester, items]) => (
                        <div key={semester ?? "none"} data-testid="gpa-group" data-semester={semester ?? "none"} className="divide-y">
                            {hasSemesters && (
                                <h4 className="sticky top-0 z-10 px-3 py-1.5 text-[11px] font-bold text-muted-foreground bg-muted">
                                    {semester == null ? t("gpaSemesterUnknown") : t("semesterN", { n: semester })}
                                </h4>
                            )}
                            {items.map((c) => (
                                <div key={c.id} className="p-3 flex items-center justify-between gap-4 bg-background hover:bg-muted/20">
                                    <div>
                                        <p className="font-medium text-xs">{c.courseName}</p>
                                        <span className="text-[10px] text-muted-foreground font-mono">
                                            {t("gpaCourseMeta", { code: c.courseCode || "N/A", credits: c.credits != null ? t("credits", { count: c.credits }) : "N/A" })}
                                        </span>
                                    </div>
                                    <select
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value)
                                            setCourseGrades((prev) => ({ ...prev, [c.id]: val }))
                                        }}
                                        className="text-xs font-medium border rounded-lg px-2 py-1 bg-background focus:ring-1 focus:ring-primary"
                                    >
                                        <option value="0">{t("gpaNotGraded")}</option>
                                        {GRADE_SCALE.map((g) => (
                                            <option key={g.key} value={g.score}>
                                                {t(g.key)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
