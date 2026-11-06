import { test, expect } from "@playwright/test"
import { readdirSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.66 — the generated "Mục tiêu đào tạo" sentence is not published (audit 2026-11-05 H4/A2).
 * Before v2.66, 1,038 programs at 11 universities published the same goals sentence with only the program name
 * swapped in: "Đào tạo nguồn nhân lực chất lượng cao ngành {NAME}, trang bị đầy đủ kiến thức lý thuyết chuyên sâu và
 * kỹ năng thực hành nghề nghiệp đáp ứng nhu cầu xã hội." The exporter (crawler/scripts/export_mock_programs_sync.py,
 * GOALS_TEMPLATE in quarantine) now publishes such goals as null, as v2.44 did for the template career sentence.
 * Checks: (1) the rule, with a wider scan (the template's core phrase in any text field, folded); (2) a rule-free
 * invariant — no goals text (program name replaced) is shared by programs of two or more universities; (3) the dialog
 * of HCMUT "Viễn thông (2022)" (0035ea70, a template program before v2.66) shows no goals section, while a program
 * with real goals still shows its own.
 * Every expectation is computed from public/mock and src/messages at test time; message keys are checked inside the
 * test that uses them. domcontentloaded, not networkidle (AGENTS.md §12).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const TEMPLATE_PROGRAM = "0035ea70-1170-4ba0-8b12-3125bcd775e8"

const TEMPLATE =
    /^Đào tạo nguồn nhân lực chất lượng cao ngành [^\n]+?, trang bị đầy đủ kiến thức lý thuyết chuyên sâu và kỹ năng thực hành nghề nghiệp đáp ứng nhu cầu xã hội\.$/u
const fold = (s: string) =>
    s.normalize("NFC").replace(/\p{Cf}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D")
        .normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/\s+/g, " ")
const CORE = fold("trang bị đầy đủ kiến thức lý thuyết chuyên sâu")
const nfc = (s: string | null | undefined) => (s ?? "").normalize("NFC").trim()
const isTemplate = (goals: string | null | undefined) => TEMPLATE.test(nfc(goals))

type Program = { id: string; universityId: string; name: string; goals: string | null }
const byIdFiles = () => readdirSync(path.join(MOCK, "programs-by-id")).filter((f) => f.endsWith(".json")).sort()
const chunkRows = (): Program[] =>
    (readJson(path.join(MOCK, "index.json")).chunks as string[]).flatMap((f) => readJson(path.join(MOCK, "programs", f)))
function* strings(v: unknown, key = ""): Generator<[string, string]> {
    if (typeof v === "string") yield [key, v]
    else if (Array.isArray(v)) for (const x of v) yield* strings(x, key)
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) yield* strings(x, k)
}

test.describe("v2.66 — the template goals sentence is not published", () => {
    test("no goals is the template, no text holds its core phrase, by-id goals = chunk goals", () => {
        test.setTimeout(120000)
        const rows = chunkRows()
        const chunkGoals = new Map(rows.map((p) => [p.id, p.goals]))
        const found: string[] = []
        let withGoals = 0
        const files = byIdFiles()
        expect(files.length).toBeGreaterThan(1900)
        expect(rows.length).toBe(files.length)
        for (const f of files) {
            const p: Program = readJson(path.join(MOCK, "programs-by-id", f))
            if (nfc(p.goals)) withGoals++
            if (isTemplate(p.goals)) found.push(`${p.id.slice(0, 8)} by-id goals = template`)
            for (const [key, s] of strings(p)) if (fold(s).includes(CORE)) found.push(`${p.id.slice(0, 8)} by-id [${key}] core phrase`)
            if (chunkGoals.get(p.id) !== p.goals) found.push(`${p.id.slice(0, 8)} chunk goals != by-id goals`)
        }
        for (const p of rows) {
            if (isTemplate(p.goals)) found.push(`${p.id.slice(0, 8)} chunk goals = template`)
            for (const [key, s] of strings(p)) if (fold(s).includes(CORE)) found.push(`${p.id.slice(0, 8)} chunk [${key}] core phrase`)
        }
        // The scan is exercised: real goals are still published.
        expect(withGoals).toBeGreaterThan(100)
        expect(found.length, found.slice(0, 10).join("\n")).toBe(0)
    })

    test("no goals text is shared by programs of two or more universities", () => {
        const universities = new Map<string, Set<string>>()
        for (const f of byIdFiles()) {
            const p: Program = readJson(path.join(MOCK, "programs-by-id", f))
            const g = nfc(p.goals)
            if (!g) continue
            const key = g.split(nfc(p.name)).join("{NAME}")
            if (!universities.has(key)) universities.set(key, new Set())
            universities.get(key)!.add(p.universityId)
        }
        expect(universities.size).toBeGreaterThan(100)
        const shared = [...universities.entries()].filter(([, u]) => u.size >= 2)
            .map(([t, u]) => `${u.size} universities: ${t.slice(0, 60)}…`)
        expect(shared).toEqual([])
    })

    test("dialog: Viễn thông (2022) shows no goals section, a program with real goals shows its own", async ({ page }) => {
        test.setTimeout(120000)
        const vi = readJson(path.join(ROOT, "src", "messages", "vi.json")).programs as Record<string, unknown>
        for (const k of ["goals", "description"]) expect(typeof vi[k] === "string" && (vi[k] as string).length > 0, k).toBe(true)
        const goalsTitle = vi.goals as string

        const p: Program = readJson(path.join(MOCK, "programs-by-id", `${TEMPLATE_PROGRAM}.json`))
        await page.goto(`/vi?program=${p.id}`, { waitUntil: "domcontentloaded" })
        const box = page.getByRole("dialog", { name: p.name, exact: true })
        await expect(box).toBeVisible({ timeout: 30000 })
        await expect(box.getByRole("heading", { name: vi.description as string, exact: true })).toBeVisible()
        await expect(box.getByRole("heading", { name: goalsTitle, exact: true })).toHaveCount(0)
        expect(fold(await box.innerText()).includes(CORE), "the dialog shows the template's core phrase").toBe(false)

        // A program with real goals (first by id) still shows the section and its text.
        const real = byIdFiles().map((f) => readJson(path.join(MOCK, "programs-by-id", f)) as Program)
            .find((x) => nfc(x.goals) && !isTemplate(x.goals))!
        expect(real, "a program with real goals").toBeTruthy()
        await page.goto(`/vi?program=${real.id}`, { waitUntil: "domcontentloaded" })
        const box2 = page.getByRole("dialog", { name: real.name, exact: true })
        await expect(box2).toBeVisible({ timeout: 30000 })
        await expect(box2.getByRole("heading", { name: goalsTitle, exact: true })).toBeVisible()
        const squash = (s: string) => s.normalize("NFC").replace(/\s+/g, " ")
        const firstLine = squash(nfc(real.goals).split("\n").find((l) => l.trim())!.trim())
        expect(squash(await box2.innerText()).includes(firstLine.slice(0, 60)), "the real goals text").toBe(true)
    })
})
