import { test, expect, type Locator, type Page } from "@playwright/test"
import { existsSync, readFileSync, readdirSync } from "fs"
import path from "path"

/**
 * v2.59 — curriculum, GPA and syllabus values that are right (audit 2026-10-30 V5, gap G7).
 *
 * - GPA: "Chưa tính điểm" takes a course out of the GPA (it used to count as 0 with its credits); every grade select
 *   is named after its course ("<name> (<code>)").
 * - Curriculum semester filter: the options are the program's own semesters (ascending, "Chưa rõ học kỳ" last), so
 *   semesters 0, −3..−1, 9 and 10 are reachable. A stored semester ≤ 0 (FPT) is FPT's "preparation phase" — its own
 *   wording — with the stored term number: the table cell, GPA heading, syllabus badge and program page print that
 *   label, never "HK0"/"HK-1"/"Học kỳ -1". Semesters ≥ 1 read as before ("HK9", "Học kỳ 9").
 * - Syllabus values that say nothing are not shown: a credit count, pass score or failing criterion equal to 0 (the
 *   criterion reads "Không quy định", the modal's empty text), and an English line that reads the same as the title
 *   above it (NFC, spaces and letter case folded) — on /roadmap, in the syllabus modal and on /materials. FPT's normal
 *   values are unchanged.
 * - TDTU's filler fields (v2.54) are also hidden when the syllabus is opened from a TDTU program dialog.
 *
 * Fixtures are picked from public/mock at test time by the stated rules (catalog chunk order / index order); every
 * expected text is built here from the contract's rules (DONE.md v2.59) and messages that must exist.
 * domcontentloaded, not networkidle (AGENTS.md §12).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const vi = readJson(path.join(ROOT, "src", "messages", "vi.json"))
/** A message that must exist (a missing key fails instead of comparing undefined with undefined). */
const msg = (ns: string, key: string): string => {
    const m = vi[ns]?.[key]
    if (typeof m !== "string" || m.length === 0) throw new Error(`missing message vi.${ns}.${key}`)
    return m
}
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const num = (n: number) => new Intl.NumberFormat("vi").format(n)

type Program = { id: string; name: string; universityId: string; courseCount: number }
type Course = { id: string; courseName: string; courseCode: string | null; credits: number | null; semester: number | null }
type Uni = { id: string; code: string }
type Row = Record<string, unknown>
type Syllabus = { info: Row; assessments?: Row[]; sessions?: Row[] }

const index = readJson(path.join(MOCK, "index.json"))
const listed: Program[] = (index.chunks as string[]).flatMap((f) => readJson(path.join(MOCK, "programs", f)))
const universities: Uni[] = readJson(path.join(MOCK, "universities.json"))
const uniCode = (p: Program) => universities.find((u) => u.id === p.universityId)?.code
const curriculaOf = (id: string): Course[] | null => {
    const f = path.join(MOCK, "curricula", `${id}.json`)
    return existsSync(f) ? readJson(f) : null
}
// Same file-name rule as the fetchers in src/features/programs/api.ts.
const fileName = (code: string) => code.replace(/[^a-zA-Z0-9_\-]/g, "_")
const syllabusPath = (uni: string, code: string) => path.join(MOCK, "syllabuses", uni, `${fileName(code)}.json`)
const syllabusOf = (uni: string, code: string): Syllabus | null => (existsSync(syllabusPath(uni, code)) ? readJson(syllabusPath(uni, code)) : null)
const indexOf = (uni: string): string[] => readJson(path.join(MOCK, "roadmaps", uni, "index.json"))
const roadmapOf = (uni: string, code: string): Row & { subjectName?: string } => readJson(path.join(MOCK, "roadmaps", uni, `${fileName(code)}.json`))
const materials: Row[] = readJson(path.join(MOCK, "materials", "FPT.json"))

