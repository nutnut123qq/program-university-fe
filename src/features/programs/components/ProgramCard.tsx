"use client"

import { motion } from "framer-motion"
import { GraduationCap, Building2, BookOpen, ExternalLink, Clock, Award, Eye, Sparkles } from "lucide-react"
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

function extractCohorts(code?: string | null, name?: string | null): string[] {
    const text = `${code || ""} ${name || ""}`
    const matches = text.match(/\bK\d{2}[A-D]?\b/gi)
    if (!matches) return []
    return Array.from(new Set(matches.map((m) => m.toUpperCase())))
}

function extractSpecialization(name?: string | null): string | null {
    if (!name) return null
    const m = name.match(/chuy[êe]n\s+ng[àa]nh\s+([^(_,\n]+)/i)
    if (m) return m[1].trim()
    return null
}

export function ProgramCard({ program, index, onViewDetail }: ProgramCardProps) {
    const t = useTranslations("programs")
    const cohorts = extractCohorts(program.code, program.name)
    const specialization = extractSpecialization(program.name)

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
            className="h-full"
        >
            <Card className="group h-full flex flex-col justify-between overflow-hidden border border-border bg-card/80 hover:bg-card hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1 rounded-2xl">
                <div>
                    <CardHeader className="p-5 pb-3 min-w-0">
                        <div className="flex items-start justify-between gap-2.5 min-w-0">
                            <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {program.code && (
                                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-muted text-foreground border border-border/50">
                                            {program.code}
                                        </span>
                                    )}
                                    {cohorts.slice(0, 2).map((c) => (
                                        <Badge key={c} className="font-mono text-[10px] font-bold px-1.5 py-0 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                                            Khóa {c}
                                        </Badge>
                                    ))}
                                    {cohorts.length > 2 && (
                                        <span className="font-mono text-[10px] text-muted-foreground font-semibold">
                                            +{cohorts.length - 2}
                                        </span>
                                    )}
                                    {specialization && (
                                        <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md truncate max-w-[140px]">
                                            {specialization}
                                        </span>
                                    )}
                                </div>
                                <h3 className="font-extrabold text-base leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors pt-0.5">
                                    {program.name}
                                </h3>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
                                    <span className="truncate font-medium">{program.universityName}</span>
                                </div>
                            </div>
                            {program.degreeType && (
                                <Badge variant="secondary" className="shrink-0 text-xs font-semibold">
                                    {program.degreeType}
                                </Badge>
                            )}
                        </div>
                    </CardHeader>

                    <CardContent className="px-5 pt-0 pb-4 space-y-3.5 min-w-0">
                        {program.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                {program.description}
                            </p>
                        )}

                        <div className="flex flex-wrap gap-1.5">
                            {program.credits && (
                                <Badge variant="outline" className="flex items-center gap-1 font-semibold text-xs py-0.5 px-2 bg-muted/30">
                                    <BookOpen className="h-3 w-3 text-primary" />
                                    {t("credits", { count: program.credits })}
                                </Badge>
                            )}
                            {program.duration && (
                                <Badge variant="outline" className="flex items-center gap-1 font-normal text-xs py-0.5 px-2">
                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                    {program.duration}
                                </Badge>
                            )}
                            {program.language && (
                                <Badge variant="outline" className="flex items-center gap-1 font-normal text-xs py-0.5 px-2">
                                    <Award className="h-3 w-3 text-muted-foreground" />
                                    {program.language}
                                </Badge>
                            )}
                            {program.courseCount > 0 && (
                                <Badge variant="outline" className="flex items-center gap-1 font-semibold text-xs py-0.5 px-2 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                                    <GraduationCap className="h-3 w-3" />
                                    {t("courses", { count: program.courseCount })}
                                </Badge>
                            )}
                        </div>
                    </CardContent>
                </div>

                <div className="px-5 pb-5 pt-0">
                    <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                        {onViewDetail && (
                            <button
                                onClick={() => onViewDetail(program)}
                                className={cn(
                                    buttonVariants({ variant: "default", size: "sm" }),
                                    "flex-1 h-10 sm:h-9 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm min-w-0"
                                )}
                            >
                                <Eye className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{t("viewDetail")}</span>
                            </button>
                        )}
                        {program.sourceUrl && (
                            <a
                                href={program.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                    buttonVariants({ variant: "outline", size: "sm" }),
                                    "h-10 sm:h-9 text-xs font-semibold rounded-xl flex items-center justify-center gap-1 px-3 shrink-0"
                                )}
                                title="Mở trang web chính thức của trường"
                            >
                                <span className="hidden sm:inline">Nguồn</span>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            </a>
                        )}
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}

