"use client"

import * as React from "react"
import { Search, X, RotateCcw } from "lucide-react"
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
        filters.universityType !== "all" ||
        (filters.cohort && filters.cohort !== "all")

    const handleClear = () => {
        onChange({
            search: "",
            degreeType: "all",
            universityId: "",
            universityType: "all",
            sortBy: "newest",
            cohort: "all",
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
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={t("searchPlaceholder")}
                        value={filters.search}
                        onChange={(e) =>
                            onChange({ ...filters, search: e.target.value })
                        }
                        className="pl-10 pr-10 h-12 text-sm bg-card border-border shadow-sm rounded-2xl focus-visible:ring-1 focus-visible:ring-primary"
                    />
                    {filters.search && (
                        <button
                            onClick={() => onChange({ ...filters, search: "" })}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                            aria-label="Xóa từ khóa tìm kiếm"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                    <Select
                        value={filters.universityId}
                        onValueChange={(value) =>
                            onChange({ ...filters, universityId: value })
                        }
                        placeholder={t("allUniversities")}
                        aria-label={t("allUniversities")}
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
                        aria-label={t("allUniversityTypes")}
                    >
                        <SelectItem value="all">{t("allUniversityTypes")}</SelectItem>
                        <SelectItem value="public">{t("publicUniversity")}</SelectItem>
                        <SelectItem value="private">{t("privateUniversity")}</SelectItem>
                    </Select>

                    <Select
                        value={filters.cohort && filters.cohort !== "all" ? filters.cohort : ""}
                        onValueChange={(value) =>
                            onChange({ ...filters, cohort: value || "all" })
                        }
                        placeholder="Tất cả khóa (K15 - K23)"
                        aria-label="Khóa tuyển sinh"
                    >
                        <SelectItem value="">Tất cả khóa</SelectItem>
                        <SelectItem value="K23">Khóa K23 (2023 - nay)</SelectItem>
                        <SelectItem value="K22">Khóa K22 (2022)</SelectItem>
                        <SelectItem value="K21">Khóa K21 (2021)</SelectItem>
                        <SelectItem value="K20">Khóa K20 (2020)</SelectItem>
                        <SelectItem value="K19">Khóa K19 (2019)</SelectItem>
                        <SelectItem value="K18">Khóa K18 (2018)</SelectItem>
                        <SelectItem value="K17">Khóa K17 (2017)</SelectItem>
                        <SelectItem value="K16">Khóa K16 (2016)</SelectItem>
                        <SelectItem value="K15">Khóa K15 (2015)</SelectItem>
                    </Select>

                    <Select
                        value={filters.degreeType === "all" ? "" : filters.degreeType}
                        onValueChange={(value) =>
                            onChange({ ...filters, degreeType: value || "all" })
                        }
                        placeholder={t("allDegrees")}
                        aria-label={t("allDegrees")}
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
                        aria-label={t("sort")}
                    >
                        <SelectItem value="newest">{t("sortNewest")}</SelectItem>
                        <SelectItem value="name">{t("sortName")}</SelectItem>
                        <SelectItem value="credits">{t("sortCredits")}</SelectItem>
                    </Select>
                </div>
            </div>

            <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground px-0.5">
                <p>
                    {totalCount > 0 ? (
                        <span>
                            Hiển thị <strong className="text-foreground font-mono">{resultCount}</strong> / <strong className="text-foreground font-mono">{totalCount}</strong> chương trình đào tạo
                        </span>
                    ) : (
                        t("results", { count: resultCount })
                    )}
                </p>
                {hasActiveFilters && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClear}
                        className="h-8 text-xs font-semibold gap-1.5 text-primary hover:text-primary/80 hover:bg-primary/10 rounded-lg"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{t("clearFilters") || "Xóa bộ lọc"}</span>
                    </Button>
                )}
            </div>
        </div>
    )
}