// ---- the contract's rules (DONE.md v2.59 D2–D6) ----
const isZero = (v: unknown) => String(v ?? "").trim() !== "" && Number(String(v).trim()) === 0
const fold = (s: unknown) => String(s ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase()
const compare = (a: number | null, b: number | null) => (a == null ? 1 : b == null ? -1 : a - b)
const semestersOf = (cs: Course[]) => [...new Set(cs.map((c) => c.semester))].sort(compare)
const semLabel = (n: number | null) =>
    n == null ? msg("programs", "gpaSemesterUnknown") : n <= 0 ? fill(msg("programs", "semesterPrep"), { n: num(n) }) : fill(msg("programs", "semesterN"), { n: num(n) })
/** The curriculum table's semester cell. */
const cellLabel = (n: number | null) => (n == null ? "N/A" : n <= 0 ? semLabel(n) : `HK${n}`)
const gradeName = (c: Course) => fill(msg("programs", "gpaGradeFor"), { course: c.courseCode ? `${c.courseName} (${c.courseCode})` : c.courseName })

const withCourses = listed.map((p) => ({ p, cs: curriculaOf(p.id) })).filter((x): x is { p: Program & { code?: string | null; universityName: string }; cs: Course[] } => !!x.cs && x.cs.length > 0)
// The catalog search's substring rule (api.ts applyFiltersAndSort): name / code / university name.
const searchHits = (q: string) => {
    const s = q.toLowerCase()
    return withCourses.filter(({ p }) => p.name.toLowerCase().includes(s) || (p.code?.toLowerCase().includes(s) ?? false) || p.universityName.toLowerCase().includes(s)).length
}
const has = (cs: Course[], pred: (n: number | null) => boolean) => cs.some((c) => pred(c.semester))
// Semester fixtures (first listed program, catalog chunk order) and the semester each test picks.
const semesterFixtures = [
    { rule: "a preparatory (≤ 0) and a semester-9 row", pick: () => 9, x: withCourses.find((x) => has(x.cs, (n) => n != null && n <= 0) && has(x.cs, (n) => n === 9)) },
    { rule: "a negative semester", pick: (sems: (number | null)[]) => sems[0], x: withCourses.find((x) => has(x.cs, (n) => n != null && n < 0)) },
    { rule: "outside FPT, a semester-10 row", pick: () => 10, x: withCourses.find((x) => uniCode(x.p) !== "FPT" && has(x.cs, (n) => n === 10)) },
    // Also reachable through the catalog search (the fallback test opens it there): its name finds only itself.
    { rule: "courses with and without a semester", pick: () => null, x: withCourses.find((x) => has(x.cs, (n) => n == null) && has(x.cs, (n) => n != null) && searchHits(x.p.name) === 1) },
]
// GPA fixture: first listed program whose first semester group has two credited courses with names unique in the program.
const gpaFixture = (() => {
    for (const x of withCourses) {
        const names = x.cs.map(gradeName)
        const first = semestersOf(x.cs)[0]
        const two = x.cs.filter((c, i) => c.semester === first && (c.credits ?? 0) >= 1 && names.indexOf(names[i]) === names.lastIndexOf(names[i])).slice(0, 2)
        if (two.length === 2) return { ...x, two }
    }
    return null
})()
// TDTU dialog filler fixture (D7): first listed TDTU program whose curriculum (file order) has a course with a TDTU syllabus with sessions.
const tdtuDialog = (() => {
    for (const x of withCourses.filter((w) => uniCode(w.p) === "TDTU")) {
        const row = x.cs.findIndex((k) => k.courseCode && (syllabusOf("TDTU", k.courseCode)?.sessions?.length ?? 0) > 0)
        if (row >= 0) return { p: x.p, c: x.cs[row], row }
    }
    return null
})()

// Syllabus fields the modal or /roadmap render — the filler of a university = those with one non-empty value in every file (as v254).
const DISPLAYED: Record<"info" | "sessions", string[]> = {
    info: ["syllabusName", "syllabusEnglish", "credits", "decisionNo", "minAvgToPass", "prerequisite", "scoringScale", "note", "timeAllocation", "studentTasks", "description"],
    sessions: ["sessionNo", "topic", "learningTeachingType", "studentTasks"],
}
let syllabiCache: Map<string, Map<string, Syllabus>> | null = null
const syllabi = () => {
    syllabiCache ??= new Map(
        ["FPT", "TDTU"].map((u) => {
            const dir = path.join(MOCK, "syllabuses", u)
            return [u, new Map(readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), readJson(path.join(dir, f)) as Syllabus]))]
        })
    )
    return syllabiCache
}
const fillerOf = (uni: string) => {
    const files = [...syllabi().get(uni)!.values()]
    const out: string[] = []
    for (const [section, fields] of Object.entries(DISPLAYED)) {
        const rows: Row[] = section === "info" ? files.map((f) => f.info ?? {}) : files.flatMap((f) => f.sessions ?? [])
        for (const k of fields) {
            const values = new Set(rows.map((r) => JSON.stringify(r[k] ?? null)))
            const [only] = values
            if (rows.length > 0 && values.size === 1 && only !== "null" && only !== '""') out.push(`${section}.${k}`)
        }
    }
    return out
}
/** First index course of `uni` (index order) whose syllabus and roadmap file pass `ok`. */
const firstIndexCourse = (uni: string, ok: (s: Syllabus, title: string) => boolean) =>
    indexOf(uni).find((c) => {
        const s = syllabi().get(uni)!.get(fileName(c))
        return !!s && ok(s, String(roadmapOf(uni, c).subjectName || s.info.syllabusName || c))
    })

