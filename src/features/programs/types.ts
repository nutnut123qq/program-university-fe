export interface Program {
    id: string
    universityId: string
    universityName: string
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
    isActive: boolean
    createdAt: string
    updatedAt: string
    courseCount: number
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

export interface ProgramsResponse extends PagedResult<Program> {}

export interface ProgramFilters {
    search: string
    degreeType: string
    universityId: string
    sortBy: "newest" | "name" | "credits"
}
