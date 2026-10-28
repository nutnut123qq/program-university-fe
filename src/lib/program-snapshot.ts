/**
 * Server-side reads of the published snapshot (public/mock) for the program
 * page and the sitemap (v2.52). Same data the client reads in mock mode.
 */
import { readdir, readFile } from "fs/promises"
import path from "path"
import { cache } from "react"
import { isProgramId } from "@/features/programs/programId"
import type { Curriculum, Program } from "@/features/programs/types"

// One literal join per path: a shared `public/mock` base makes the file tracer
// ship all of public/mock with the route (12,442 files, chat-retrieval's warning).
const BY_ID_DIR = path.join(process.cwd(), "public", "mock", "programs-by-id")
const CURRICULA_DIR = path.join(process.cwd(), "public", "mock", "curricula")
const INDEX_FILE = path.join(process.cwd(), "public", "mock", "index.json")

const readJson = async <T>(file: string): Promise<T | null> => {
    try {
        return JSON.parse(await readFile(file, "utf8")) as T
    } catch {
        return null
    }
}

/** The snapshot program with this id, or null. `id` is a URL segment: checked before any path is built. */
export const loadProgram = cache(async (id: string): Promise<Program | null> => {
    if (!isProgramId(id)) return null
    const program = await readJson<Program>(path.join(BY_ID_DIR, `${id}.json`))
    // Exact match: no second URL (other letter case) for the same program.
    return program?.id === id ? program : null
})

/** Course list of a program already loaded by `loadProgram`; [] when the snapshot has none. */
export async function loadCourses(id: string): Promise<Curriculum[]> {
    if (!isProgramId(id)) return []
    const rows = await readJson<unknown>(path.join(CURRICULA_DIR, `${id}.json`))
    return Array.isArray(rows) ? (rows as Curriculum[]) : []
}

/** `generatedAt` of the snapshot (index.json), or null. */
export async function snapshotGeneratedAt(): Promise<string | null> {
    const index = await readJson<{ generatedAt?: string }>(INDEX_FILE)
    return index?.generatedAt ?? null
}

/** Every program id that has a snapshot file, sorted. */
export async function listProgramIds(): Promise<string[]> {
    const files = await readdir(BY_ID_DIR)
    return files
        .filter((f) => f.endsWith(".json") && isProgramId(f.slice(0, -5)))
        .map((f) => f.slice(0, -5))
        .sort()
}

/** DD/MM/YYYY from the date part of an ISO timestamp (no time-zone shift on the server). */
export function isoDate(value: string | null | undefined): string | null {
    const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}
