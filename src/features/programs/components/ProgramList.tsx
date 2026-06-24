"use client"

import { useCallback, useMemo, useState } from "react"
import useSWR from "swr"
import useSWRInfinite from "swr/infinite"
import { motion } from "framer-motion"
import { GraduationCap, SearchX, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { ProgramCard } from "./ProgramCard"
import { ProgramFilters } from "./ProgramFilters"
import { ProgramDetailDialog } from "./ProgramDetailDialog"
import { fetchDegreeTypes, fetchPrograms, fetchUniversities } from "../api"
import { Program, ProgramFilters as ProgramFiltersType, ProgramsResponse } from "../types"

const PAGE_SIZE = 12

export function ProgramList() {
    const t = useTranslations("programs")
    const [filters, setFilters] = useState<ProgramFiltersType>({
        search: "",
        degreeType: "all",
        universityId: "",
        universityType: "all",
        sortBy: "newest",
    })
    const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)
    const [lastViewedProgram, setLastViewedProgram] = useState<Program | null>(null)

    const displayProgram = selectedProgram || lastViewedProgram

    const handleSelectProgram = (program: Program | null) => {
        if (program) {
            setLastViewedProgram(program)
        }
        setSelectedProgram(program)
    }

    const getKey = useCallback(
        (pageIndex: number, previousPageData: ProgramsResponse | null) => {
            if (previousPageData && !previousPageData.hasNextPage) return null
            return ["programs", filters, pageIndex + 1] as const
        },
        [filters]
    )

    const { data, error, isLoading, isValidating, size, setSize } = useSWRInfinite(
        getKey,
        ([, currentFilters, page]) =>
            fetchPrograms({
                page,
                pageSize: PAGE_SIZE,
                search: currentFilters.search || undefined,
                degreeType: currentFilters.degreeType === "all" ? undefined : currentFilters.degreeType,
                universityId: currentFilters.universityId || undefined,
                universityType: currentFilters.universityType,
                sortBy: currentFilters.sortBy === "newest" ? "createdAt" : currentFilters.sortBy,
                sortDesc: currentFilters.sortBy === "newest" || currentFilters.sortBy === "credits",
            }),
        { revalidateFirstPage: false }
    )

    const allPrograms = useMemo(() => (data ? data.flatMap((page) => page.items) : []), [data])
    const totalCount = data?.[0]?.totalCount ?? 0
    const hasNextPage = data?.[data.length - 1]?.hasNextPage ?? false

    const { data: degreeTypes } = useSWR("degree-types", fetchDegreeTypes)
    const { data: universities } = useSWR("universities", fetchUniversities)

    const handleFiltersChange = (newFilters: ProgramFiltersType) => {
        setFilters(newFilters)
        setSize(1)
    }

    const handleLoadMore = () => {
        if (hasNextPage) {
            setSize(size + 1)
        }
    }

    return (
        <div className="container mx-auto py-8 space-y-8">
            {/* Hero */}
            <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-4 text-center max-w-3xl mx-auto"
            >
                <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/5 mb-2">
                    <GraduationCap className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                    {t("title")}
                </h1>
                <p className="text-lg text-muted-foreground">
                    {t("subtitle")}
                </p>
            </motion.section>

            {/* Filters */}
            <ProgramFilters
                filters={filters}
                universities={universities || []}
                degreeTypes={degreeTypes || []}
                onChange={handleFiltersChange}
                resultCount={allPrograms.length}
                totalCount={totalCount}
            />

            {/* Loading */}
            {isLoading && allPrograms.length === 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-w-0">
                    {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                        <div key={i} className="space-y-3">
                            <Skeleton className="h-[180px] w-full rounded-xl" />
                        </div>
                    ))}
                </div>
            )}

            {/* Error */}
            {error && !isLoading && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
                    <p className="text-destructive font-medium">
                        {t("errorTitle")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                        {error.message}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={() => window.location.reload()}
                    >
                        {t("retry")}
                    </Button>
                </div>
            )}

            {/* Empty */}
            {!isLoading && !error && allPrograms.length === 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-16 text-center"
                >
                    <div className="rounded-full bg-muted p-4 mb-4">
                        <SearchX className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">{t("emptyTitle")}</h3>
                    <p className="text-muted-foreground mt-1">
                        {t("emptyDescription")}
                    </p>
                </motion.div>
            )}

            {/* Grid */}
            {allPrograms.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {allPrograms.map((program, index) => (
                        <ProgramCard
                            key={program.id}
                            program={program}
                            index={index}
                            onViewDetail={handleSelectProgram}
                        />
                    ))}
                </div>
            )}

            {/* Load more */}
            {hasNextPage && (
                <div className="flex justify-center pt-4">
                    <Button
                        size="lg"
                        onClick={handleLoadMore}
                        disabled={isValidating}
                        className="min-w-[200px]"
                    >
                        {isValidating ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t("loading")}
                            </>
                        ) : (
                            t("loadMore", { loaded: allPrograms.length, total: totalCount })
                        )}
                    </Button>
                </div>
            )}

            <ProgramDetailDialog
                program={displayProgram}
                open={!!selectedProgram}
                onClose={() => setSelectedProgram(null)}
            />
        </div>
    )
}
