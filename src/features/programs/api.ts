import { Curriculum, Program, ProgramsResponse, University, PagedResult, RawDocument } from "./types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api"
const isProduction = process.env.NODE_ENV === "production"
const USE_MOCK = isProduction
    ? process.env.NEXT_PUBLIC_USE_MOCK === "true"
    : process.env.NEXT_PUBLIC_USE_MOCK !== "false"

// Mock data caches
let mockUniversitiesCache: University[] | null = null
let mockDegreeTypesCache: string[] | null = null
let mockProgramsIndexCache: { totalCount: number; pageSize: number; totalPages: number; chunks: string[] } | null = null
const mockProgramChunksCache = new Map<string, Program[]>()
const mockProgramByIdCache = new Map<string, Program>()
const mockCurriculaCache = new Map<string, Curriculum[]>()
const mockRawDocumentsCache = new Map<string, RawDocument[]>()

async function loadMockIndex() {
    if (mockProgramsIndexCache) return mockProgramsIndexCache
    const res = await fetch("/mock/index.json")
    if (!res.ok) throw new Error(`Failed to load mock index: ${res.status}`)
    const data = await res.json()
    const totalPages = data.totalPages || Math.ceil((data.totalCount || 1093) / (data.pageSize || 20))
    const chunks = data.chunks || Array.from({ length: totalPages }, (_, i) => `page-${i + 1}.json`)
    mockProgramsIndexCache = {
        totalCount: data.totalCount || 1093,
        pageSize: data.pageSize || 20,
        totalPages,
        chunks
    }
    return mockProgramsIndexCache!
}

async function loadMockProgramsChunk(chunkNumber: number): Promise<Program[]> {
    const index = await loadMockIndex()
    const chunkSize = index.pageSize
    const cacheKey = `${chunkNumber}-${chunkSize}`

    if (mockProgramChunksCache.has(cacheKey)) {
        return mockProgramChunksCache.get(cacheKey)!
    }

    const chunkFile = (index.chunks && index.chunks[chunkNumber - 1]) || `page-${chunkNumber}.json`
    if (!chunkFile) return []

    const res = await fetch(`/mock/programs/${chunkFile}`)
    if (!res.ok) throw new Error(`Failed to load mock programs chunk ${chunkFile}: ${res.status}`)
    const resData = await res.json()
    const items: Program[] = Array.isArray(resData) ? resData : (resData.items || [])
    mockProgramChunksCache.set(cacheKey, items)
    return items
}

async function loadMockProgramById(id: string): Promise<Program | null> {
    if (mockProgramByIdCache.has(id)) return mockProgramByIdCache.get(id)!
    const res = await fetch(`/mock/programs-by-id/${id}.json`)
    if (!res.ok) {
        if (res.status === 404) return null
        throw new Error(`Failed to load mock program ${id}: ${res.status}`)
    }
    const item: Program = await res.json()
    mockProgramByIdCache.set(id, item)
    return item
}

async function loadMockUniversities(): Promise<University[]> {
    if (mockUniversitiesCache) return mockUniversitiesCache
    const res = await fetch("/mock/universities.json")
    if (!res.ok) throw new Error(`Failed to load mock universities: ${res.status}`)
    const data: University[] = await res.json()
    if (!Array.isArray(data)) {
        throw new Error("Invalid mock universities response")
    }
    mockUniversitiesCache = data
    return data
}

async function loadMockDegreeTypes(): Promise<string[]> {
    if (mockDegreeTypesCache) return mockDegreeTypesCache
    const res = await fetch("/mock/degree-types.json")
    if (!res.ok) throw new Error(`Failed to load mock degree types: ${res.status}`)
    const data: string[] = await res.json()
    if (!Array.isArray(data)) {
        throw new Error("Invalid mock degree types response")
    }
    mockDegreeTypesCache = data
    return data
}

async function loadMockCurricula(programId: string): Promise<Curriculum[]> {
    if (mockCurriculaCache.has(programId)) return mockCurriculaCache.get(programId)!
    const res = await fetch(`/mock/curricula/${programId}.json`)
    if (!res.ok) {
        if (res.status === 404) {
            mockCurriculaCache.set(programId, [])
            return []
        }
        throw new Error(`Failed to load mock curricula for ${programId}: ${res.status}`)
    }
    const data: Curriculum[] = await res.json()
    if (!Array.isArray(data)) {
        throw new Error(`Invalid mock curricula response for ${programId}`)
    }
    mockCurriculaCache.set(programId, data)
    return data
}

async function loadMockRawDocuments(programId: string): Promise<RawDocument[]> {
    if (mockRawDocumentsCache.has(programId)) return mockRawDocumentsCache.get(programId)!
    const res = await fetch(`/mock/raw-documents/${programId}.json`)
    if (!res.ok) {
        if (res.status === 404) {
            mockRawDocumentsCache.set(programId, [])
            return []
        }
        throw new Error(`Failed to load mock raw documents for ${programId}: ${res.status}`)
    }
    const data: RawDocument[] = await res.json()
    if (!Array.isArray(data)) {
        throw new Error(`Invalid mock raw documents response for ${programId}`)
    }
    mockRawDocumentsCache.set(programId, data)
    return data
}

