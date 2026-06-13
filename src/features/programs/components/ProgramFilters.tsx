"use client"

import { Search, GraduationCap } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectItem } from "@/components/ui/select"
import { useTranslations } from "next-intl"
import { ProgramFilters as ProgramFiltersType } from "../types"

interface ProgramFiltersProps {
    filters: ProgramFiltersType
    degreeTypes: string[]
    onChange: (filters: ProgramFiltersType) => void
    resultCount: number
    totalCount: number
}

export function ProgramFilters({
    filters,
    degreeTypes,
    onChange,
    resultCount,
    totalCount,
}: ProgramFiltersProps) {
    const t = useTranslations("programs")

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
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

                <div className="flex gap-3">
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
                {(filters.search || filters.degreeType !== "all") && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                            onChange({
                                search: "",
                                degreeType: "all",
                                universityId: "",
                                sortBy: "newest",
                            })
                        }
                    >
                        {t("clearFilters")}
                    </Button>
                )}
            </div>
        </div>
    )
}
