import {
    AdmissionData,
    Curriculum,
    Program,
    ProgramSummary,
    ProgramsResponse,
    University,
    PagedResult,
    RawDocument,
    SyllabusDetail,
    SubjectRoadmap,
    SubjectMaterialSummary,
} from "./types"
import { isProgramId } from "./programLink"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5100/api"
// The API's ProgramFilterDto.PageSize is [Range(1, 1000)]: a larger ask is served page by page.
const API_MAX_PAGE_SIZE = 1000
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
const mockSyllabusesCache = new Map<string, SyllabusDetail | null>()
const mockRoadmapsCache = new Map<string, SubjectRoadmap | null>()
const mockAdmissionsCache = new Map<string, AdmissionData | null>()
// One shared promise: every keystroke of a first search waits on the same request.
let mockSearchIndexPromise: Promise<ProgramSummary[]> | null = null

async function loadMockIndex() {
    if (mockProgramsIndexCache) return mockProgramsIndexCache
    const res = await fetch("/mock/index.json")
    if (!res.ok) throw new Error(`Failed to load mock index: ${res.status}`)
    const data = await res.json()
    const totalPages = data.totalPages || Math.ceil((data.totalCount || 0) / (data.pageSize || 20))
    const chunks = data.chunks || Array.from({ length: totalPages }, (_, i) => `page-${i + 1}.json`)
    mockProgramsIndexCache = {
        totalCount: data.totalCount || 0,
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
    // Ids can come straight from a URL (?a=/b=/c=): encode so "/", "?", "#"
    // stay inside this one path segment instead of reaching another file.
    const res = await fetch(`/mock/programs-by-id/${encodeURIComponent(id)}.json`)
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

// Compact list index (v2.50, scripts/build-search-index.mjs): one row per program in
// chunk order with only the fields the list reads; `values[field]` decodes the
// dictionary-coded columns. ~0.9 MB in one request instead of every chunk.
function loadMockSearchIndex(): Promise<ProgramSummary[]> {
    mockSearchIndexPromise ??= fetch("/mock/search-index.json")
        .then(async (res) => {
            if (!res.ok) throw new Error(`Failed to load mock search index: ${res.status}`)
            const { fields, values, rows }: { fields: string[]; values: Record<string, unknown[]>; rows: unknown[][] } =
                await res.json()
            return rows.map(
                (row) =>
                    Object.fromEntries(
                        fields.map((f, i) => [f, values[f] ? values[f][row[i] as number] : row[i]])
                    ) as ProgramSummary
            )
        })
        .catch((e) => {
            mockSearchIndexPromise = null // the next search retries
            throw e
        })
    return mockSearchIndexPromise
}

async function loadAllMockPrograms(): Promise<Program[]> {
    const index = await loadMockIndex()
    const chunks: Program[][] = await Promise.all(
        index.chunks.map((_, i) => loadMockProgramsChunk(i + 1))
    )
    return chunks.flat()
}

function applyFiltersAndSort<T extends ProgramSummary>(
    items: T[],
    params?: FetchProgramsParams
): PagedResult<T> {
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

    if (params?.cohort && params.cohort !== "all") {
        const c = params.cohort.toLowerCase()
        result = result.filter(
            (p) =>
                (p.code && p.code.toLowerCase().includes(c)) ||
                p.name.toLowerCase().includes(c)
        )
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

type FetchProgramsParams = {
    page?: number
    pageSize?: number
    search?: string
    degreeType?: string
    universityId?: string
    cohort?: string
    sortBy?: string
    sortDesc?: boolean
}

// A search or filter needs every program; plain paging reads only its chunk(s).
const needsAllPrograms = (params?: FetchProgramsParams) =>
    !!(
        params?.search ||
        params?.degreeType ||
        params?.universityId ||
        (params?.cohort && params.cohort !== "all")
    )

/** Index rows lack the detail fields; chunk, by-id and API programs carry them. */
export const isFullProgram = (p: ProgramSummary): p is Program => "learningOutcomes" in p

/**
 * The program list's fetcher (v2.50). In mock mode a search/filter runs the same
 * filter/sort over the compact search index instead of every chunk, so its items
 * are ProgramSummary rows; everything else (plain paging, API mode) is
 * fetchPrograms unchanged. The compare page keeps fetchPrograms: its search picks
 * feed its detail cards.
 */
export async function fetchProgramList(params?: FetchProgramsParams): Promise<PagedResult<ProgramSummary>> {
    if (USE_MOCK && needsAllPrograms(params)) return applyFiltersAndSort(await loadMockSearchIndex(), params)
    return fetchPrograms(params)
}

export async function fetchPrograms(params?: FetchProgramsParams): Promise<ProgramsResponse> {
    if (USE_MOCK) {
        if (!needsAllPrograms(params)) {
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

    const page = params?.page ?? 1
    const pageSize = params?.pageSize ?? 20
    if (pageSize <= API_MAX_PAGE_SIZE) return fetchApiPrograms(params)

    // The score-filter pool and the compare search ask for the whole catalog:
    // assemble the asked page from API pages of the largest allowed size.
    const start = (page - 1) * pageSize
    let apiPage = Math.floor(start / API_MAX_PAGE_SIZE) + 1
    const skip = start - (apiPage - 1) * API_MAX_PAGE_SIZE
    const rows: Program[] = []
    let totalCount = 0
    for (;;) {
        const res = await fetchApiPrograms({ ...params, page: apiPage, pageSize: API_MAX_PAGE_SIZE })
        totalCount = res.totalCount
        rows.push(...res.items)
        if (rows.length >= skip + pageSize || !res.hasNextPage || res.items.length === 0) break
        apiPage++
    }
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
    return {
        items: rows.slice(skip, skip + pageSize),
        totalCount,
        page,
        pageSize,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
    }
}

async function fetchApiPrograms(params?: FetchProgramsParams): Promise<ProgramsResponse> {
    const query = new URLSearchParams()

    if (params?.page) query.set("page", String(params.page))
    if (params?.pageSize) query.set("pageSize", String(params.pageSize))
    if (params?.search) query.set("search", params.search)
    if (params?.degreeType) query.set("degreeType", params.degreeType)
    if (params?.universityId) query.set("universityId", params.universityId)
    if (params?.cohort && params.cohort !== "all") query.set("cohort", params.cohort)
    // The catalog is the active programs (the mock export holds only those).
    query.set("isActive", "true")

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

    // Ids can come from a URL or localStorage: only a GUID may reach the API —
    // "." or "degree-types" would hit other routes (v2.43 cold-check).
    if (!isProgramId(id)) return null
    const res = await fetch(`${API_BASE_URL}/programs/${encodeURIComponent(id)}`)
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

    if (!isProgramId(programId)) return []
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

    if (!isProgramId(programId)) return []
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

    // Document ids are GUIDs too.
    if (!isProgramId(documentId)) throw new Error("Invalid raw document id")
    const res = await fetch(`${API_BASE_URL}/rawdocuments/${documentId}/text`)
    if (!res.ok) {
        throw new Error(`Failed to fetch raw document text: ${res.status}`)
    }
    return res.text()
}

/**
 * Resolve a university's short code (e.g. "FPT", "TDTU") from its id.
 * Syllabi are stored per university because course codes collide across schools.
 */
export async function fetchUniversityCode(universityId: string): Promise<string | null> {
    if (!universityId) return null
    try {
        const universities = (await fetchUniversities()) as Array<University & { code?: string | null }>
        return universities.find((u) => u.id === universityId)?.code || null
    } catch (e) {
        console.warn(`Could not resolve university code for ${universityId}:`, e)
        return null
    }
}

export async function fetchSyllabus(
    universityCode: string,
    subjectCode: string
): Promise<SyllabusDetail | null> {
    if (!universityCode || !subjectCode) return null
    const safeUni = universityCode.replace(/[^a-zA-Z0-9_\-]/g, "_")
    const safeCode = subjectCode.replace(/[^a-zA-Z0-9_\-]/g, "_")
    const cacheKey = `${safeUni}/${safeCode}`
    if (mockSyllabusesCache.has(cacheKey)) {
        return mockSyllabusesCache.get(cacheKey)!
    }

    try {
        const res = await fetch(`/mock/syllabuses/${safeUni}/${safeCode}.json`)
        if (res.ok) {
            const data: SyllabusDetail = await res.json()
            mockSyllabusesCache.set(cacheKey, data)
            return data
        }
    } catch (e) {
        console.warn(`Could not load syllabus for ${universityCode}/${subjectCode}:`, e)
    }

    mockSyllabusesCache.set(cacheKey, null)
    return null
}

export async function fetchRoadmap(
    universityCode: string,
    subjectCode: string
): Promise<SubjectRoadmap | null> {
    if (!universityCode || !subjectCode) return null
    const safeUni = universityCode.replace(/[^a-zA-Z0-9_\-]/g, "_")
    const safeCode = subjectCode.replace(/[^a-zA-Z0-9_\-]/g, "_")
    const cacheKey = `${safeUni}/${safeCode}`
    if (mockRoadmapsCache.has(cacheKey)) {
        return mockRoadmapsCache.get(cacheKey)!
    }

    try {
        const res = await fetch(`/mock/roadmaps/${safeUni}/${safeCode}.json`)
        if (res.ok) {
            const raw = await res.json()
            // Roadmap files differ per university crawl; normalize to SubjectRoadmap.
            // FPT files use `code`/`directPrereqs`/`edges`/`names`; TDTU/NEU/UIT use
            // `subjectCode`/`prerequisites` and carry extra info fields.
            const data: SubjectRoadmap = {
                ...raw,
                code: raw.code ?? raw.subjectCode ?? subjectCode,
                directPrereqs: raw.directPrereqs ?? raw.prerequisites ?? [],
                unlocks: raw.unlocks ?? [],
                edges: raw.edges ?? [],
                names: raw.names ?? {},
            }
            mockRoadmapsCache.set(cacheKey, data)
            return data
        }
    } catch (e) {
        console.warn(`Could not load roadmap for ${universityCode}/${subjectCode}:`, e)
    }

    mockRoadmapsCache.set(cacheKey, null)
    return null
}

const mockRoadmapsIndexCache = new Map<string, string[]>()
export async function fetchRoadmapsIndex(universityCode: string): Promise<string[]> {
    if (!universityCode) return []
    const safeUni = universityCode.replace(/[^a-zA-Z0-9_\-]/g, "_")
    const cached = mockRoadmapsIndexCache.get(safeUni)
    if (cached) return cached
    try {
        const res = await fetch(`/mock/roadmaps/${safeUni}/index.json`)
        if (res.ok) {
            const data = await res.json()
            if (Array.isArray(data)) {
                mockRoadmapsIndexCache.set(safeUni, data)
                return data
            }
        }
    } catch {
        // Fallback
    }
    return []
}

const mockMaterialsCache = new Map<string, SubjectMaterialSummary[]>()
export async function fetchMaterials(universityCode: string): Promise<SubjectMaterialSummary[]> {
    if (!universityCode) return []
    const safeUni = universityCode.replace(/[^a-zA-Z0-9_\-]/g, "_")
    const cached = mockMaterialsCache.get(safeUni)
    if (cached) return cached
    try {
        const res = await fetch(`/mock/materials/${safeUni}.json`)
        if (res.ok) {
            const data = await res.json()
            if (Array.isArray(data)) {
                mockMaterialsCache.set(safeUni, data)
                return data
            }
        }
    } catch (e) {
        console.warn(`Could not load materials for ${universityCode}:`, e)
    }
    return []
}

/**
 * Admission data snapshot per university (SPEC-ADMISSION-DATA §3).
 * Files live at /mock/admissions/<UNI>.json where <UNI> = universities.code.
 * A 404 / missing file resolves to null — it means "no admission data
 * published for this school", NOT an error. Other failures throw so SWR
 * can surface an error state.
 */
export async function fetchAdmissions(universityCode: string): Promise<AdmissionData | null> {
    if (!universityCode) return null
    const safeUni = universityCode.replace(/[^a-zA-Z0-9_\-]/g, "_")
    if (mockAdmissionsCache.has(safeUni)) {
        return mockAdmissionsCache.get(safeUni)!
    }
    const res = await fetch(`/mock/admissions/${safeUni}.json`)
    if (res.status === 404) {
        mockAdmissionsCache.set(safeUni, null)
        return null
    }
    if (!res.ok) {
        throw new Error(`Failed to load admissions for ${universityCode}: ${res.status}`)
    }
    const data: AdmissionData = await res.json()
    mockAdmissionsCache.set(safeUni, data)
    return data
}