async function loadAllMockPrograms(): Promise<Program[]> {
    const index = await loadMockIndex()
    const chunks: Program[][] = await Promise.all(
        index.chunks.map((_, i) => loadMockProgramsChunk(i + 1))
    )
    return chunks.flat()
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
                (p.code?.toLowerCase().includes(search) ?? false) ||
                p.universityName.toLowerCase().includes(search)
        )
    }

    if (params?.degreeType) {
        result = result.filter((p) => p.degreeType === params.degreeType)
    }

    if (params?.universityId) {
        result = result.filter((p) => p.universityId === params.universityId)
    }

    if (params?.universityType && params.universityType !== "all") {
        const isPublic = params.universityType === "public"
        result = result.filter((p) => p.universityIsPublic === isPublic)
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
    universityType?: string
    sortBy?: string
    sortDesc?: boolean
}): Promise<ProgramsResponse> {
    if (USE_MOCK) {
        const needsAll = !!(
            params?.search ||
            params?.degreeType ||
            params?.universityId ||
            (params?.universityType && params.universityType !== "all")
        )

        if (!needsAll) {
            // Simple pagination/sort: load only the chunk(s) covering the requested page
            const page = params?.page ?? 1
            const pageSize = params?.pageSize ?? 20
            const index = await loadMockIndex()
            const chunkSize = index.pageSize
            const startOffset = (page - 1) * pageSize
            const endOffset = startOffset + pageSize

            const startChunk = Math.floor(startOffset / chunkSize)
            const endChunk = Math.floor((endOffset - 1) / chunkSize)

            const chunks: Program[][] = []
            for (let i = startChunk; i <= endChunk; i++) {
                chunks.push(await loadMockProgramsChunk(i + 1))
            }

            const allItems = chunks.flat()
            const sliceStart = startOffset - startChunk * chunkSize
            const sliceEnd = sliceStart + pageSize
            const items = allItems.slice(sliceStart, sliceEnd)

            // For totalCount we still need the index; if we don't know exact total, estimate
            const totalCount = index.totalCount
            const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
            const safePage = Math.min(Math.max(1, page), totalPages)

            return {
                items,
                totalCount,
                page: safePage,
                pageSize,
                totalPages,
                hasNextPage: safePage < totalPages,
                hasPreviousPage: safePage > 1,
            }
        }

        // Search/filter across all programs: load everything once
        const all = await loadAllMockPrograms()
        return applyFiltersAndSort(all, params)
    }

    const query = new URLSearchParams()

    if (params?.page) query.set("page", String(params.page))
    if (params?.pageSize) query.set("pageSize", String(params.pageSize))
    if (params?.search) query.set("search", params.search)
    if (params?.degreeType) query.set("degreeType", params.degreeType)
    if (params?.universityId) query.set("universityId", params.universityId)
    if (params?.universityType && params.universityType !== "all") {
        query.set("isPublic", params.universityType === "public" ? "true" : "false")
    }

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

export async function fetchUniversities(): Promise<University[]> {
    if (USE_MOCK) {
        return loadMockUniversities()
    }

    const res = await fetch(`${API_BASE_URL}/universities`)
    if (!res.ok) {
        throw new Error(`Failed to fetch universities: ${res.status}`)
    }
    const data: PagedResult<University> | University[] = await res.json()
    const items = Array.isArray(data) ? data : data.items
    return items
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

export async function fetchProgramById(id: string): Promise<Program | null> {
    if (USE_MOCK) {
        return loadMockProgramById(id)
    }

    const res = await fetch(`${API_BASE_URL}/programs/${id}`)
    if (!res.ok) {
        if (res.status === 404) return null
        throw new Error(`Failed to fetch program ${id}: ${res.status}`)
    }
    return res.json()
}

export async function fetchCurricula(programId: string): Promise<Curriculum[]> {
    if (USE_MOCK) {
        const courses = await loadMockCurricula(programId)
        return [...courses].sort((a, b) => a.courseName.localeCompare(b.courseName))
    }

    const res = await fetch(`${API_BASE_URL}/curricula/program/${programId}`)
    if (!res.ok) {
        throw new Error(`Failed to fetch curricula: ${res.status}`)
    }
    return res.json()
}

export async function fetchRawDocuments(programId: string): Promise<RawDocument[]> {
    if (USE_MOCK) {
        return loadMockRawDocuments(programId)
    }

    const res = await fetch(`${API_BASE_URL}/rawdocuments?programId=${programId}&pageSize=1000`)
    if (!res.ok) {
        throw new Error(`Failed to fetch raw documents: ${res.status}`)
    }
    const data: PagedResult<RawDocument> = await res.json()
    return data.items
}

export async function fetchRawDocumentText(documentId: string): Promise<string> {
    if (USE_MOCK) {
        for (const docs of mockRawDocumentsCache.values()) {
            const doc = docs.find((d) => d.id === documentId)
            if (doc) {
                if (doc.extractedText) {
                    return doc.extractedText
                }
                return "[Mock] Nội dung văn bản thô chưa được trích xuất cho tài liệu này."
            }
        }
        return "[Mock] Nội dung văn bản thô không có sẵn trong chế độ tĩnh (mock)."
    }

    const res = await fetch(`${API_BASE_URL}/rawdocuments/${documentId}/text`)
    if (!res.ok) {
        throw new Error(`Failed to fetch raw document text: ${res.status}`)
    }
    return res.text()
}
