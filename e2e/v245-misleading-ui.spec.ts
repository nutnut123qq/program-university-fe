import { test, expect, Page } from "@playwright/test"
import { existsSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.45 — UI that misled students (audit V2: G3 temporary, G4, G13).
 *
 * - G3: every university carries isPublic=true in the snapshot (FPT, Duy Tân,
 *   HUTECH are private), so the public/private filter is removed until the
 *   data is right; a stale URL/state must not filter.
 * - G4: the GPA tab suggested AI/Fullstack/Cyber "tracks" by substring match
 *   for every program (law included) and let a student grade only 15 courses.
 *   Now: no tracks, one grade row per course, grouped by semester.
 * - G13: no hard-coded 2025 in copy, "AUN-QA" tab renamed, no "AUN-QA Gold".
 *
 * Fixtures are picked from public/mock at test time by structural invariants
 * (nothing named is pinned). A fixture must be reachable with the catalog
 * search: its full name matches exactly one program under the same substring
 * rule as api.ts applyFiltersAndSort (name / code / university name).
 * domcontentloaded, not networkidle: a program without courses fetches a
 * 404 curricula file, which can keep networkidle pending on `next start`
 * (AGENTS.md §12).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const vi = readJson(path.join(ROOT, "src", "messages", "vi.json"))
const en = readJson(path.join(ROOT, "src", "messages", "en.json"))

// The removed career-track titles ("Kỹ sư Trí tuệ Nhân tạo (AI / …)",
// "Lập trình viên Fullstack", "Cybersecurity Specialist").
const OLD_TRACKS = /\bAI\b|Fullstack|Cyber/
// Labels of the removed university-type select (keys deleted in v2.45).
const OLD_TYPE_LABELS = ["Tất cả loại hình", "Trường Công lập", "Trường Tư thục"]

type MockProgram = {
    id: string
    name: string
    code: string | null
    universityId: string
    universityName: string
    courseCount: number
}
type Course = { id: string; courseName: string; semester: number | null }
type Uni = { id: string; code: string; name: string }

const index = readJson(path.join(MOCK, "index.json"))
const programs: MockProgram[] = (index.chunks as string[]).flatMap((f) => readJson(path.join(MOCK, "programs", f)))
const universities: Uni[] = readJson(path.join(MOCK, "universities.json"))

const curriculaOf = (id: string): Course[] | null => {
    const file = path.join(MOCK, "curricula", `${id}.json`)
    return existsSync(file) ? readJson(file) : null
}
const searchHits = (q: string) => {
    const s = q.toLowerCase()
    return programs.filter(
        (p) =>
            p.name.toLowerCase().includes(s) ||
            (p.code?.toLowerCase().includes(s) ?? false) ||
            p.universityName.toLowerCase().includes(s)
    ).length
}
const searchable = (p: MockProgram) => searchHits(p.name) === 1

// Law program with the most courses (well above the old 15-row cap) whose
// course names cannot themselves contain the old track words.
const law = programs
    .filter((p) => p.name.includes("Luật") && p.courseCount > 0)
    .map((p) => ({ p, courses: curriculaOf(p.id) }))
    .filter((x): x is { p: MockProgram; courses: Course[] } => !!x.courses && !x.courses.some((c) => OLD_TRACKS.test(c.courseName)))
    .sort((a, b) => b.p.courseCount - a.p.courseCount)
    .find((x) => searchable(x.p))!

// Programs with semester data: one where every course has a semester, one
// where only some do (rows without one go to the last group), if any.
const withCourses = programs
    .filter((p) => p.courseCount > 0)
    .map((p) => ({ p, courses: curriculaOf(p.id) }))
    .filter((x): x is { p: MockProgram; courses: Course[] } => !!x.courses)
const semesterFixtures = [
    withCourses.find(
        (x) => x.courses.every((c) => c.semester != null) && new Set(x.courses.map((c) => c.semester)).size >= 2 && searchable(x.p)
    ),
    withCourses.find(
        (x) => x.courses.some((c) => c.semester == null) && x.courses.some((c) => c.semester != null) && searchable(x.p)
    ),
].filter((x): x is { p: MockProgram; courses: Course[] } => !!x)

// A program without courses (no curricula file at all).
const empty = programs.find((p) => p.courseCount === 0 && !curriculaOf(p.id) && searchable(p))!

const group = (n: number, sep: string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep)

async function openProgram(page: Page, p: MockProgram) {
    await page.goto("/vi", { waitUntil: "domcontentloaded" })
    // Cards rendered = hydrated + first chunk loaded; then search.
    await expect(page.getByRole("button", { name: /Xem chi tiết/i }).first()).toBeVisible({ timeout: 30000 })
    await page.getByPlaceholder(/Tìm tên ngành, mã ngành/i).fill(p.name)
    const card = page.getByTestId("program-card").filter({ has: page.getByRole("heading", { name: p.name, exact: true }) })
    await expect(card).toHaveCount(1, { timeout: 20000 })
    await card.getByRole("button", { name: /Xem chi tiết/i }).click()
    const dialog = page.locator("div.fixed.inset-0.z-50").last()
    await expect(dialog.getByRole("heading", { name: p.name, exact: true })).toBeVisible({ timeout: 15000 })
    return dialog
}

test.describe("v2.45 — misleading UI quick fixes", () => {
    test("fixtures exist in the snapshot", () => {
        expect(law).toBeTruthy()
        expect(law.p.courseCount).toBeGreaterThan(15)
        expect(law.courses).toHaveLength(law.p.courseCount)
        expect(semesterFixtures.length).toBeGreaterThan(0)
        for (const f of semesterFixtures) expect(f.courses).toHaveLength(f.p.courseCount)
        expect(empty).toBeTruthy()
    })

    test("catalog filters: no university-type select, a stale type param does not filter", async ({ page }) => {
        await page.goto("/vi?universityType=private&isPublic=false&type=private", { waitUntil: "domcontentloaded" })
        await expect(page.getByRole("button", { name: /Xem chi tiết/i }).first()).toBeVisible({ timeout: 30000 })
        for (const label of OLD_TYPE_LABELS) await expect(page.getByRole("combobox", { name: label })).toHaveCount(0)
        // The whole catalog is listed: "Hiển thị N / <total> chương trình đào tạo".
        const total = index.totalCount as number
        await expect(page.locator("text=/Hiển thị/i").first()).toContainText(
            new RegExp(`/\\s*(${total}|${group(total, ".")})\\s`)
        )
        // The university select lists every university (private ones included).
        await page.getByRole("combobox", { name: vi.programs.allUniversities }).click()
        const listbox = page.getByRole("listbox")
        await expect(listbox.getByRole("option")).toHaveCount(universities.length + 1)
        for (const u of universities) await expect(listbox).toContainText(u.name)
    })

    test("GPA tab of a law program: no career tracks, one grade row per course", async ({ page }) => {
        const dialog = await openProgram(page, law.p)
        await dialog.getByRole("button", { name: vi.programs.gpaTab, exact: true }).click()
        const rows = dialog.locator("select")
        await expect(rows.first()).toBeVisible({ timeout: 15000 })
        await expect(dialog).not.toContainText(OLD_TRACKS)
        await expect(rows).toHaveCount(law.p.courseCount)
        const text = (await dialog.textContent()) ?? ""
        expect(law.courses.filter((c) => !text.includes(c.courseName))).toEqual([])
        // No semester data → a single group without a heading.
        expect(law.courses.every((c) => c.semester == null)).toBe(true)
        await expect(dialog.getByTestId("gpa-group")).toHaveCount(1)
        await expect(dialog.getByTestId("gpa-group").getByRole("heading")).toHaveCount(0)

        // Reference-evaluation tab, no AUN-QA label.
        await expect(dialog.getByRole("button", { name: vi.programs.evalTab, exact: true })).toBeVisible()
        await expect(dialog.getByRole("button", { name: /AUN-QA/ })).toHaveCount(0)

        // Admissions title: the snapshot's newest year (neutral when it has none).
        const uni = universities.find((u) => u.id === law.p.universityId)!
        const admFile = path.join(MOCK, "admissions", `${uni.code}.json`)
        const years: number[] = existsSync(admFile) ? readJson(admFile).years ?? [] : []
        await dialog.getByRole("button", { name: vi.programs.admissionsTab, exact: true }).click()
        await expect(dialog.getByTestId("admissions-section").locator("h3").first()).toHaveText(
            years.length ? vi.programs.admissionsTitle.replace("{year}", String(Math.max(...years))) : vi.programs.admissionsTitleNoYear,
            { timeout: 15000 }
        )
    })

    test("GPA tab groups the grade rows by semester as in the snapshot", async ({ page }) => {
        for (const f of semesterFixtures) {
            const dialog = await openProgram(page, f.p)
            await dialog.getByRole("button", { name: vi.programs.gpaTab, exact: true }).click()
            const sems = [...new Set(f.courses.map((c) => c.semester))].sort((a, b) =>
                a == null ? 1 : b == null ? -1 : a - b
            )
            const groups = dialog.getByTestId("gpa-group")
            await expect(groups).toHaveCount(sems.length, { timeout: 15000 })
            await expect(dialog.locator("select")).toHaveCount(f.p.courseCount)
            for (const [i, s] of sems.entries()) {
                const g = groups.nth(i)
                await expect(g).toHaveAttribute("data-semester", s == null ? "none" : String(s))
                await expect(g.getByRole("heading")).toHaveText(
                    s == null ? vi.programs.gpaSemesterUnknown : vi.programs.semesterN.replace("{n}", String(s))
                )
                await expect(g.locator("select")).toHaveCount(f.courses.filter((c) => c.semester === s).length)
            }
        }
    })

    test("GPA tab of a program without courses: honest empty state, no calculator", async ({ page }) => {
        const dialog = await openProgram(page, empty)
        await dialog.getByRole("button", { name: vi.programs.gpaTab, exact: true }).click()
        await expect(dialog.getByText(vi.programs.noCurriculum)).toBeVisible({ timeout: 15000 })
        await expect(dialog.locator("select")).toHaveCount(0)
        await expect(dialog).not.toContainText(OLD_TRACKS)
        await expect(dialog).not.toContainText(vi.programs.gpaExpected)
    })

    test("no admissions data: titles and the score-filter line carry no hard-coded year", async ({ page }) => {
        await page.route("**/mock/admissions/*.json", (route) => route.fulfill({ status: 404, body: "" }))
        await page.goto("/vi", { waitUntil: "domcontentloaded" })
        await expect(page.getByRole("button", { name: /Xem chi tiết/i }).first()).toBeVisible({ timeout: 30000 })
        await page.getByTestId("score-filter-input").fill("25")
        const noData = page.getByTestId("score-filter-no-data")
        await expect(noData).toBeVisible({ timeout: 20000 })
        await expect(noData).not.toContainText(/\b20\d\d\b/)
        await expect(noData).toHaveText(vi.programs.scoreFilterNoData)

        const dialog = await openProgram(page, law.p)
        await dialog.getByRole("button", { name: vi.programs.admissionsTab, exact: true }).click()
        const title = dialog.getByTestId("admissions-section").locator("h3").first()
        await expect(title).toBeVisible({ timeout: 15000 })
        await expect(title).not.toContainText(/\d{4}/)
        await expect(title).toHaveText(vi.programs.admissionsTitleNoYear)

        await page.goto(`/vi/compare?a=${law.p.id}&b=${empty.id}`, { waitUntil: "domcontentloaded" })
        const blocks = page.getByTestId("compare-admissions")
        await expect(blocks).toHaveCount(2, { timeout: 30000 })
        for (const i of [0, 1]) {
            await expect(blocks.nth(i).locator("h3").first()).not.toContainText(/\d{4}/)
            await expect(blocks.nth(i).locator("h3").first()).toHaveText(vi.programs.admissionsTitleNoYear)
        }
    })

    test("messages: no 'AUN-QA Gold', no hard-coded score year, reference-evaluation tab", () => {
        for (const f of ["vi.json", "en.json"]) {
            expect(readFileSync(path.join(ROOT, "src", "messages", f), "utf8")).not.toMatch(/AUN-QA Gold|điểm 2025/)
        }
        for (const m of [vi, en]) {
            expect(m.programs.scoreFilterNoData).not.toMatch(/\d{4}/)
            expect(m.programs.evalTab).not.toMatch(/AUN-QA/)
            expect(m.programs.gpaTab).not.toMatch(/Lộ trình|Career/)
        }
        expect(vi.programs.evalTab).toBe("Đánh giá tham khảo")
    })
})
