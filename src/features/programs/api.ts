import { Curriculum, Program, ProgramsResponse } from "./types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api"
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true"

let mockProgramsCache: Program[] | null = null
let mockDegreeTypesCache: string[] | null = null
let mockCurriculaCache: Curriculum[] | null = null

async function loadMockPrograms(): Promise<Program[]> {
    if (mockProgramsCache) return mockProgramsCache
    const res = await fetch("/mock/programs.json")
    if (!res.ok) throw new Error("Failed to load mock programs")
    const data: ProgramsResponse = await res.json()
    mockProgramsCache = data.items
    return data.items
}

async function loadMockDegreeTypes(): Promise<string[]> {
    if (mockDegreeTypesCache) return mockDegreeTypesCache
    const res = await fetch("/mock/degree-types.json")
    if (!res.ok) throw new Error("Failed to load mock degree types")
    const data: string[] = await res.json()
    mockDegreeTypesCache = data
    return data
}

async function loadMockCurricula(): Promise<Curriculum[]> {
    if (mockCurriculaCache) return mockCurriculaCache
    const res = await fetch("/mock/curricula.json")
    if (!res.ok) throw new Error("Failed to load mock curricula")
    const data: Curriculum[] = await res.json()
    mockCurriculaCache = data
    return data
}

function applyFiltersAndSort(
    items: Program[],
    params?: Parameters<typeof fetchPrograms>[0]
): ProgramsResponse {
    let result = [...items]

    if (params?.search) {
        const search = params.search.toLowerCase()
        result = result.filter(
            (p) =>
                p.name.toLowerCase().includes(search) ||
                (p.code?.toLowerCase().includes(search) ?? false)
        )
    }

    if (params?.degreeType) {
        result = result.filter((p) => p.degreeType === params.degreeType)
    }

    if (params?.universityId) {
        result = result.filter((p) => p.universityId === params.universityId)
    }

    const sortBy = params?.sortBy?.toLowerCase()
    const sortDesc = params?.sortDesc ?? false

    result.sort((a, b) => {
        switch (sortBy) {
            case "name":
                return sortDesc
                    ? b.name.localeCompare(a.name)
                    : a.name.localeCompare(b.name)
            case "credits":
                return sortDesc
                    ? (b.credits ?? 0) - (a.credits ?? 0)
                    : (a.credits ?? 0) - (b.credits ?? 0)
            case "createdat":
                return sortDesc
                    ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            default:
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        }
    })

    const page = params?.page ?? 1
    const pageSize = params?.pageSize ?? 20
    const totalCount = result.length
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
    const safePage = Math.min(Math.max(1, page), totalPages)
    const pagedItems = result.slice((safePage - 1) * pageSize, safePage * pageSize)

    return {
        items: pagedItems,
        totalCount,
        page: safePage,
        pageSize,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > 1,
    }
}

export async function fetchPrograms(params?: {
    page?: number
    pageSize?: number
    search?: string
    degreeType?: string
    universityId?: string
    sortBy?: string
    sortDesc?: boolean
}): Promise<ProgramsResponse> {
    if (USE_MOCK) {
        const all = await loadMockPrograms()
        return applyFiltersAndSort(all, params)
    }

    const query = new URLSearchParams()

    if (params?.page) query.set("page", String(params.page))
    if (params?.pageSize) query.set("pageSize", String(params.pageSize))
    if (params?.search) query.set("search", params.search)
    if (params?.degreeType) query.set("degreeType", params.degreeType)
    if (params?.universityId) query.set("universityId", params.universityId)

    if (params?.sortBy) {
        query.set("sortBy", params.sortBy)
        query.set("sortDesc", String(params.sortDesc ?? false))
    }

    const url = `${API_BASE_URL}/programs?${query.toString()}`
    const res = await fetch(url)

    if (!res.ok) {
        throw new Error(`Failed to fetch programs: ${res.status} ${res.statusText}`)
    }

    return res.json()
}

export async function fetchDegreeTypes(): Promise<string[]> {
    if (USE_MOCK) {
        return loadMockDegreeTypes()
    }

    const res = await fetch(`${API_BASE_URL}/programs/degree-types`)
    if (!res.ok) {
        throw new Error(`Failed to fetch degree types: ${res.status}`)
    }
    return res.json()
}

export async function fetchCurricula(programId: string): Promise<Curriculum[]> {
    if (USE_MOCK) {
        const all = await loadMockCurricula()
        return all
            .filter((c) => c.programId === programId)
            .sort((a, b) => a.courseName.localeCompare(b.courseName))
    }

    const res = await fetch(`${API_BASE_URL}/curricula/program/${programId}`)
    if (!res.ok) {
        throw new Error(`Failed to fetch curricula: ${res.status}`)
    }
    return res.json()
}
