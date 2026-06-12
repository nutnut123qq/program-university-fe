"use client"

import { motion } from "framer-motion"
import { GraduationCap, Building2, BookOpen, ExternalLink, Clock, Award, Eye } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import { Program } from "../types"

interface ProgramCardProps {
    program: Program
    index: number
    onViewDetail?: (program: Program) => void
}

export function ProgramCard({ program, index, onViewDetail }: ProgramCardProps) {
    const t = useTranslations("programs")

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.05 }}
        >
            <Card className="group h-full overflow-hidden border bg-card hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                                {program.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                                <Building2 className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{program.universityName}</span>
                            </div>
                        </div>
                        {program.degreeType && (
                            <Badge variant="secondary" className="shrink-0">
                                {program.degreeType}
                            </Badge>
                        )}
                    </div>
                </CardHeader>

                <CardContent className="pt-0 space-y-4">
                    {program.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                            {program.description}
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {program.credits && (
                            <Badge variant="outline" className="flex items-center gap-1 font-normal">
                                <BookOpen className="h-3 w-3" />
                                {t("credits", { count: program.credits })}
                            </Badge>
                        )}
                        {program.duration && (
                            <Badge variant="outline" className="flex items-center gap-1 font-normal">
                                <Clock className="h-3 w-3" />
                                {program.duration}
                            </Badge>
                        )}
                        {program.language && (
                            <Badge variant="outline" className="flex items-center gap-1 font-normal">
                                <Award className="h-3 w-3" />
                                {program.language}
                            </Badge>
                        )}
                        {program.courseCount > 0 && (
                            <Badge variant="outline" className="flex items-center gap-1 font-normal">
                                <GraduationCap className="h-3 w-3" />
                                {t("courses", { count: program.courseCount })}
                            </Badge>
                        )}
                    </div>

                    <div className="flex gap-2">
                        {onViewDetail && (
                            <button
                                onClick={() => onViewDetail(program)}
                                className={cn(
                                    buttonVariants({ variant: "default", size: "sm" }),
                                    "flex-1 group/btn flex items-center justify-center gap-2"
                                )}
                            >
                                <Eye className="h-3.5 w-3.5" />
                                {t("viewCourses")}
                            </button>
                        )}
                        {program.sourceUrl && (
                            <a
                                href={program.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                    buttonVariants({ variant: "ghost", size: "sm" }),
                                    "group/btn flex items-center justify-center gap-2"
                                )}
                            >
                                {t("viewProgram")}
                                <ExternalLink className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
                            </a>
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