// ---- page helpers ----
const dialogNamed = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const picker = (page: Page) => page.getByLabel(msg("roadmap", "universityLabel"), { exact: true })
const bannerTitle = (page: Page, name: string) => page.getByRole("heading", { level: 2, name, exact: true })

async function openCurriculum(page: Page, p: Program) {
    await page.goto(`/vi?program=${p.id}`, { waitUntil: "domcontentloaded" })
    const detail = dialogNamed(page, p.name)
    await expect(detail).toBeVisible({ timeout: 30000 })
    await detail.getByRole("tab", { name: msg("programs", "curriculumTab"), exact: true }).click()
    await expect(detail.locator("tbody tr").first()).toBeVisible({ timeout: 15000 })
    return detail
}
/** The curriculum tab's semester select, found by its "all" option (works on any tree); its name is checked by the tests. */
const semesterSelect = (page: Page, detail: Locator) => detail.getByRole("combobox").filter({ has: page.locator('option[value="all"]') })
const semesterCells = (detail: Locator) => detail.locator("tbody tr td:nth-child(3)")
/** The table's cell texts as a sorted list: mock mode lists the rows by course name (api.ts fetchCurricula), not file order. */
const sortedCellTexts = async (detail: Locator) => (await semesterCells(detail).allTextContents()).map((t) => t.replace(/\s+/g, " ").trim()).sort()
/** The curriculum table row of a course, by its code cell. */
const courseRow = (page: Page, detail: Locator, code: string) =>
    detail.locator("tbody tr").filter({ has: page.locator("td:nth-child(1)").getByText(code, { exact: true }) })

async function openRoadmap(page: Page, uni: string) {
    await page.goto("/vi/roadmap", { waitUntil: "domcontentloaded" })
    await expect(picker(page).locator("option")).toHaveCount(universities.length, { timeout: 30000 })
    if (uni !== "FPT") await picker(page).selectOption(uni)
    await expect(bannerTitle(page, String(roadmapOf(uni, uni === "FPT" ? "SWE201c" : indexOf(uni)[0]).subjectName))).toBeVisible({ timeout: 20000 })
}
/** Moves the /roadmap focus to `code` through the search box's suggestion (v254's path). */
async function goToCourse(page: Page, uni: string, code: string) {
    const ph = msg("roadmap", uni === "FPT" ? "searchPlaceholder" : "searchPlaceholderCode")
    expect(indexOf(uni).filter((c) => c.toLowerCase().includes(code.toLowerCase())).slice(0, 8), "course among the 8 suggestions").toContain(code)
    await page.getByPlaceholder(ph, { exact: true }).fill(code)
    await page
        .getByPlaceholder(ph, { exact: true })
        .locator("xpath=..")
        .locator("div.absolute button")
        .filter({ has: page.locator("span", { hasText: new RegExp(`^${esc(code)}$`) }) })
        .click()
    await expect(page.getByRole("heading", { level: 3, name: String(roadmapOf(uni, code).subjectName), exact: true })).toBeVisible({ timeout: 20000 })
}
async function openRoadmapSyllabus(page: Page, s: Syllabus) {
    await page.getByRole("button", { name: msg("roadmap", "viewSyllabus"), exact: true }).click()
    const modal = page.getByRole("dialog")
    await expect(modal.getByRole("heading", { level: 2, name: String(s.info.syllabusName), exact: true })).toBeVisible({ timeout: 20000 })
    return modal
}

