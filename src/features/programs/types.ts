export interface University {
    id: string
    name: string
    isPublic: boolean
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
