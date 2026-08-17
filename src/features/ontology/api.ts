import { OntologyStats, TaxonomyTree, UniversalPrerequisiteEdge, TopSubject, ProgramSimilarityResult } from "./types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5100/api"
const isProduction = process.env.NODE_ENV === "production"
const USE_MOCK = isProduction
    ? process.env.NEXT_PUBLIC_USE_MOCK === "true"
    : process.env.NEXT_PUBLIC_USE_MOCK !== "false"

// In-memory mock caches
let mockStatsCache: OntologyStats | null = null
let mockTaxonomyCache: TaxonomyTree | null = null
let mockPrerequisitesCache: UniversalPrerequisiteEdge[] | null = null
let mockTopSubjectsCache: TopSubject[] | null = null

export async function getOntologyStats(): Promise<OntologyStats> {
    if (!USE_MOCK) {
        try {
            const res = await fetch(`${API_BASE_URL}/ontology/stats`)
            if (res.ok) return await res.json()
        } catch {
            // Fallback to mock
        }
    }

    if (mockStatsCache) return mockStatsCache
    const res = await fetch("/mock/ontology/stats.json")
    if (!res.ok) throw new Error(`Failed to load ontology stats: ${res.status}`)
    mockStatsCache = await res.json()
    return mockStatsCache!
}

export async function getTaxonomyTree(): Promise<TaxonomyTree> {
    if (!USE_MOCK) {
        try {
            // Can query backend or fallback
        } catch {
            // Fallback to mock
        }
    }

    if (mockTaxonomyCache) return mockTaxonomyCache
    const res = await fetch("/mock/ontology/taxonomy-tree.json")
    if (!res.ok) throw new Error(`Failed to load taxonomy tree: ${res.status}`)
    mockTaxonomyCache = await res.json()
    return mockTaxonomyCache!
}

export async function getUniversalPrerequisites(): Promise<UniversalPrerequisiteEdge[]> {
    if (mockPrerequisitesCache) return mockPrerequisitesCache
    const res = await fetch("/mock/ontology/universal-prerequisites.json")
    if (!res.ok) throw new Error(`Failed to load universal prerequisites: ${res.status}`)
    mockPrerequisitesCache = await res.json()
    return mockPrerequisitesCache!
}

export async function getTopStandardSubjects(): Promise<TopSubject[]> {
    if (mockTopSubjectsCache) return mockTopSubjectsCache
    const res = await fetch("/mock/ontology/subjects-top.json")
    if (!res.ok) throw new Error(`Failed to load top subjects: ${res.status}`)
    mockTopSubjectsCache = await res.json()
    return mockTopSubjectsCache!
}

export async function getProgramSimilarity(programId1: string, programId2: string): Promise<ProgramSimilarityResult | null> {
    try {
        const res = await fetch(`${API_BASE_URL}/ontology/similarity?programId1=${programId1}&programId2=${programId2}`)
        if (res.ok) return await res.json()
    } catch {
        // Fallback or handle offline
    }
    return null
}
