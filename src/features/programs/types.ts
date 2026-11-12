export interface University {
    id: string
    name: string
    isPublic: boolean
}

/**
 * Elective course group inside a program curriculum (optional key in
 * /mock/programs-by-id/<pid>.json). `requiredCredits = 0` means the source
 * did not publish a credit count — renderers must not show "0 tín chỉ".
 */
export interface ElectiveGroup {
    groupName: string
    requiredCredits: number
    courseCodes: string[]
}

export interface Program {
    id: string
    universityId: string
    universityName: string
    universityIsPublic: boolean
    name: string
    code: string | null
    degreeType: string | null
    credits: number | null
    duration: string | null
    tuition: string | null
    language: string | null
    formOfStudy: string | null
    sourceUrl: string | null
    lastCrawled: string | null
    description: string | null
    goals: string | null
    careerOutlook: string | null
    learningOutcomes: string | null
    isActive: boolean
    createdAt: string
    updatedAt: string
    courseCount: number
    evaluationScore?: number | null
    // The 4 slm_strict_v3b component scores (1-5): left out of the snapshot when absent, null from the API (v2.51 DTO).
    // Every reader counts only typeof === "number" (ProgramDetailDialog, ProgramComparison).
    evalOutcomes?: number | null
    evalStructure?: number | null
    evalKnowledgeBlocks?: number | null
    evalCompleteness?: number | null
    dataSufficiency?: string | null
    electiveGroups?: ElectiveGroup[]
}

/**
 * A program-list row (v2.50): only what the list's search/filters/sort and
 * ProgramCard read — in mock mode a row of /mock/search-index.json (a search,
 * a filter or the score filter), whose description may be cut for the card and
 * whose lastCrawled is only the day ("YYYY-MM-DD", v2.73); a chunk row (the
 * plain list) or an API row carries the full timestamp. Print lastCrawled only
 * through `collectedDay` (src/lib/crawl-date.ts), which reads both. The detail
 * dialog loads the full Program.
 */
export type ProgramSummary = Pick<
    Program,
    | "id"
    | "universityId"
    | "universityName"
    | "universityIsPublic"
    | "name"
    | "code"
    | "degreeType"
    | "credits"
    | "duration"
    | "language"
    | "sourceUrl"
    | "lastCrawled"
    | "description"
    | "courseCount"
    | "createdAt"
>

export interface Curriculum {
    id: string
    programId: string
    programName: string
    year: number | null
    courseName: string
    courseCode: string | null
    credits: number | null
    mandatory: boolean
    semester: number | null
    knowledgeBlock?: string | null
    hoursTheory: number | null
    hoursPractice: number | null
    description: string | null
    prerequisites: string | null
    createdAt: string
    updatedAt: string
}

export interface PagedResult<T> {
    items: T[]
    totalCount: number
    page: number
    pageSize: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
}

export type ProgramsResponse = PagedResult<Program>

export interface RawDocument {
    id: string
    programId: string | null
    url: string
    docType: string
    /** Crawler storage fields: API mode only — the published snapshot leaves them out (v2.55). */
    storagePath?: string
    fileSize: number
    textPath?: string | null
    contentHash?: string | null
    extractedTextLength: number | null
    status: string
    errorMessage?: string | null
    crawledAt: string
    createdAt: string
    updatedAt: string
    /** Published snapshot: a short excerpt (≤ ~300 chars + "…", v2.54), not the full text. */
    extractedText?: string | null
}

export interface ProgramFilters {
    search: string
    degreeType: string
    universityId: string
    universityType?: "all" | "public" | "private"
    sortBy: "newest" | "name" | "credits"
    cohort?: string
}

export interface SyllabusInfo {
    sylid: number
    subjectCode: string
    syllabusName: string
    syllabusEnglish?: string | null
    credits: string | number
    degreeLevel?: string | null
    timeAllocation?: string | null
    prerequisite?: string | null
    description?: string | null
    studentTasks?: string | null
    scoringScale?: string | null
    decisionNo?: string | null
    isApproved?: number | boolean | null
    note?: string | null
    minAvgToPass?: string | number | null
    isActive?: number | boolean | null
    approvedDate?: string | null
    /** FPT only: when the source mirror last saw the syllabus (ISO); shown as the collection date (v2.56). */
    lastSeenAt?: string | null
}