test.describe("v2.59 — curriculum, GPA and syllabus values that are right", () => {
    // Each UI test opens several pages/dialogs; the machine is shared (AGENTS.md §12), so 30 s per test is too tight.
    test.describe.configure({ timeout: 120000 })

    test("data: fixtures exist and the counted cases are in the snapshot (counts as annotations)", () => {
        test.setTimeout(300000) // reads every FPT/TDTU syllabus file once (~3,000)
        for (const [ns, k] of [["programs", "semesterPrep"], ["programs", "gpaGradeFor"], ["syllabus", "emptyMetaPrep"], ["syllabus", "notSpecified"]]) msg(ns, k)
        for (const f of semesterFixtures) expect(f.x, f.rule).toBeTruthy()
        expect(gpaFixture, "GPA fixture").toBeTruthy()
        expect(tdtuDialog, "TDTU dialog fixture").toBeTruthy()
        const note = (type: string, description: string) => test.info().annotations.push({ type, description })
        for (const uni of ["FPT", "TDTU"]) {
            const files = [...syllabi().get(uni)!.values()]
            const zeroCriteria = files.flatMap((s) => s.assessments ?? []).filter((a) => isZero(a.completionCriteria)).length
            const zeroCredits = files.filter((s) => isZero(s.info.credits)).length
            const zeroPass = files.filter((s) => isZero(s.info.minAvgToPass)).length
            const sameInModal = files.filter((s) => s.info.syllabusEnglish && fold(s.info.syllabusEnglish) === fold(s.info.syllabusName)).length
            const sameOnRoadmap = indexOf(uni).filter((c) => {
                const s = syllabi().get(uni)!.get(fileName(c))
                return !!s?.info.syllabusEnglish && fold(s.info.syllabusEnglish) === fold(roadmapOf(uni, c).subjectName || s.info.syllabusName)
            }).length
            note(`${uni} syllabi`, `zero criteria ${zeroCriteria}, zero credits ${zeroCredits}, zero pass score ${zeroPass}, English = title: modal ${sameInModal}, /roadmap ${sameOnRoadmap}`)
        }
        note("/materials FPT", `zero credits ${materials.filter((m) => isZero(m.credits)).length}, English = name ${materials.filter((m) => m.subjectEnglish && fold(m.subjectEnglish) === fold(m.subjectName)).length}`)
        const rows = withCourses.flatMap((x) => x.cs)
        const by = (pred: (n: number | null) => boolean) => `${rows.filter((c) => pred(c.semester)).length} rows / ${withCourses.filter((x) => x.cs.some((c) => pred(c.semester))).length} programs`
        note("semesters", `≤ 0: ${by((n) => n != null && n <= 0)}; 9: ${by((n) => n === 9)}; 10: ${by((n) => n === 10)}; none: ${by((n) => n == null)}`)
        expect(rows.some((c) => c.semester != null && c.semester <= 0) && rows.some((c) => c.semester === 9)).toBe(true)
    })

    test("GPA: 'Chưa tính điểm' takes the course out of the GPA; every grade select is named after its course", async ({ page }) => {
        const { p, cs, two } = gpaFixture!
        const [a, b] = two
        const detail = await openCurriculum(page, p)
        await detail.getByRole("tab", { name: msg("programs", "gpaTab"), exact: true }).click()
        const selects = detail.locator("select")
        await expect(selects).toHaveCount(cs.length, { timeout: 15000 })
        // Names in display order: semester groups ascending ("not specified" last), file order inside a group.
        const ordered = semestersOf(cs).flatMap((s) => cs.filter((c) => c.semester === s))
        expect(await selects.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(ordered.map(gradeName))

        const gpaText = (v: string) => detail.getByText(`${v} / 4.0`, { exact: true })
        await detail.getByRole("combobox", { name: gradeName(a), exact: true }).selectOption({ label: msg("programs", "gpaGradeA") })
        await detail.getByRole("combobox", { name: gradeName(b), exact: true }).selectOption({ label: msg("programs", "gpaGradeC") })
        const both = ((4 * a.credits! + 2 * b.credits!) / (a.credits! + b.credits!)).toFixed(2)
        await expect(gpaText(both)).toBeVisible()
        await detail.getByRole("combobox", { name: gradeName(b), exact: true }).selectOption({ label: msg("programs", "gpaNotGraded") })
        await expect(gpaText((4).toFixed(2))).toBeVisible()
        await expect(gpaText(both)).toHaveCount(0)
    })

    for (const [i, f] of semesterFixtures.entries()) {
        test(`semester filter P${i + 1} (${f.rule}): options = the program's semesters, the picked one lists exactly its courses`, async ({ page }) => {
            const { p, cs } = f.x!
            const sems = semestersOf(cs)
            const detail = await openCurriculum(page, p)
            const select = semesterSelect(page, detail)
            await expect(select).toHaveCount(1)
            await expect(select.locator("option")).toHaveText([msg("programs", "allSemesters"), ...sems.map(semLabel)])
            await expect(select).toHaveAccessibleName(msg("programs", "semester"))
            // The longer labels stay inside the viewport (Pixel 7 too).
            const box = (await select.boundingBox())!
            expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
            // "All": every row's semester cell as the contract prints it (no "HK0"/"HK-1"); row order is the table's, not the file's.
            await expect.poll(() => sortedCellTexts(detail), { timeout: 15000 }).toEqual(cs.map((c) => cellLabel(c.semester)).sort())
            const pick = f.pick(sems)
            await select.selectOption({ label: semLabel(pick) })
            const picked = cs.filter((c) => c.semester === pick)
            expect(picked.length).toBeGreaterThan(0)
            await expect(semesterCells(detail)).toHaveText(picked.map((c) => cellLabel(c.semester)))
            await expect(detail.getByText(fill(msg("programs", "coursesCount"), { shown: String(picked.length), total: String(cs.length) }), { exact: true })).toBeVisible()
        })
    }

    test("preparatory terms: the GPA headings, the syllabus badge and the program page print the label, not 'Học kỳ 0'/'-1'", async ({ page }) => {
        for (const f of semesterFixtures.slice(0, 2)) {
            const { p, cs } = f.x!
            const sems = semestersOf(cs)
            const detail = await openCurriculum(page, p)
            // The syllabus badge of the first preparatory row (opened from the table).
            const prep = cs.find((c) => c.semester != null && c.semester <= 0 && c.courseCode)!
            const row = courseRow(page, detail, prep.courseCode!)
            await expect(row).toHaveCount(1)
            await row.click()
            const modal = page.getByRole("dialog").nth(1)
            await expect(modal.getByText(semLabel(prep.semester), { exact: true })).toBeVisible({ timeout: 15000 })
            await expect(modal.getByText(fill(msg("syllabus", "semesterBadge"), { n: num(prep.semester!) }), { exact: true })).toHaveCount(0)
            // Without a syllabus file the empty text names the term too.
            if (!syllabusOf(uniCode(p)!, prep.courseCode!)) await expect(modal).toContainText(fill(msg("syllabus", "emptyMetaPrep"), { n: num(prep.semester!) }))
            await page.keyboard.press("Escape")
            await expect(page.getByRole("dialog")).toHaveCount(1)
            await detail.getByRole("tab", { name: msg("programs", "gpaTab"), exact: true }).click()
            await expect(detail.getByTestId("gpa-group").getByRole("heading")).toHaveText(sems.map(semLabel), { timeout: 15000 })

            await page.goto(`/vi/programs/${p.id}`, { waitUntil: "domcontentloaded" })
            await expect(page.locator("tbody tr td:nth-child(4)")).toHaveText(cs.map((c) => (c.semester == null ? "—" : c.semester <= 0 ? semLabel(c.semester) : String(c.semester))))
        }
    })

    test("semester filter: a choice made for another program falls back to all semesters", async ({ page }) => {
        const [p1, , , p4] = semesterFixtures.map((f) => f.x!)
        expect(semestersOf(p4.cs)).not.toContain(9)
        const detail = await openCurriculum(page, p1.p)
        await semesterSelect(page, detail).selectOption({ label: semLabel(9) })
        await page.keyboard.press("Escape")
        await expect(dialogNamed(page, p1.p.name)).toHaveCount(0)
        // Same dialog component (no reload): open P4 from the catalog search.
        await page.getByPlaceholder(msg("programs", "searchPlaceholder"), { exact: true }).fill(p4.p.name)
        const card = page.getByTestId("program-card").filter({ has: page.getByRole("heading", { name: p4.p.name, exact: true }) })
        await expect(card).toHaveCount(1, { timeout: 20000 })
        await card.getByRole("button", { name: /Xem chi tiết/i }).click()
        const d4 = dialogNamed(page, p4.p.name)
        await expect(d4).toBeVisible({ timeout: 15000 })
        await d4.getByRole("tab", { name: msg("programs", "curriculumTab"), exact: true }).click()
        await expect(semesterSelect(page, d4)).toHaveValue("all", { timeout: 15000 })
        await expect(semesterCells(d4)).toHaveCount(p4.cs.length)
    })

    test("/roadmap banner: no zero credits, no zero pass score, no English line equal to the title; FPT values unchanged", async ({ page }) => {
        test.setTimeout(300000)
        const sw = syllabi().get("FPT")!.get("SWE201c")!
        await openRoadmap(page, "FPT")
        // FPT normal values (the default course): credits, pass score, English line.
        await expect(page.getByText(fill(msg("programs", "credits"), { count: String(sw.info.credits) }), { exact: true })).toBeVisible({ timeout: 20000 })
        await expect(page.getByText(fill(msg("roadmap", "passScore"), { score: String(sw.info.minAvgToPass) }), { exact: true })).toBeVisible()
        await expect(page.getByText(String(sw.info.syllabusEnglish), { exact: true })).toBeVisible()

        const zeroCredit = firstIndexCourse("FPT", (s) => isZero(s.info.credits))!
        const zeroPass = firstIndexCourse("FPT", (s) => isZero(s.info.minAvgToPass) && !isZero(s.info.credits))!
        const folded = firstIndexCourse("FPT", (s, title) => !!s.info.syllabusEnglish && fold(s.info.syllabusEnglish) === fold(title) && String(s.info.syllabusEnglish).trim() !== title.trim())!
        for (const code of [zeroCredit, zeroPass, folded]) expect(code).toBeTruthy()
        await goToCourse(page, "FPT", zeroCredit)
        await expect(page.getByText(fill(msg("programs", "credits"), { count: "0" }), { exact: true })).toHaveCount(0)
        await goToCourse(page, "FPT", zeroPass)
        await expect(page.getByText(fill(msg("programs", "credits"), { count: String(syllabi().get("FPT")!.get(fileName(zeroPass))!.info.credits) }), { exact: true })).toBeVisible()
        await expect(page.getByText(fill(msg("roadmap", "passScore"), { score: "0" }), { exact: true })).toHaveCount(0)
        await goToCourse(page, "FPT", folded)
        const fTitle = String(roadmapOf("FPT", folded).subjectName)
        await expect(bannerTitle(page, fTitle).locator("xpath=..").getByText(String(syllabi().get("FPT")!.get(fileName(folded))!.info.syllabusEnglish), { exact: true })).toHaveCount(0)

        await openRoadmap(page, "TDTU")
        const tZero = firstIndexCourse("TDTU", (s) => isZero(s.info.credits))!
        const tSame = firstIndexCourse("TDTU", (s, title) => !!s.info.syllabusEnglish && fold(s.info.syllabusEnglish) === fold(title))!
        await goToCourse(page, "TDTU", tZero)
        await expect(page.getByText(fill(msg("programs", "credits"), { count: "0" }), { exact: true })).toHaveCount(0)
        await goToCourse(page, "TDTU", tSame)
        const tTitle = String(roadmapOf("TDTU", tSame).subjectName)
        await expect(bannerTitle(page, tTitle).locator("xpath=..").getByText(tTitle, { exact: true })).toHaveCount(1)
    })

    test("syllabus modal: a zero criterion reads 'Không quy định', no zero pass score, a name equal to its English shown once; FPT values unchanged", async ({ page }) => {
        test.setTimeout(300000)
        const notSpecified = msg("syllabus", "notSpecified")
        const failThreshold = msg("syllabus", "failThreshold")
        // TDTU: first index course with a zero criterion and a non-zero one.
        const tCode = firstIndexCourse("TDTU", (s) => (s.assessments ?? []).some((a) => isZero(a.completionCriteria)) && (s.assessments ?? []).some((a) => !isZero(a.completionCriteria) && String(a.completionCriteria ?? "") !== ""))!
        const tSyl = syllabi().get("TDTU")!.get(fileName(tCode))!
        await openRoadmap(page, "TDTU")
        if (tCode !== indexOf("TDTU")[0]) await goToCourse(page, "TDTU", tCode)
        let modal = await openRoadmapSyllabus(page, tSyl)
        const crit = (tSyl.assessments ?? []).map((a) => String(a.completionCriteria))
        await expect(modal.getByText(notSpecified, { exact: true })).toHaveCount(crit.filter(isZero).length)
        await expect(modal.getByText(/^≥ 0$/)).toHaveCount(0)
        const strict = crit.find((c) => !isZero(c) && parseFloat(c) >= 4)
        if (strict) await expect(modal.getByText(fill(failThreshold, { criteria: strict }), { exact: true }).first()).toBeVisible()
        await page.keyboard.press("Escape")
        await expect(page.getByRole("dialog")).toHaveCount(0)

        // FPT normal values: the default course's criterion and pass score.
        const sw = syllabi().get("FPT")!.get("SWE201c")!
        await openRoadmap(page, "FPT")
        modal = await openRoadmapSyllabus(page, sw)
        await expect(modal.getByText(fill(failThreshold, { criteria: String(sw.assessments![0].completionCriteria) }), { exact: true }).first()).toBeVisible()
        await expect(modal.getByText(`≥ ${sw.info.minAvgToPass} / 10`, { exact: true })).toBeVisible()
        await page.keyboard.press("Escape")

        const zeroPass = firstIndexCourse("FPT", (s) => isZero(s.info.minAvgToPass) && !isZero(s.info.credits))!
        await goToCourse(page, "FPT", zeroPass)
        modal = await openRoadmapSyllabus(page, syllabi().get("FPT")!.get(fileName(zeroPass))!)
        await expect(modal.getByText(msg("syllabus", "passScore"), { exact: true })).toHaveCount(0)
        await expect(modal.getByText("≥ 0 / 10", { exact: true })).toHaveCount(0)
        await page.keyboard.press("Escape")

        const same = firstIndexCourse("FPT", (s) => !!s.info.syllabusEnglish && fold(s.info.syllabusEnglish) === fold(s.info.syllabusName))!
        const sameSyl = syllabi().get("FPT")!.get(fileName(same))!
        await goToCourse(page, "FPT", same)
        modal = await openRoadmapSyllabus(page, sameSyl)
        const heading = modal.getByRole("heading", { level: 2, name: String(sameSyl.info.syllabusName), exact: true })
        await expect(heading.locator("xpath=..").getByText(String(sameSyl.info.syllabusEnglish), { exact: true })).toHaveCount(1)
    })

    test("/materials: no zero credit badge (card and its modal), a name equal to its English shown once; a normal card unchanged", async ({ page }) => {
        await page.goto("/vi/materials", { waitUntil: "domcontentloaded" })
        const syllabusButton = page.getByRole("button", { name: msg("materials", "syllabus"), exact: true })
        await expect(syllabusButton.first()).toBeVisible({ timeout: 30000 })
        const search = page.getByPlaceholder(msg("materials", "searchPlaceholder"), { exact: true })
        const showOnly = async (code: string) => {
            await search.fill(code)
            await expect(syllabusButton).toHaveCount(1, { timeout: 15000 })
        }
        const zero = materials.find((m) => isZero(m.credits))!
        const same = materials.find((m) => m.subjectEnglish && fold(m.subjectEnglish) === fold(m.subjectName))!
        const normal = materials.find((m) => !isZero(m.credits) && m.subjectEnglish && fold(m.subjectEnglish) !== fold(m.subjectName))!
        for (const m of [zero, same, normal]) expect(m).toBeTruthy()

        await showOnly(String(normal.subjectCode))
        await expect(page.getByText(fill(msg("programs", "creditsShort"), { count: String(normal.credits) }), { exact: true })).toBeVisible()
        await expect(page.getByText(String(normal.subjectEnglish), { exact: true })).toBeVisible()

        await showOnly(String(zero.subjectCode))
        await expect(page.getByText(fill(msg("programs", "creditsShort"), { count: "0" }), { exact: true })).toHaveCount(0)
        await syllabusButton.click()
        const modal = page.getByRole("dialog")
        await expect(modal).toBeVisible({ timeout: 15000 })
        await expect(modal.getByText(fill(msg("programs", "credits"), { count: "0" }), { exact: true })).toHaveCount(0)
        await page.keyboard.press("Escape")
        await expect(modal).toHaveCount(0)

        await showOnly(String(same.subjectCode))
        await expect(page.getByText(String(same.subjectName), { exact: true })).toHaveCount(1)
    })

    test("TDTU program dialog → syllabus: the filler fields are not shown, the curriculum row's semester and credits are", async ({ page }) => {
        test.setTimeout(300000) // derives the filler from the syllabus files (~3,000)
        const { p, c, row } = tdtuDialog!
        const syl = syllabusOf("TDTU", c.courseCode!)!
        const filler = fillerOf("TDTU")
        expect(filler.length, "TDTU has filler fields").toBeGreaterThan(0)
        const detail = await openCurriculum(page, p)
        await detail.locator("tbody tr").nth(row).click()
        const modal = page.getByRole("dialog").nth(1)
        await expect(modal.getByRole("heading", { level: 2, name: String(syl.info.syllabusName), exact: true })).toBeVisible({ timeout: 20000 })
        if (c.semester != null && c.semester >= 1) await expect(modal.getByText(fill(msg("syllabus", "semesterBadge"), { n: num(c.semester) }), { exact: true })).toBeVisible()
        if (c.credits != null) await expect(modal.getByText(fill(msg("programs", "credits"), { count: String(c.credits) }), { exact: true })).toBeVisible()
        for (const label of [msg("syllabus", "decisionNo"), msg("syllabus", "passScore")]) await expect(modal.getByText(label, { exact: true }), label).toHaveCount(0)
        await expect(modal.getByText(new RegExp(`^${esc(msg("syllabus", "scoringScale").split("{")[0].trim())}`))).toHaveCount(0)
        for (const f of filler.filter((x) => x.startsWith("info."))) await expect(modal.getByText(String(syl.info[f.slice(5)]), { exact: true }), f).toHaveCount(0)
        await modal.getByRole("tab", { name: new RegExp(`^${esc(msg("syllabus", "tabSessions"))}`) }).click()
        await expect(modal.getByText(fill(msg("syllabus", "sessionNo"), { n: String(syl.sessions![0].sessionNo) }), { exact: true }).first()).toBeVisible({ timeout: 15000 })
        for (const f of filler.filter((x) => x.startsWith("sessions."))) {
            for (const v of new Set(syl.sessions!.map((s) => String(s[f.slice(9)])))) await expect(modal.getByText(v, { exact: true }), f).toHaveCount(0)
        }
        if (filler.includes("sessions.studentTasks")) await expect(modal.getByText(msg("syllabus", "prepTasks"), { exact: true })).toHaveCount(0)
    })
})
