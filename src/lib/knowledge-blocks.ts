/**
 * Knowledge-block shares of a curriculum (v2.67, audit 2026-11-05 M14) — the one reader of the shares, used by the program
 * dialog's knowledge-block chart. The denominator is the credits of the listed courses that record a block, so the four
 * shares are each at most 100 % and sum to 100 % (± rounding: each share is rounded to a whole percent). Before v2.67 the
 * chart divided by the program's total credits, which the listed courses can exceed (electives, alternatives): UIT
 * "Khoa học Máy tính" showed "Chuyên ngành 161%". Courses with no block recorded are not counted as Chuyên ngành any more:
 * they are counted apart (`unclassified`) and left out of the shares.
 */
import type { Curriculum } from "@/features/programs/types"

export const KNOWLEDGE_BLOCKS = ["general", "foundation", "major", "graduation"] as const
export type KnowledgeBlockId = (typeof KNOWLEDGE_BLOCKS)[number]

/** A course's block from its stored text (data, in Vietnamese — not UI text); null when it records none. Any other text is "major", as before v2.67. */
export function knowledgeBlockOf(text: string | null | undefined): KnowledgeBlockId | null {
    const kb = (text || "").toLowerCase()
    if (!kb.trim()) return null
    if (kb.includes("đại cương")) return "general"
    if (kb.includes("cơ sở")) return "foundation"
    if (kb.includes("tốt nghiệp") || kb.includes("thực tập") || kb.includes("đồ án")) return "graduation"
    return "major"
}

/** `noCredits`: the courses whose credits are unknown (null) — their credits are not in `credits`. */
type Tally = { courses: number; credits: number; noCredits: number }

/**
 * Per block: courses, credits and the share (a whole percent) of `classifiedCredits`; `percent` is null when no listed
 * course with a block carries credits (nothing to divide by). A course without credits adds nothing to `credits` and is
 * counted in `noCredits`, so a caller never prints a credit total that silently stands for unknown credits.
 */
export function knowledgeBlockShares(courses: Pick<Curriculum, "knowledgeBlock" | "credits">[]) {
    const tally = Object.fromEntries(KNOWLEDGE_BLOCKS.map((id) => [id, { courses: 0, credits: 0, noCredits: 0 }])) as Record<KnowledgeBlockId, Tally>
    const unclassified: Tally = { courses: 0, credits: 0, noCredits: 0 }
    for (const c of courses) {
        const id = knowledgeBlockOf(c.knowledgeBlock)
        const t = id ? tally[id] : unclassified
        t.courses += 1
        if (c.credits == null) t.noCredits += 1
        else t.credits += c.credits
    }
    const classified: Tally = { courses: courses.length - unclassified.courses, credits: 0, noCredits: 0 }
    for (const id of KNOWLEDGE_BLOCKS) {
        classified.credits += tally[id].credits
        classified.noCredits += tally[id].noCredits
    }
    const blocks = KNOWLEDGE_BLOCKS.map((id) => ({
        id,
        ...tally[id],
        percent: classified.credits > 0 ? Math.round((tally[id].credits / classified.credits) * 100) : null,
    }))
    return { blocks, classified, unclassified }
}
