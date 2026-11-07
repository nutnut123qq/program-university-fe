"use client"

import React, { useState, useMemo, useId, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import {
    GitFork,
    Search,
    ArrowRight,
    ArrowLeft,
    Layers,
    BookOpen,
    Loader2,
    CheckCircle2,
    Sparkles,
    GraduationCap,
    RotateCcw,
    ChevronRight,
    X,
    HelpCircle,
    AlertTriangle,
} from "lucide-react"
import useSWR from "swr"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { fetchRoadmapFile, fetchRoadmapNames, fetchRoadmapsIndex, fetchSyllabus, fetchUniversities } from "@/features/programs/api"
import { SyllabusDetailModal } from "@/features/programs/components/SyllabusDetailModal"
import { DataAttribution } from "@/features/programs/components/DataAttribution"
import {
    DEFAULT_ROADMAP_UNIVERSITY,
    ROADMAP_UNIVERSITIES,
    relationCodes,
    roadmapFileKey,
    roadmapSuggestions,
    sameName,
    withoutFiller,
} from "@/features/programs/roadmapUniversities"
import { pushRoadmapUniParam, useRoadmapUniParam } from "@/features/programs/roadmapLink"
import { Curriculum, University } from "@/features/programs/types"

const POPULAR_SUBJECTS = [
    "SWE201c",
    "PRF192",
    "PRO192",
    "CSD201",
    "DBI202",
    "MAS291",
    "PRJ301",
    "SWP391",
    "SWT301",
    "MAE101",
    "OSG202",
    "NWC203c",
]

const DEFAULT_CODE = "SWE201c"

export default function RoadmapPage() {
    const t = useTranslations("roadmap")
    const tp = useTranslations("programs")
    const pickerId = useId()
    const [searchQuery, setSearchQuery] = useState("")
    // null = the first code of the university's index (FPT keeps its curated default).
    const [pickedCode, setPickedCode] = useState<string | null>(DEFAULT_CODE)
    const [syllabusModalCourse, setSyllabusModalCourse] = useState<Curriculum | null>(null)
    // Universities whose search box was used: their names file stays wanted (the name search).
    const [searchedUnis, setSearchedUnis] = useState<ReadonlySet<string>>(() => new Set())
    // Moves focus to the banner title after a focus change from a control that leaves the page (v2.63).
    const bannerTitleRef = useRef<HTMLHeadingElement>(null)
    const [focusRequest, setFocusRequest] = useState(0)

    const { data: universities, error: universitiesError } = useSWR("universities", fetchUniversities)
    // Picker options: universities with roadmap data first; the fixed list alone until universities.json loads.
    const options = useMemo(() => {
        const listed = (universities as Array<University & { code?: string | null }> | undefined)
            ?.filter((u) => u.code)
            .map((u) => ({ code: u.code as string, name: u.name }))
        const all = listed?.length ? listed : [...ROADMAP_UNIVERSITIES.keys()].map((code) => ({ code, name: code }))
        return {
            withData: all.filter((u) => ROADMAP_UNIVERSITIES.has(u.code)),
            withoutData: all.filter((u) => !ROADMAP_UNIVERSITIES.has(u.code)),
        }
    }, [universities])
    const offered = useMemo(() => new Set([...options.withData, ...options.withoutData].map((u) => u.code)), [options])
    // `?uni=` (v2.63): the URL holds the pick. A value counts only when the picker offers it — the 4 codes with data at
    // once, another university of universities.json once that has loaded; anything else is the FPT default.
    const uniParam = useRoadmapUniParam()
    // v2.69 (audit M17): the university is decided once the URL is read (undefined in the static HTML and the hydration
    // render) and, for a value outside the 4 roadmap universities, once universities.json has loaded or failed (whether
    // the picker offers it). Until then nothing is requested and the university part stays invisible (the static HTML
    // keeps its FPT markup under it): `?uni=NEU` never fetches or paints FPT first; `/roadmap` shows FPT after hydration.
    const decided =
        uniParam !== undefined &&
        (uniParam === null || ROADMAP_UNIVERSITIES.has(uniParam) || universities !== undefined || !!universitiesError)
    const university = uniParam != null && offered.has(uniParam) ? uniParam : DEFAULT_ROADMAP_UNIVERSITY
    // Every university change (picker, Back/Forward, a `?uni=` link) opens that university's default course. The initial
    // state above (SWE201c, an empty search) is the default university's, so the shown university starts as the default
    // too: a mount on another university's URL — the hydration's post-commit re-read, or the first render of a client
    // remount such as Back into a `?uni=` entry — goes through this reset (v2.63 fix r1: starting at the URL's university
    // skipped the reset on a remount and kept SWE201c under NEU).
    const [shownUniversity, setShownUniversity] = useState(DEFAULT_ROADMAP_UNIVERSITY)
    if (shownUniversity !== university) {
        setShownUniversity(university)
        setPickedCode(university === DEFAULT_ROADMAP_UNIVERSITY ? DEFAULT_CODE : null)
        setSearchQuery("")
        setSyllabusModalCourse(null)
    }
    // undefined = no roadmap data for this university: no roadmap/syllabus path is ever built for it.
    const uniData = ROADMAP_UNIVERSITIES.get(university)
    // The data part of the SWR keys: none before the university is decided.
    const fetchData = decided ? uniData : undefined
    const isDefaultUni = university === DEFAULT_ROADMAP_UNIVERSITY
    const universityName =
        [...options.withData, ...options.withoutData].find((u) => u.code === university)?.name ?? university
    const describeRelations = !uniData?.fullGraph

    // The index lists the codes that have a roadmap file; a failed load is an error with a retry button, never "no courses".
    const { data: indexList, error: indexError, mutate: retryIndex } = useSWR(
        fetchData ? ["roadmaps-index", university] : null,
        // Parameters from the key, never a closure (§12 v2.63 (a)): a deferred revalidation of an old key runs the newest fetcher.
        ([, uni]: string[]) => fetchRoadmapsIndex(uni),
        { shouldRetryOnError: false }
    )
    const indexFiles = useMemo(() => (indexList ? new Set(indexList.map(roadmapFileKey)) : null), [indexList])
    // undefined = not known yet (the index is still loading or failed).
    const hasFile = (code: string) => (indexFiles ? indexFiles.has(roadmapFileKey(code)) : undefined)
    const selectedCode = pickedCode ?? indexList?.[0] ?? ""
    const selectedHasFile = selectedCode ? hasFile(selectedCode) : undefined
    const { data: roadmapFile, error: roadmapError, mutate: retryRoadmap } = useSWR(
        // No request for a code the loaded index does not hold.
        fetchData && selectedCode && selectedHasFile !== false ? ["roadmap-file", university, selectedCode] : null,
        ([, uni, code]: string[]) => fetchRoadmapFile(uni, code),
        // A failed file stays failed until its retry button (no background retry under the user's eyes).
        { shouldRetryOnError: false }
    )
    // No roadmap file for the focus: not in the loaded index, or a 404 before the index was known.
    const noFile = !!selectedCode && (selectedHasFile === false || roadmapFile === null)
    const currentRoadmap = roadmapFile ?? undefined
    const { data: syllabusFile } = useSWR(
        // Syllabi exist only for some universities; never request one that does not exist — nor for a code without a
        // roadmap file (none of the codes reachable that way has a syllabus file: v2.63 measure, pinned by its e2e).
        fetchData?.syllabus && selectedCode && !noFile ? ["syllabus", university, selectedCode] : null,
        ([, uni, code]: string[]) => fetchSyllabus(uni, code)
    )
    const currentSyllabus = withoutFiller(university, syllabusFile)
    const bannerTitle = currentRoadmap?.subjectName || currentSyllabus?.info?.syllabusName || selectedCode
    const hasSyllabus = !!uniData?.syllabus && !noFile
    const flow = !selectedCode
        ? indexError
            ? "indexFailed"
            : "loading"
        : noFile
          ? "noFile"
          : roadmapError
            ? "failed"
            : currentRoadmap
              ? "ready"
              : "loading"

    const directPrereqs = relationCodes(currentRoadmap?.directPrereqs)
    const unlocks = currentRoadmap?.unlocks || []
    const mapNames = currentRoadmap?.names || {}
    // A neighbour without a name in the course file (NEU/TDTU/UIT files carry no names map) takes the name of its own
    // file from the university's names file, read once (v2.63); a neighbour without a roadmap file needs none.
    const neighboursNeedNames = [...directPrereqs, ...unlocks].some((code) => !mapNames[code] && hasFile(code) === true)
    const wantNames = !!fetchData && (searchedUnis.has(university) || neighboursNeedNames)
    const { data: courseNames, error: namesError } = useSWR(
        wantNames ? ["roadmap-names", university] : null,
        ([, uni]: string[]) => fetchRoadmapNames(uni)
    )
    const namesPending = wantNames && !courseNames && !namesError
    const namesByFile = useMemo(
        () => (courseNames ? new Map(Object.entries(courseNames).map(([code, name]) => [roadmapFileKey(code), name])) : null),
        [courseNames]
    )

    /** A neighbour card's name line: the course file's names map (FPT), else the name in the neighbour's own file. */
    const neighbourName = (code: string): { text: string; known: boolean } => {
        if (mapNames[code]) return { text: mapNames[code], known: true }
        const file = hasFile(code)
        if (file === false) return { text: t("noFileShort"), known: false }
        if (file && courseNames) {
            const name = namesByFile?.get(roadmapFileKey(code))?.trim()
            return name ? { text: name, known: true } : { text: "—", known: false }
        }
        if (file && namesError) return { text: t("nameFailed"), known: false }
        return { text: t("nameLoading"), known: false }
    }

    const selectUniversity = (code: string) => {
        // Only a code the picker offers; ROADMAP_UNIVERSITIES then decides whether any path is built.
        if (!offered.has(code)) return
        // v2.63: a pick is a history entry (Back returns to the previous university); FPT = the URL without `uni`.
        pushRoadmapUniParam(code === DEFAULT_ROADMAP_UNIVERSITY ? null : code)
    }

    const onSearchChange = (value: string) => {
        setSearchQuery(value)
        if (value.trim() && uniData && !searchedUnis.has(university)) setSearchedUnis(new Set([...searchedUnis, university]))
    }

    // Autocomplete suggestions: codes as at Base, then course names (v2.63), as typed first (v2.68)
    const suggestions = useMemo(
        () => (indexList ? roadmapSuggestions(indexList, courseNames, searchQuery) : []),
        [indexList, courseNames, searchQuery]
    )

    // moveFocus: the clicked control leaves the page (a suggestion, a neighbour card's button), so focus goes to the
    // banner title, which names the focus in every state (loading, no file, failed, loaded).
    const handleSelectCode = (code: string, moveFocus = false) => {
        setPickedCode(code)
        setSearchQuery("")
        if (moveFocus) setFocusRequest((n) => n + 1)
    }
    useEffect(() => {
        if (focusRequest > 0) bannerTitleRef.current?.focus()
    }, [focusRequest])

    const openSyllabusFor = (code: string, name?: string) => {
        setSyllabusModalCourse({
            id: code,
            programId: "roadmap",
            programName: `${university} Roadmap`,
            year: 2026,
            courseName: name || currentRoadmap?.names?.[code] || code,
            courseCode: code,
            // Not known here (a fixed number would be shown as every course's credits/semester).
            credits: null,
            mandatory: true,
            semester: null,
            hoursTheory: null,
            hoursPractice: null,
            description: null,
            prerequisites: null,
            createdAt: "",
            updatedAt: "",
        })
    }

    return (
        <div className="container mx-auto py-8 px-4 sm:px-6 space-y-8 max-w-6xl">
            {/* Hero Header */}
            <motion.section
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="text-center space-y-3 max-w-3xl mx-auto"
            >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-semibold">
                    <GitFork className="w-3.5 h-3.5" />
                    <span>{t("badge")}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
                    {t("title")}
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {t("subtitle")}
                </p>
            </motion.section>

            {/* The university part: invisible (space kept) until the university is decided (v2.69, see `decided`). Without
                JavaScript the URL is never read: the noscript rule shows it as the static HTML has it (the FPT default, as at Base). */}
            <noscript dangerouslySetInnerHTML={{ __html: '<style>[data-testid="roadmap-university"]{visibility:visible!important}</style>' }} />
            <div data-testid="roadmap-university" className={decided ? "space-y-8" : "space-y-8 invisible"}>
            {/* University picker, search and popular subject chips */}
            <div className="max-w-2xl mx-auto space-y-3">
                <div className="flex items-center gap-2">
                    <label htmlFor={pickerId} className="text-xs font-semibold text-muted-foreground shrink-0">
                        {t("universityLabel")}
                    </label>
                    <select
                        id={pickerId}
                        value={university}
                        onChange={(e) => selectUniversity(e.target.value)}
                        className="flex-1 min-w-0 h-10 rounded-xl border border-border bg-card px-3 text-sm font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                        <optgroup label={t("universitiesWithData")}>
                            {options.withData.map((u) => (
                                <option key={u.code} value={u.code}>
                                    {u.name === u.code ? u.code : `${u.name} (${u.code})`}
                                </option>
                            ))}
                        </optgroup>
                        {options.withoutData.length > 0 && (
                            <optgroup label={t("universitiesWithoutData")}>
                                {options.withoutData.map((u) => (
                                    <option key={u.code} value={u.code}>
                                        {`${u.name} (${u.code})`}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </div>

                {uniData && (
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={isDefaultUni ? t("searchPlaceholder") : t("searchPlaceholderCode")}
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-10 pr-10 h-12 text-sm bg-card border-border shadow-sm rounded-2xl focus-visible:ring-1 focus-visible:ring-primary"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                            aria-label={t("clearSearch")}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}

                    {/* No list for a whitespace-only query: no suggestion, no names status row (v2.63 fix r1). */}
                    {searchQuery.trim() && (suggestions.length > 0 || namesPending || !!namesError) && (
                        <div className="absolute top-full mt-1.5 left-0 right-0 z-30 bg-card border border-border rounded-2xl shadow-xl overflow-hidden divide-y divide-border">
                            {suggestions.map((code) => (
                                <button
                                    key={code}
                                    onClick={() => handleSelectCode(code, true)}
                                    className="w-full px-4 py-3 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between gap-3 group"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-mono font-bold text-foreground group-hover:text-primary transition-colors">{code}</span>
                                        {courseNames?.[code] && (
                                            <span className="block text-xs text-muted-foreground truncate">{courseNames[code]}</span>
                                        )}
                                    </span>
                                    <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1 shrink-0">
                                        {t("viewRoadmap")} <ArrowRight className="w-3.5 h-3.5" />
                                    </span>
                                </button>
                            ))}
                            {(namesPending || !!namesError) && (
                                <p role="status" className="px-4 py-2.5 text-xs text-muted-foreground">
                                    {t(namesError ? "namesFailed" : "namesLoading")}
                                </p>
                            )}
                        </div>
                    )}
                </div>
                )}

                {/* Popular chips: a hand-picked FPT list, so only for FPT */}
                {isDefaultUni && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
                    <span className="text-muted-foreground font-medium mr-1">{t("popularSubjects")}</span>
                    {POPULAR_SUBJECTS.map((code) => (
                        <button
                            key={code}
                            onClick={() => handleSelectCode(code)}
                            className={`px-3 py-1 rounded-xl font-mono text-xs transition-all duration-200 ${
                                selectedCode === code
                                    ? "bg-primary text-primary-foreground font-bold shadow-sm scale-105"
                                    : "bg-muted/80 text-foreground hover:bg-muted hover:border-primary/40 border border-transparent"
                            }`}
                        >
                            {code}
                        </button>
                    ))}
                </div>
                )}
            </div>

            {!uniData ? (
                <div className="p-12 rounded-3xl border border-dashed border-border text-center space-y-3 bg-muted/10">
                    <HelpCircle className="w-10 h-10 text-muted-foreground/50 mx-auto" />
                    <h2 className="font-bold text-base text-foreground">
                        {t("noDataTitle", { university: universityName })}
                    </h2>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        {t("noDataHint", { list: options.withData.map((u) => u.code).join(", ") })}
                    </p>
                </div>
            ) : (
            <>
            {/* Target Subject Active Banner — only with a focus (none while a university's index loads: v2.63) */}
            {selectedCode && (
            <Card className="border-border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden rounded-2xl">
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge className="font-mono text-sm font-extrabold px-3 py-0.5 bg-primary/10 text-primary border-primary/20">
                                    {selectedCode}
                                </Badge>
                                {currentSyllabus?.info?.credits && (
                                    <Badge variant="outline" className="font-mono text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 font-bold">
                                        {tp("credits", { count: currentSyllabus.info.credits })}
                                    </Badge>
                                )}
                                {currentSyllabus?.info?.minAvgToPass && (
                                    <Badge variant="secondary" className="text-xs font-semibold">
                                        {t("passScore", { score: currentSyllabus.info.minAvgToPass })}
                                    </Badge>
                                )}
                            </div>
                            <h2
                                ref={bannerTitleRef}
                                tabIndex={-1}
                                className="text-xl sm:text-2xl font-black tracking-tight text-foreground truncate focus:outline-none"
                            >
                                {bannerTitle}
                            </h2>
                            {currentSyllabus?.info?.syllabusEnglish && !sameName(currentSyllabus.info.syllabusEnglish, bannerTitle) && (
                                <p className="text-xs text-muted-foreground italic truncate">
                                    {currentSyllabus.info.syllabusEnglish}
                                </p>
                            )}
                        </div>

                        {hasSyllabus ? (
                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                onClick={() => openSyllabusFor(selectedCode, currentRoadmap?.subjectName)}
                                className="gap-2 h-10 px-4 text-xs font-bold rounded-xl shadow-sm hover:scale-[1.02] transition-all"
                            >
                                <BookOpen className="w-4 h-4" />
                                <span>{t("viewSyllabus")}</span>
                            </Button>
                        </div>
                        ) : !uniData.syllabus ? (
                            <p className="text-xs text-muted-foreground md:max-w-[16rem] md:text-right">
                                {t("noSyllabusNote", { university: universityName })}
                            </p>
                        ) : null}
                    </div>
                </CardContent>
            </Card>
            )}

            {/* Source + collection date of this university's course data (AGENTS.md §9); roadmap files carry no date. */}
            <DataAttribution universityCode={university} className={selectedCode ? "-mt-4 px-1" : "px-1"} />

            {/* 3-Column Visual Roadmap Flow */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold flex items-center gap-2">
                        <Layers className="w-4 h-4 text-primary" />
                        <span>{t("flowTitle")}</span>
                    </h3>
                    {/* Counts only for a loaded file (none while loading, for a code without a file or a failed load). */}
                    {flow === "ready" && (
                    <span className="text-xs text-muted-foreground font-mono font-medium">
                        {t(describeRelations ? "flowStatsData" : "flowStats", { prereqs: directPrereqs.length, unlocks: unlocks.length })}
                    </span>
                    )}
                </div>

                {flow === "loading" ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <p className="text-sm font-medium">{t("loading")}</p>
                    </div>
                ) : flow === "noFile" ? (
                    <div data-testid="roadmap-no-file" className="p-12 rounded-3xl border border-dashed border-border text-center space-y-3 bg-muted/10">
                        <HelpCircle className="w-10 h-10 text-muted-foreground/50 mx-auto" />
                        <h4 className="font-bold text-base text-foreground">{t("missingTitle", { code: selectedCode })}</h4>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                            {t("missingHint", { university: universityName })}
                        </p>
                    </div>
                ) : flow === "failed" || flow === "indexFailed" ? (
                    <div data-testid="roadmap-load-failed" className="p-12 rounded-3xl border border-dashed border-amber-500/40 text-center space-y-3 bg-amber-500/5">
                        <AlertTriangle className="w-10 h-10 text-amber-500/70 mx-auto" />
                        <h4 className="font-bold text-base text-foreground">{t("loadFailedTitle")}</h4>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                            {flow === "failed" ? t("loadFailedHint", { code: selectedCode }) : t("indexFailedHint", { university: universityName })}
                        </p>
                        <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => (flow === "failed" ? retryRoadmap() : retryIndex())}>
                            <RotateCcw className="w-3.5 h-3.5" />
                            {t("retry")}
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                        {/* 1. Môn Tiên Quyết (Prerequisites) */}
                        <div className="space-y-3 flex flex-col h-full" data-testid="roadmap-prereqs">
                            <div className="flex items-center gap-2 pb-2.5 border-b border-border">
                                <ArrowLeft className="w-4 h-4 text-amber-500 shrink-0" />
                                <h4 className="font-bold text-sm text-foreground">
                                    {t("prereqTitle")}
                                </h4>
                                <Badge variant="outline" className="font-mono text-xs ml-auto">
                                    {t("courseCount", { count: directPrereqs.length })}
                                </Badge>
                            </div>

                            {directPrereqs.length === 0 ? (
                                <div className="p-6 rounded-2xl border border-dashed border-border bg-muted/20 text-center text-xs text-muted-foreground space-y-1.5 flex-1 flex flex-col items-center justify-center">
                                    <Sparkles className="w-5 h-5 text-muted-foreground/50 mx-auto" />
                                    <p className="font-bold text-foreground">{t(describeRelations ? "prereqNotRecordedTitle" : "noPrereqTitle")}</p>
                                    <p className="leading-relaxed">
                                        {describeRelations ? t("prereqNotRecordedHint", { university: universityName }) : t("noPrereqHint")}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2.5 flex-1">
                                    {directPrereqs.map((code) => {
                                        const name = neighbourName(code)
                                        return (
                                        <Card
                                            key={code}
                                            className="border-border bg-card/80 hover:bg-card hover:border-amber-500/50 transition-all duration-200 shadow-sm hover:shadow-md group rounded-xl"
                                        >
                                            <CardContent className="p-4 space-y-2.5">
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="font-mono text-xs font-black text-amber-600 dark:text-amber-400">
                                                        {code}
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-bold">
                                                        {t("requiredFirst")}
                                                    </Badge>
                                                </div>
                                                <p className={`text-xs line-clamp-2 leading-snug ${name.known ? "font-bold text-foreground" : "font-medium italic text-muted-foreground"}`}>
                                                    {name.text}
                                                </p>
                                                <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleSelectCode(code, true)}
                                                        className="h-7 px-2.5 text-[11px] font-semibold text-muted-foreground hover:text-primary gap-1 rounded-lg"
                                                    >
                                                        <RotateCcw className="w-3 h-3" />
                                                        {t("changeFocus")}
                                                    </Button>
                                                    {hasSyllabus && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openSyllabusFor(code)}
                                                        className="h-7 px-2.5 text-[11px] font-semibold gap-1 rounded-lg"
                                                    >
                                                        {t("syllabus")} <ChevronRight className="w-3 h-3" />
                                                    </Button>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 2. Môn Trọng Tâm Hiện Tại (Center Target) */}
                        <div className="space-y-3 flex flex-col h-full">
                            <div className="flex items-center justify-center gap-2 pb-2.5 border-b border-border text-center">
                                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                                <h4 className="font-bold text-sm text-foreground">
                                    {t("currentTitle")}
                                </h4>
                            </div>

                            <Card className="border-2 border-primary bg-primary/5 shadow-md rounded-2xl flex-1 flex flex-col justify-center">
                                <CardContent className="p-6 space-y-4 text-center">
                                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mx-auto shadow-md">
                                        <GraduationCap className="w-8 h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <Badge className="font-mono text-xs font-black px-3 py-1 bg-primary text-primary-foreground">
                                            {selectedCode}
                                        </Badge>
                                        <h3 className="font-black text-base text-foreground mt-2 leading-tight">
                                            {currentRoadmap?.subjectName || selectedCode}
                                        </h3>
                                    </div>

                                    {currentSyllabus?.info?.decisionNo && (
                                        <p className="text-[11px] text-muted-foreground">
                                            {t("decisionNo")} <span className="font-mono font-bold text-foreground">{currentSyllabus.info.decisionNo}</span>
                                        </p>
                                    )}

                                    {hasSyllabus && (
                                    <Button
                                        onClick={() => openSyllabusFor(selectedCode, currentRoadmap?.subjectName)}
                                        className="w-full gap-2 rounded-xl text-xs font-bold h-10 shadow-sm"
                                    >
                                        <BookOpen className="w-4 h-4" />
                                        <span>{t("viewScores")}</span>
                                    </Button>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* 3. Môn Được Mở Khóa Tiếp Theo (Unlocks) */}
                        <div className="space-y-3 flex flex-col h-full" data-testid="roadmap-unlocks">
                            <div className="flex items-center gap-2 pb-2.5 border-b border-border">
                                <ArrowRight className="w-4 h-4 text-emerald-500 shrink-0" />
                                <h4 className="font-bold text-sm text-foreground">
                                    {t("unlockTitle")}
                                </h4>
                                <Badge variant="outline" className="font-mono text-xs ml-auto text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 font-bold">
                                    {t("courseCount", { count: unlocks.length })}
                                </Badge>
                            </div>

                            {unlocks.length === 0 ? (
                                <div className="p-6 rounded-2xl border border-dashed border-border bg-muted/20 text-center text-xs text-muted-foreground space-y-1.5 flex-1 flex flex-col items-center justify-center">
                                    <GraduationCap className="w-5 h-5 text-muted-foreground/50 mx-auto" />
                                    <p className="font-bold text-foreground">{t(describeRelations ? "unlockNotRecordedTitle" : "terminalTitle")}</p>
                                    <p className="leading-relaxed">
                                        {describeRelations ? t("unlockNotRecordedHint", { university: universityName }) : t("terminalHint")}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1 flex-1">
                                    {unlocks.map((code) => {
                                        const name = neighbourName(code)
                                        return (
                                        <Card
                                            key={code}
                                            className="border-border bg-card/80 hover:bg-card hover:border-emerald-500/50 transition-all duration-200 shadow-sm hover:shadow-md group rounded-xl"
                                        >
                                            <CardContent className="p-4 space-y-2.5">
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400">
                                                        {code}
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold">
                                                        {t("unlockedBadge")}
                                                    </Badge>
                                                </div>
                                                <p className={`text-xs line-clamp-2 leading-snug ${name.known ? "font-bold text-foreground" : "font-medium italic text-muted-foreground"}`}>
                                                    {name.text}
                                                </p>
                                                <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleSelectCode(code, true)}
                                                        className="h-7 px-2.5 text-[11px] font-semibold text-muted-foreground hover:text-primary gap-1 rounded-lg"
                                                    >
                                                        <RotateCcw className="w-3 h-3" />
                                                        {t("changeFocus")}
                                                    </Button>
                                                    {hasSyllabus && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openSyllabusFor(code)}
                                                        className="h-7 px-2.5 text-[11px] font-semibold gap-1 rounded-lg"
                                                    >
                                                        {t("syllabus")} <ChevronRight className="w-3 h-3" />
                                                    </Button>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            </>
            )}
            </div>

            {/* Syllabus Modal */}
            <SyllabusDetailModal
                course={syllabusModalCourse}
                universityCode={university}
                open={!!syllabusModalCourse}
                onClose={() => setSyllabusModalCourse(null)}
                onSelectCourseCode={(code) => {
                    handleSelectCode(code)
                    openSyllabusFor(code)
                }}
            />
        </div>
    )
}
