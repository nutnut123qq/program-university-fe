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
    evaluationScore?: number
    evalOutcomes?: number
    evalStructure?: number
    evalKnowledgeBlocks?: number
    evalCompleteness?: number
    dataSufficiency?: string | null
    electiveGroups?: ElectiveGroup[]
}

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
    storagePath: string
    fileSize: number
    textPath: string | null
    contentHash: string | null
    extractedTextLength: number | null
    status: string
    errorMessage: string | null
    crawledAt: string
    createdAt: string
    updatedAt: string
    extractedText?: string | null
}

export interface ProgramFilters {
    search: string
    degreeType: string
    universityId: string
    universityType: "all" | "public" | "private"
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
    tools?: string | null
    scoringScale?: string | null
    decisionNo?: string | null
    isApproved?: number | boolean | null
    note?: string | null
    minAvgToPass?: string | number | null
    isActive?: number | boolean | null
    approvedDate?: string | null
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

export interface SyllabusSession {
    id: number
    sylid?: number
    sessionNo: string | number
    topic: string
    learningTeachingType: string
    studentMaterials?: string | null
    studentTasks?: string | null
    urls?: string | null
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
    files?: unknown[]
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
    methodSplit: Record<string, number> | null
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
