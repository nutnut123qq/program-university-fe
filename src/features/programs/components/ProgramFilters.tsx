"use client"

import * as React from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectItem } from "@/components/ui/select"
import { useTranslations } from "next-intl"
import { ProgramFilters as ProgramFiltersType, University } from "../types"

interface ProgramFiltersProps {
    filters: ProgramFiltersType
    universities: University[]
    degreeTypes: string[]
    onChange: (filters: ProgramFiltersType) => void
    resultCount: number
    totalCount: number
}

export function ProgramFilters({
    filters,
    universities,
    degreeTypes,
    onChange,
    resultCount,
    totalCount,
}: ProgramFiltersProps) {
    const t = useTranslations("programs")

    const visibleUniversities = React.useMemo(() => {
        if (filters.universityType === "all") return universities
        const isPublic = filters.universityType === "public"
        return universities.filter((u) => u.isPublic === isPublic)
    }, [universities, filters.universityType])

    const hasActiveFilters =
        filters.search ||
        filters.degreeType !== "all" ||
        filters.universityId ||
        filters.universityType !== "all"

    const handleClear = () => {
        onChange({
            search: "",
            degreeType: "all",
            universityId: "",
            universityType: "all",
            sortBy: "newest",
        })
    }

    const handleTypeChange = (value: ProgramFiltersType["universityType"]) => {
        const newFilters: ProgramFiltersType = { ...filters, universityType: value }
        if (filters.universityId) {
            const isPublic = value === "public"
            const stillVisible =
                value === "all" ||
                universities.some((u) => u.id === filters.universityId && u.isPublic === isPublic)
            if (!stillVisible) {
                newFilters.universityId = ""
            }
        }
        onChange(newFilters)
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={t("searchPlaceholder")}
                        value={filters.search}
                        onChange={(e) =>
                            onChange({ ...filters, search: e.target.value })
                        }
                        className="pl-9"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Select
                        value={filters.universityId}
                        onValueChange={(value) =>
                            onChange({ ...filters, universityId: value })
                        }
                        placeholder={t("allUniversities")}
                    >
                        <SelectItem value="">{t("allUniversities")}</SelectItem>
                        {visibleUniversities.map((uni) => (
                            <SelectItem key={uni.id} value={uni.id}>
                                {uni.name}
                            </SelectItem>
                        ))}
                    </Select>

                    <Select
                        value={filters.universityType}
                        onValueChange={(value) =>
                            handleTypeChange(value as ProgramFiltersType["universityType"])
                        }
                        placeholder={t("allUniversityTypes")}
                    >
                        <SelectItem value="all">{t("allUniversityTypes")}</SelectItem>
                        <SelectItem value="public">{t("publicUniversity")}</SelectItem>
                        <SelectItem value="private">{t("privateUniversity")}</SelectItem>
                    </Select>

                    <Select
                        value={filters.degreeType === "all" ? "" : filters.degreeType}
                        onValueChange={(value) =>
                            onChange({ ...filters, degreeType: value || "all" })
                        }
                        placeholder={t("allDegrees")}
                    >
                        <SelectItem value="">{t("allDegrees")}</SelectItem>
                        {(degreeTypes || []).map((type) => (
                            <SelectItem key={type} value={type}>
                                {type}
                            </SelectItem>
                        ))}
                    </Select>

                    <Select
                        value={filters.sortBy}
                        onValueChange={(value) =>
                            onChange({
                                ...filters,
                                sortBy: value as ProgramFiltersType["sortBy"],
                            })
                        }
                        placeholder={t("sort")}
                    >
                        <SelectItem value="newest">{t("sortNewest")}</SelectItem>
                        <SelectItem value="name">{t("sortName")}</SelectItem>
                        <SelectItem value="credits">{t("sortCredits")}</SelectItem>
                    </Select>
                </div>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
                <p>
                    {totalCount > 0
                        ? t("resultsOfTotal", { count: resultCount, total: totalCount })
                        : t("results", { count: resultCount })}
                </p>
                {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={handleClear}>
                        {t("clearFilters")}
                    </Button>
                )}
            </div>
        </div>
    )
}
