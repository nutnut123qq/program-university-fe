"use client"

import { BookOpen, Loader2, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useTranslations } from "next-intl"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

import { fetchCurricula } from "../api"
import { Program } from "../types"

interface ProgramDetailDialogProps {
    program: Program | null
    open: boolean
    onClose: () => void
}

export function ProgramDetailDialog({ program, open, onClose }: ProgramDetailDialogProps) {
    const t = useTranslations("programs")
    const { data: courses, error, isLoading } = useSWR(
        program ? ["curricula", program.id] : null,
        () => (program ? fetchCurricula(program.id) : [])
    )

    if (!program) return null

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                    >
                        <div className="w-full max-w-3xl max-h-[85vh] bg-card border rounded-2xl shadow-2xl pointer-events-auto flex flex-col">
                            <div className="flex items-start justify-between p-6 border-b">
                                <div className="space-y-1">
                                    <h2 className="text-2xl font-bold">{program.name}</h2>
                                    <p className="text-muted-foreground">{program.universityName}</p>
                                    <div className="flex flex-wrap gap-2 pt-2">
                                        {program.degreeType && (
                                            <Badge variant="secondary">{program.degreeType}</Badge>
                                        )}
                                        {program.credits && (
                                            <Badge variant="outline">
                                                {t("credits", { count: program.credits })}
                                            </Badge>
                                        )}
                                        {program.courseCount > 0 && (
                                            <Badge variant="outline">
                                                {t("courses", { count: program.courseCount })}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={onClose}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="flex-1 p-6 overflow-y-auto">
                                {program.description && (
                                    <p className="text-sm text-muted-foreground mb-6 whitespace-pre-line">
                                        {program.description}
                                    </p>
                                )}

                                <div className="space-y-3">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <BookOpen className="h-4 w-4" />
                                        {t("curriculumTitle")}
                                    </h3>

                                    {isLoading && (
                                        <div className="flex items-center justify-center py-12">
                                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                        </div>
                                    )}

                                    {error && (
                                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                                            {t("curriculumError")}
                                        </div>
                                    )}

                                    {!isLoading && !error && (!courses || courses.length === 0) && (
                                        <p className="text-sm text-muted-foreground py-4">
                                            {t("noCurriculum")}
                                        </p>
                                    )}

                                    {courses && courses.length > 0 && (
                                        <div className="rounded-lg border overflow-hidden">
                                            <table className="w-full text-sm">
                                                <thead className="bg-muted/50">
                                                    <tr>
                                                        <th className="text-left px-4 py-2 font-medium">{t("courseCode")}</th>
                                                        <th className="text-left px-4 py-2 font-medium">{t("courseName")}</th>
                                                        <th className="text-right px-4 py-2 font-medium">{t("courseCredits")}</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {courses.map((course) => (
                                                        <tr key={course.id} className="hover:bg-muted/30">
                                                            <td className="px-4 py-2 text-muted-foreground">
                                                                {course.courseCode || "—"}
                                                            </td>
                                                            <td className="px-4 py-2">{course.courseName}</td>
                                                            <td className="px-4 py-2 text-right">{course.credits ?? "—"}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-4 border-t flex justify-end">
                                <Button variant="outline" onClick={onClose}>
                                    {t("close")}
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