export interface SyllabusClo {
    id: number
    sylid?: number
    loSeq?: string | number
    cloName: string
    loDetails: string
}

export interface SyllabusAssessment {
    id: number
    sylid?: number
    category: string
    type: string
    part?: string | null
    weight: string
    completionCriteria: string
    duration?: string | null
    questionType?: string | null
    knowledgeSkill?: string | null
    gradinGuide?: string | null
}

/**
 * Not published (v2.56, no page reads them and they carry links to course files): sessions' downloadUrls,
 * urls, sDownload and studentMaterials, materials' note, info.tools and the top-level files list —
 * pinned by e2e/v256-attribution-and-unread-links.spec.ts.
 */
export interface SyllabusSession {
    id: number
    sylid?: number
    sessionNo: string | number
    topic: string
    learningTeachingType: string
    studentTasks?: string | null
}

export interface SyllabusMaterial {
    id: number
    sylid?: number
    materialDescription: string
    author?: string | null
    publisher?: string | null
    isbn?: string | null
    url?: string | null
}

export interface SyllabusDetail {
    info: SyllabusInfo
    clos: SyllabusClo[]
    assessments: SyllabusAssessment[]
    sessions: SyllabusSession[]
    materials: SyllabusMaterial[]
}

export interface SubjectRoadmap {
    code: string
    subjectName?: string
    directPrereqs: string[]
    unlocks: string[]
    edges: [string, string][]
    names: Record<string, string>
}

export interface SubjectMaterialItem {
    id: number
    materialDescription: string
    author?: string | null
    publisher?: string | null
    isbn?: string | null
    url?: string | null
    isUrl?: boolean
    isCoursera?: boolean
}

export interface SubjectMaterialSummary {
    subjectCode: string
    subjectName: string
    subjectEnglish?: string | null
    credits: string | number
    decisionNo?: string | null
    hasCoursera: boolean
    materialsCount: number
    materials: SubjectMaterialItem[]
}

// ---------------------------------------------------------------------------
// Admission data snapshot (SPEC-ADMISSION-DATA §3)
// Per-university file: /mock/admissions/<UNI>.json where <UNI> = universities.code
// ---------------------------------------------------------------------------

export type AdmissionScope = "program" | "group" | "school" | "campus" | string
export type AdmissionScoreKind = "cutoff" | "floor" | "converted" | string
export type TuitionBasis = "per_credit" | "per_semester" | "per_year" | "per_program" | string

export interface AdmissionScore {
    programId: string | null
    year: number
    method: string
    methodLabel: string | null
    scope: AdmissionScope
    scopeLabel: string | null
    score: number
    scale: number
    kind: AdmissionScoreKind
    comboNote: string | null
    sourceUrl: string | null
    publishedAt: string | null
    fetchedAt: string | null
}

export interface AdmissionQuota {
    programId: string | null
    year: number
    scope: AdmissionScope
    scopeLabel: string | null
    quota: number
    /** Any JSON as published (descriptions, codes, combos, a whole string, numbers): read only through quotaMethodSplitText (v2.67). */
    methodSplit: unknown
    sourceUrl: string | null
    publishedAt: string | null
    fetchedAt?: string | null
}

export interface TuitionRecord {
    programId: string | null
    academicYear: string | null
    amount: number | null
    minAmount: number | null
    maxAmount: number | null
    currency: string
    basis: TuitionBasis
    appliesTo: string | null
    notes: string | null
    sourceUrl: string | null
    publishedAt: string | null
    fetchedAt?: string | null
}

export interface AdmissionCoverage {
    matchedPrograms: number
    unmatched: number
    dataTypes: string[]
}

export interface AdmissionData {
    university: string
    generatedAt: string
    years: number[]
    scores: AdmissionScore[]
    quotas: AdmissionQuota[]
    tuitions: TuitionRecord[]
    coverage: AdmissionCoverage
}
