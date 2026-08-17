export interface OntologyStats {
    totalNodes: number
    totalEdges: number
    nodesByType: Record<string, number>
    edgesByPredicate: Record<string, number>
    summary: {
        universitiesCount: number
        programsCount: number
        curriculaCount: number
        standardSubjectsCount: number
        academicFieldsCount: number
        knowledgeBlocksCount: number
        competenciesCount: number
        occupationsCount: number
        universalPrerequisitesCount: number
        isDagVerified: boolean
        cyclesCount: number
    }
}

export interface TaxonomyNode {
    id: string
    name: string
    nameEn?: string | null
    level: number
    iscedCode?: string | null
    programCount?: number
    courseCount?: number
    children: TaxonomyNode[]
}

export interface TaxonomyTree {
    academicFields: TaxonomyNode[]
    knowledgeBlocks: TaxonomyNode[]
}

export interface UniversalPrerequisiteEdge {
    sourceId: string
    subjectName: string
    targetId: string
    prerequisiteName: string
    agreementCount: number
    confidence: number
}

export interface TopSubject {
    id: string
    name: string
    courseCount: number
    universityCount: number
    avgCredits?: number | null
    variants: string[]
}

export interface ProgramSimilarityResult {
    program1: {
        id: string
        name: string
        university: string
        totalCredits: number
        subjectCount: number
    }
    program2: {
        id: string
        name: string
        university: string
        totalCredits: number
        subjectCount: number
    }
    jaccardSimilarity: number
    matchPercentage: number
    sharedSubjectCount: number
    potentialTransferCredits: number
    sharedSubjects: Array<{
        id: string
        canonicalName: string
        credits: number
    }>
    onlyInProgram1: Array<{
        id: string
        canonicalName: string
    }>
    onlyInProgram2: Array<{
        id: string
        canonicalName: string
    }>
}
