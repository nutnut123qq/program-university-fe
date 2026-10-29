import { test, expect } from "@playwright/test"
import { readdirSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.54 — data policy of the published snapshot (M4 data, M5 data, M7).
 *
 * - is_public: FPT, Duy Tân (DTU) and HUTECH are private (sources:
 *   docs/_coord/round89/is_public_sources.md); every program row copies its
 *   university's isPublic. The public/private filter is back and its counts
 *   equal the snapshot's counts.
 * - Raw documents carry an excerpt, not the full text: extractedText is at most
 *   RAW_TEXT_EXCERPT characters cut at a word boundary + "…".
 * - Implausible credits/duration are published as null: the bounds below are
 *   the ones crawler/scripts/export_mock_programs_sync.py applies (CREDIT_BOUNDS /
 *   DURATION_BOUNDS, measured per degree type in docs/_coord/round89/D_report.md).
 * - search-index.json agrees with the chunks for every indexed field.
 *
 * Expected values are computed from public/mock at test time; nothing named is
 * pinned except the three private universities.
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const vi = readJson(path.join(ROOT, "src", "messages", "vi.json"))

const PRIVATE_CODES = ["DTU", "FPT", "HUTECH"]
const RAW_TEXT_EXCERPT = 300
// Same tables as the exporter: [min, max], inclusive; other degree types use DEFAULT.
const CREDIT_BOUNDS: Record<string, [number, number]> = { "Cử nhân": [90, 250], "Kỹ sư": [90, 250], "Thạc sĩ": [30, 250] }
const DEFAULT_CREDIT_BOUNDS: [number, number] = [1, 250]
const DURATION_BOUNDS: Record<string, [number, number]> = { "Cử nhân": [2, 7], "Kỹ sư": [3, 7], "Thạc sĩ": [1, 6] }
const DEFAULT_DURATION_BOUNDS: [number, number] = [1, 8]

type Uni = { id: string; code: string; name: string; isPublic: boolean }
type Row = Record<string, unknown> & {
    id: string
    universityId: string
    universityIsPublic: boolean
    degreeType: string | null
    credits: number | null
    duration: string | null
}

const universities: Uni[] = readJson(path.join(MOCK, "universities.json"))
const index = readJson(path.join(MOCK, "index.json"))
const programs: Row[] = (index.chunks as string[]).flatMap((f) => readJson(path.join(MOCK, "programs", f)))
const uniById = new Map(universities.map((u) => [u.id, u]))
const countOf = (isPublic: boolean) => programs.filter((p) => uniById.get(p.universityId)?.isPublic === isPublic).length
const group = (n: number, sep: string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep)

// Years in a duration such as "4 năm", "3-4 năm", "4,5 năm"; null when it is not in years.
const years = (d: string): number[] | null =>
    /năm/i.test(d) ? (d.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", "."))) : null
const within = (v: number, [lo, hi]: [number, number]) => v >= lo && v <= hi

test.describe("v2.54 — data policy of the snapshot", () => {
    test("FPT, DTU and HUTECH are private; every program row copies its university's isPublic", () => {
        const byCode = new Map(universities.map((u) => [u.code, u]))
        for (const code of PRIVATE_CODES) expect(byCode.get(code)?.isPublic, code).toBe(false)
        expect(countOf(false)).toBeGreaterThan(0)
        expect(countOf(true)).toBeGreaterThan(0)
        expect(countOf(true) + countOf(false)).toBe(programs.length)
        const byIdDir = path.join(MOCK, "programs-by-id")
        const wrong = programs.filter((p) => {
            const isPublic = uniById.get(p.universityId)?.isPublic
            return p.universityIsPublic !== isPublic || readJson(path.join(byIdDir, `${p.id}.json`)).universityIsPublic !== isPublic
        })
        expect(wrong.map((p) => p.id)).toEqual([])
    })

    test("raw documents publish an excerpt, never the full text", () => {
        const dir = path.join(MOCK, "raw-documents")
        let docs = 0
        let cut = 0
        const tooLong: string[] = []
        for (const f of readdirSync(dir)) {
            for (const d of readJson(path.join(dir, f)) as { id: string; extractedText?: string | null }[]) {
                docs++
                const t = d.extractedText
                if (typeof t !== "string") continue
                if (t.length > (t.endsWith("…") ? RAW_TEXT_EXCERPT + 1 : RAW_TEXT_EXCERPT)) tooLong.push(d.id)
                if (t.endsWith("…")) cut++
            }
        }
        expect(docs).toBeGreaterThan(0)
        expect(cut).toBeGreaterThan(0) // the snapshot does hold long documents, so the cut is exercised
        expect(tooLong).toEqual([])
    })

    test("no program publishes credits or duration outside the bounds of its degree type", () => {
        const byIdDir = path.join(MOCK, "programs-by-id")
        const bad: string[] = []
        for (const p of programs) {
            for (const row of [p, readJson(path.join(byIdDir, `${p.id}.json`)) as Row]) {
                const deg = row.degreeType ?? ""
                if (typeof row.credits === "number" && !within(row.credits, CREDIT_BOUNDS[deg] ?? DEFAULT_CREDIT_BOUNDS))
                    bad.push(`${p.id} credits ${row.credits}`)
                const y = typeof row.duration === "string" ? years(row.duration) : null
                if (y && y.some((v) => !within(v, DURATION_BOUNDS[deg] ?? DEFAULT_DURATION_BOUNDS)))
                    bad.push(`${p.id} duration ${row.duration}`)
            }
        }
        expect(bad).toEqual([])
    })

    test("search-index.json agrees with the chunks", () => {
        const { fields, values, rows } = readJson(path.join(MOCK, "search-index.json")) as {
            fields: string[]
            values: Record<string, unknown[]>
            rows: unknown[][]
        }
        expect(rows).toHaveLength(programs.length)
        const mismatches: string[] = []
        rows.forEach((row, i) => {
            fields.forEach((f, j) => {
                const v = values[f] ? values[f][row[j] as number] : row[j]
                const want = programs[i][f] ?? null
                // the description is stored cut for the card (build-search-index.mjs)
                if (f === "description" && typeof v === "string" && typeof want === "string") {
                    if (!(v === want || (v.endsWith("…") && want.startsWith(v.slice(0, -1))))) mismatches.push(`${i}.${f}`)
                } else if (v !== want) mismatches.push(`${i}.${f}`)
            })
        })
        expect(mismatches).toEqual([])
    })

    test("public/private filter counts equal the snapshot", async ({ page }) => {
        await page.goto("/vi", { waitUntil: "domcontentloaded" })
        await expect(page.getByRole("button", { name: /Xem chi tiết/i }).first()).toBeVisible({ timeout: 30000 })
        const typeSelect = page.getByRole("combobox", { name: vi.programs.allUniversityTypes })
        const shown = page.locator("text=/Hiển thị/i").first()
        const uniOptions = async () => {
            await page.getByRole("combobox", { name: vi.programs.allUniversities }).click()
            const names = await page.getByRole("listbox").getByRole("option").allTextContents()
            await page.keyboard.press("Escape")
            return names.map((n) => n.trim())
        }

        for (const [label, isPublic] of [
            [vi.programs.privateUniversity, false],
            [vi.programs.publicUniversity, true],
        ] as const) {
            await typeSelect.click()
            await page.getByRole("listbox").getByRole("option", { name: label, exact: true }).click()
            const n = countOf(isPublic)
            await expect(shown).toContainText(new RegExp(`/\\s*(${n}|${group(n, ".")})\\s`), { timeout: 20000 })
            const expectedUnis = universities.filter((u) => u.isPublic === isPublic).map((u) => u.name)
            expect((await uniOptions()).filter((o) => o !== vi.programs.allUniversities).sort()).toEqual(expectedUnis.sort())
        }

        await typeSelect.click()
        await page.getByRole("listbox").getByRole("option", { name: vi.programs.allUniversityTypes, exact: true }).click()
        await expect(shown).toContainText(new RegExp(`/\\s*(${programs.length}|${group(programs.length, ".")})\\s`), {
            timeout: 20000,
        })
    })
})
