"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { motion } from "framer-motion"
import { GraduationCap, SearchX, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { ProgramCard } from "./ProgramCard"
import { ProgramFilters } from "./ProgramFilters"
import { fetchDegreeTypes, fetchPrograms } from "../api"
import { Program, ProgramFilters as ProgramFiltersType } from "../types"

const PAGE_SIZE = 12

export function ProgramList() {
    const t = useTranslations("programs")
    const [filters, setFilters] = useState<ProgramFiltersType>({
        search: "",
        degreeType: "all",
        universityId: "",
        sortBy: "newest",
    })
    const [page, setPage] = useState(1)
    const [allPrograms, setAllPrograms] = useState<Program[]>([])

    const { data, error, isLoading } = useSWR(
        ["programs", filters, page],
        () =>
            fetchPrograms({
                page,
                pageSize: PAGE_SIZE,
                search: filters.search || undefined,
                degreeType: filters.degreeType === "all" ? undefined : filters.degreeType,
                sortBy: filters.sortBy === "newest" ? "createdAt" : filters.sortBy,
                sortDesc: filters.sortBy === "newest" || filters.sortBy === "credits",
            }),
        {
            keepPreviousData: true,
        }
    )

    const { data: degreeTypes } = useSWR("degree-types", fetchDegreeTypes)

    useEffect(() => {
        setPage(1)
        setAllPrograms([])
    }, [filters])

    useEffect(() => {
        if (data?.items) {
            if (page === 1) {
                setAllPrograms(data.items)
            } else {
                setAllPrograms((prev) => {
                    const existingIds = new Set(prev.map((p) => p.id))
                    const newItems = data.items.filter((p) => !existingIds.has(p.id))
                    return [...prev, ...newItems]
                })
            }
        }
    }, [data, page])

    const handleLoadMore = () => {
        if (data?.hasNextPage) {
            setPage((p) => p + 1)
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
                degreeTypes={degreeTypes || []}
                onChange={setFilters}
                resultCount={allPrograms.length}
                totalCount={data?.totalCount || 0}
            />

            {/* Loading */}
            {isLoading && allPrograms.length === 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                        />
                    ))}
                </div>
            )}

            {/* Load more */}
            {data?.hasNextPage && (
                <div className="flex justify-center pt-4">
                    <Button
                        size="lg"
                        onClick={handleLoadMore}
                        disabled={isLoading}
                        className="min-w-[200px]"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t("loading")}
                            </>
                        ) : (
                            t("loadMore", { loaded: allPrograms.length, total: data.totalCount })
                        )}
                    </Button>
                </div>
            )}
        </div>
    )
}
