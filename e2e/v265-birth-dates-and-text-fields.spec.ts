import { test, expect } from "@playwright/test"
import { readdirSync, readFileSync, statSync } from "fs"
import path from "path"

/**
 * v2.65 — no birth dates or personal rosters in any published text (audit 2026-11-05 A1/C1, AGENTS.md §9).
 * The exporter (crawler/scripts/export_mock_programs_sync.py, cut_personal_data) cuts every free text before a
 * labelled birth date or a personal roster (a "Họ và tên" column with a birth-date / ID column). This spec checks
 * the published snapshot with a rule WIDER than the exporter's (any roster header, no length or value condition;
 * any birth label followed by a digit), on folded lines (NFC, format characters dropped, no diacritics, lower case).
 * The program opened in the UI is the audit's case, read from the snapshot by id: UEL `b3452043` published a staff
 * table with six birth dates in its "Chuẩn đầu ra (PLO)" text.
 * Every expectation is computed from public/mock and src/messages at test time; message keys are checked inside
 * the test that uses them. domcontentloaded, not networkidle (AGENTS.md §12).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const UEL_STAFF_TABLE = "b3452043-2b4f-40b2-8245-8cc5b972978c"

const fold = (s: string) =>
    s.normalize("NFC").replace(/\p{Cf}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D")
        .normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase()
const NAME_WORD = /\bho\s*(?:va|,|&)?\s*ten\b|\bfull\s*name\b/
const BIRTH_WORD = /\b(?:ngay|nam)\s*(?:,\s*)?(?:thang\s*(?:,\s*)?nam\s*)?sinh\b(?!\s*(?:nhat|vien))|\b(?:date|year) of birth\b|\b(?:cmnd|cccd)\b|\bcan\s*cuoc\b/
const BIRTH_LABEL = /(?:\b(?:ngay|nam)\s*(?:,\s*)?(?:thang\s*(?:,\s*)?nam\s*)?sinh|\b(?:date|year) of birth|\bd\.?o\.?b\b)\s*[:-]?\s*\d|\bsinh\s+ngay\s+\d/
const OLD_DATE = /(?<![\d/.-])\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*(?:19[2-9]\d|200\d|201[0-5])(?!\d)/

type Finding = { kind: string; line: number }
/** Roster headers (a name word with a birth/ID word on the same line or within 5 lines) and birth labels. */
function personalData(text: string): Finding[] {
    const lines = text.split("\n").map(fold)
    const out: Finding[] = []
    lines.forEach((l, i) => {
        if (BIRTH_LABEL.test(l)) out.push({ kind: "birth label", line: i })
        if (NAME_WORD.test(l) && lines.slice(Math.max(0, i - 5), i + 6).some((x) => BIRTH_WORD.test(x)))
            out.push({ kind: "roster header", line: i })
    })
    return out
}

function* jsonFiles(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
        const p = path.join(dir, name)
        if (statSync(p).isDirectory()) yield* jsonFiles(p)
        else if (name.endsWith(".json")) yield p
    }
}
function* strings(v: unknown, key = ""): Generator<[string, string]> {
    if (typeof v === "string") yield [key, v]
    else if (Array.isArray(v)) for (const x of v) yield* strings(x, key)
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) yield* strings(x, k)
}
type Program = { id: string; name: string; learningOutcomes: string | null }
const chunkRow = (id: string): Program => {
    const index = readJson(path.join(MOCK, "index.json"))
    for (const f of index.chunks as string[]) {
        const row = (readJson(path.join(MOCK, "programs", f)) as Program[]).find((p) => p.id === id)
        if (row) return row
    }
    throw new Error(`${id} in no chunk`)
}

test.describe("v2.65 — no birth dates or personal rosters in published text", () => {
    test("no roster header or labelled birth date in any text of public/mock", () => {
        test.setTimeout(300000)
        const found: string[] = []
        let files = 0
        let nameWords = 0
        let oldDates = 0
        for (const f of jsonFiles(MOCK)) {
            files++
            for (const [key, s] of strings(readJson(f))) {
                const folded = fold(s)
                if (NAME_WORD.test(folded)) nameWords++
                if (OLD_DATE.test(folded)) oldDates++
                for (const x of personalData(s)) found.push(`${path.relative(MOCK, f)} [${key}] line ${x.line}: ${x.kind}`)
            }
        }
        expect(files).toBeGreaterThan(10000)
        // The scan is exercised: name words (lesson vocabulary, essay title pages) and old dates (laws, circulars)
        // are seen and are not personal data.
        expect(nameWords).toBeGreaterThan(0)
        expect(oldDates).toBeGreaterThan(0)
        expect(found).toEqual([])
    })

    test("b3452043: by-id and chunk publish the text before the staff table", () => {
        const byId: Program = readJson(path.join(MOCK, "programs-by-id", `${UEL_STAFF_TABLE}.json`))
        const row = chunkRow(UEL_STAFF_TABLE)
        expect(typeof byId.learningOutcomes).toBe("string")
        const lo = byId.learningOutcomes as string
        expect(row.learningOutcomes).toBe(lo)
        expect(lo.split("\n").filter((l) => l.trim()).length).toBeGreaterThanOrEqual(20)
        // Line numbers only: a failure must not print the personal data it found.
        const bad = lo.split("\n").map(fold)
            .flatMap((l, i) => (NAME_WORD.test(l) || BIRTH_WORD.test(l) || OLD_DATE.test(l) ? [`line ${i}`] : []))
        expect(bad).toEqual([])
        expect(personalData(lo)).toEqual([])
    })

    test("dialog: the PLO section of b3452043 shows no birth date", async ({ page }) => {
        test.setTimeout(90000)
        const vi = readJson(path.join(ROOT, "src", "messages", "vi.json")).programs as Record<string, unknown>
        expect(typeof vi.learningOutcomes === "string" && (vi.learningOutcomes as string).length > 0).toBe(true)
        const p: Program = readJson(path.join(MOCK, "programs-by-id", `${UEL_STAFF_TABLE}.json`))
        await page.goto(`/vi?program=${p.id}`, { waitUntil: "domcontentloaded" })
        const box = page.getByRole("dialog", { name: p.name, exact: true })
        await expect(box).toBeVisible({ timeout: 30000 })
        await expect(box.getByRole("heading", { name: vi.learningOutcomes as string, exact: true })).toBeVisible()
        const lastLine = (p.learningOutcomes as string).split("\n").filter((l) => l.trim()).at(-1)!.trim()
        // Booleans and line numbers only: a failure must not print the dialog's text.
        const text = await box.innerText()
        expect(text.includes(lastLine.slice(0, 80)), "the PLO section shows the published last line").toBe(true)
        const bad = text.split("\n").map(fold).flatMap((l, i) => [
            ...(OLD_DATE.test(l) ? [`dialog line ${i}: birth-date shape`] : []),
            ...(BIRTH_WORD.test(l) ? [`dialog line ${i}: birth/ID column word`] : []),
        ])
        expect(bad).toEqual([])
    })
})
