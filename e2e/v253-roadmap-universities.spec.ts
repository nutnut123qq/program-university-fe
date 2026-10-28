import { test, expect, type Page } from "@playwright/test"
import { existsSync, readdirSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.53 — roadmap for every university with roadmap data (audit V10, gap G12).
 *
 * `/roadmap` has a university picker. FPT stays the default and behaves as
 * before; another university with a `public/mock/roadmaps/<code>/` folder
 * shows its own courses with exactly the prerequisites/unlocks of the course
 * file, reading only its `index.json` and the files of the courses the user
 * moves to; a university without a folder gets an honest empty state and no
 * request; a university without `syllabuses/<code>/` shows no syllabus action
 * and requests none. Outside FPT (whose files carry the whole graph) an empty
 * column says the data records nothing — not that the course has nothing.
 * The generator's `<UNI>-<code>` template rows must never be in the data.
 *
 * Fixtures come from public/mock at test time (nothing named is pinned beyond
 * the FPT default of the contract): universities with/without data from the
 * folders, the course for each university = the first index code whose file
 * lists a relation that resolves to a file (else the first index code).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const ROADMAPS = path.join(MOCK, "roadmaps")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
type Locale = "vi" | "en"
const messages = Object.fromEntries((["vi", "en"] as Locale[]).map((l) => [l, readJson(path.join(ROOT, "src", "messages", `${l}.json`))])) as Record<
    Locale,
    Record<string, Record<string, string>>
>
const vi = messages.vi.roadmap

type Uni = { code: string; name: string }
type RoadmapFile = { code?: string; subjectCode?: string; subjectName?: string; directPrereqs?: string[]; prerequisites?: string[]; unlocks?: string[] }

// The contract's default (DONE.md v2.53 M2): FPT and its curated first course, as at Base.
const DEFAULT_UNI = "FPT"
const DEFAULT_CODE = "SWE201c"
// Same file-name rule as the fetchers in src/features/programs/api.ts.
const fileName = (code: string) => code.replace(/[^a-zA-Z0-9_\-]/g, "_")
const universities: Uni[] = readJson(path.join(MOCK, "universities.json"))
const folders = readdirSync(ROADMAPS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
const withData = universities.filter((u) => folders.includes(u.code))
const withoutData = universities.filter((u) => !folders.includes(u.code))
const others = withData.filter((u) => u.code !== DEFAULT_UNI)
const hasSyllabi = (code: string) => existsSync(path.join(MOCK, "syllabuses", code))
const indexOf = (uni: string): string[] => readJson(path.join(ROADMAPS, uni, "index.json"))
const fileOf = (uni: string, code: string): RoadmapFile | null => {
    const f = path.join(ROADMAPS, uni, `${fileName(code)}.json`)
    return existsSync(f) ? readJson(f) : null
}
const prereqsOf = (r: RoadmapFile) => r.directPrereqs ?? r.prerequisites ?? []
const unlocksOf = (r: RoadmapFile) => r.unlocks ?? []
const caseOf = (uni: string): string => {
    const idx = indexOf(uni)
    const withRelation = idx.find((c) => {
        const r = fileOf(uni, c)!
        const rel = [...prereqsOf(r), ...unlocksOf(r)]
        return rel.length > 0 && rel.every((x) => fileOf(uni, x))
    })
    return withRelation ?? idx[0]
}
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k])
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Every /mock/roadmaps/ and /mock/syllabuses/ request of the page, as paths. */
function recordMockReads(page: Page) {
    const reads: string[] = []
    page.on("request", (r) => {
        const p = new URL(r.url()).pathname
        if (/^\/mock\/(roadmaps|syllabuses)\//.test(p)) reads.push(decodeURIComponent(p))
    })
    return reads
}
const picker = (page: Page) => page.getByLabel(vi.universityLabel, { exact: true })
const column = (page: Page, which: "prereqs" | "unlocks") => page.getByTestId(`roadmap-${which}`)
const columnCodes = (page: Page, which: "prereqs" | "unlocks") => column(page, which).locator("span.font-black").allTextContents()
// The suggestion list sits next to the search input (same wrapper).
const suggestions = (page: Page, placeholder: string) => page.getByPlaceholder(placeholder, { exact: true }).locator("xpath=..").locator("div.absolute button")
const suggestion = (page: Page, placeholder: string, code: string) =>
    suggestions(page, placeholder).filter({ has: page.locator("span", { hasText: new RegExp(`^${esc(code)}$`) }) })
const bannerTitle = (page: Page, name: string) => page.getByRole("heading", { level: 2, name, exact: true })

async function openRoadmap(page: Page) {
    await page.goto("/vi/roadmap", { waitUntil: "domcontentloaded" })
    // The picker is in the static HTML: wait until universities.json has filled it (hydrated + loaded).
    await expect(picker(page).locator("option")).toHaveCount(universities.length, { timeout: 30000 })
}

test.describe("v2.53 roadmap for every university with data", () => {
    test("fixtures: folders are universities, the fixed list matches them, cases exist", () => {
        expect(folders.length).toBeGreaterThanOrEqual(2)
        // Every roadmap folder belongs to a university of universities.json.
        expect(folders.filter((f) => !universities.some((u) => u.code === f))).toEqual([])
        expect(withData.map((u) => u.code)).toContain(DEFAULT_UNI)
        expect(withoutData.length).toBeGreaterThanOrEqual(1)
        expect(others.length).toBeGreaterThanOrEqual(1)
        // The fixed allow-list in code names exactly the folders (data and code must agree).
        const src = readFileSync(path.join(ROOT, "src", "features", "programs", "roadmapUniversities.ts"), "utf8")
        const listed = [...src.matchAll(/\["([A-Z0-9_]+)", \{ syllabus: (true|false)/g)].map((m) => [m[1], m[2] === "true"])
        expect(listed.map(([c]) => c).sort()).toEqual([...folders].sort())
        for (const [c, s] of listed) expect(s, `${c} syllabus flag`).toBe(hasSyllabi(c as string))
        // At least one non-default university has a course with a resolvable relation (so M1 checks real codes).
        expect(others.some((u) => { const r = fileOf(u.code, caseOf(u.code))!; return prereqsOf(r).length + unlocksOf(r).length > 0 })).toBe(true)
    })

    test("data: each index lists exactly its files, and no generator template code is left", () => {
        for (const uni of folders) {
            const idx = indexOf(uni)
            const files = readdirSync(path.join(ROADMAPS, uni)).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.slice(0, -5))
            expect(new Set(idx.map(fileName)).size, `${uni} index without duplicates`).toBe(idx.length)
            expect([...idx.map(fileName)].sort(), `${uni} index = files`).toEqual([...files].sort())
            for (const c of idx) {
                const r = fileOf(uni, c)!
                expect(r.code ?? r.subjectCode, `${uni}/${c} code`).toBe(c)
                // Template rows carry the generator's "<UNI>-<code>" prefix (v2.44 detector).
                expect(/^[A-Z]+-/.test(c), `${uni}/${c} template prefix`).toBe(false)
            }
        }
    })

    test("FPT stays the default and comes back unchanged after another university", async ({ page }) => {
        await openRoadmap(page)
        await expect(picker(page)).toHaveValue(DEFAULT_UNI)
        const fpt = universities.find((u) => u.code === DEFAULT_UNI)!
        await expect(picker(page).locator("option:checked")).toHaveText(`${fpt.name} (${fpt.code})`)
        await expect(page.getByPlaceholder(vi.searchPlaceholder, { exact: true })).toBeVisible()
        await expect(page.getByText(vi.popularSubjects, { exact: true })).toBeVisible()
        await expect(page.getByRole("button", { name: vi.viewSyllabus, exact: true })).toBeVisible()
        const defaultCode = DEFAULT_CODE
        await expect(bannerTitle(page, fileOf(DEFAULT_UNI, defaultCode)!.subjectName!)).toBeVisible({ timeout: 20000 })
        const chips = await page.getByText(vi.popularSubjects, { exact: true }).locator("..").getByRole("button").allTextContents()
        expect(chips.length).toBeGreaterThan(0)

        await picker(page).selectOption(others[0].code)
        await expect(page.getByText(vi.popularSubjects, { exact: true })).toHaveCount(0)
        await expect(page.getByPlaceholder(vi.searchPlaceholderCode, { exact: true })).toBeVisible()

        await picker(page).selectOption(DEFAULT_UNI)
        await expect(page.getByPlaceholder(vi.searchPlaceholder, { exact: true })).toBeVisible()
        await expect(bannerTitle(page, fileOf(DEFAULT_UNI, defaultCode)!.subjectName!)).toBeVisible({ timeout: 20000 })
        expect(await page.getByText(vi.popularSubjects, { exact: true }).locator("..").getByRole("button").allTextContents()).toEqual(chips)
        await expect(page.getByRole("button", { name: vi.viewSyllabus, exact: true })).toBeVisible()
    })

    for (const uni of others) {
        test(`${uni.code}: the course shows exactly its file's prerequisites/unlocks, reads only what it shows`, async ({ page }) => {
            const reads = recordMockReads(page)
            await openRoadmap(page)
            const syllabi = hasSyllabi(uni.code)
            const idx = indexOf(uni.code)
            await picker(page).selectOption(uni.code)

            // Default course = the first index code.
            await expect(bannerTitle(page, fileOf(uni.code, idx[0])!.subjectName!)).toBeVisible({ timeout: 20000 })
            await expect(page.getByText(vi.popularSubjects, { exact: true })).toHaveCount(0)

            // The generator prefix finds nothing.
            const box = page.getByPlaceholder(vi.searchPlaceholderCode, { exact: true })
            await box.fill(`${uni.code}-`)
            await expect(suggestions(page, vi.searchPlaceholderCode)).toHaveCount(0)

            const code = caseOf(uni.code)
            const file = fileOf(uni.code, code)!
            const q = code.toLowerCase()
            expect(idx.filter((c) => c.toLowerCase().includes(q)).slice(0, 8), "case is among the 8 suggestions").toContain(code)
            await box.fill(code)
            await suggestion(page, vi.searchPlaceholderCode, code).click()
            await expect(bannerTitle(page, file.subjectName!)).toBeVisible({ timeout: 20000 })

            const vars = { university: uni.name }
            for (const [which, list, title, hint] of [
                ["prereqs", prereqsOf(file), "prereqNotRecordedTitle", "prereqNotRecordedHint"],
                ["unlocks", unlocksOf(file), "unlockNotRecordedTitle", "unlockNotRecordedHint"],
            ] as const) {
                await expect.poll(() => columnCodes(page, which), `${which} = file`).toEqual(list)
                if (list.length === 0) {
                    await expect(column(page, which).getByText(vi[title], { exact: true })).toBeVisible()
                    await expect(column(page, which).getByText(fill(vi[hint], vars), { exact: true })).toBeVisible()
                }
            }
            await expect(page.getByText(fill(vi.flowStatsData, { prereqs: String(prereqsOf(file).length), unlocks: String(unlocksOf(file).length) }), { exact: true })).toBeVisible()
            // Never the "no prerequisites / final-stage course" claims of the full FPT graph.
            for (const k of ["noPrereqTitle", "terminalTitle"]) await expect(page.getByText(vi[k], { exact: true })).toHaveCount(0)

            // Syllabus honesty on this course: every action or none, and the note when none.
            const cards = prereqsOf(file).length + unlocksOf(file).length
            for (const [name, n] of [[vi.viewSyllabus, 1], [vi.viewScores, 1], [vi.syllabus, cards]] as const)
                await expect(page.getByRole("button", { name, exact: true }), name).toHaveCount(syllabi ? n : 0)
            await expect(page.getByText(fill(vi.noSyllabusNote, vars), { exact: true })).toHaveCount(syllabi ? 0 : 1)

            const visited = [idx[0], code]
            const firstRel = prereqsOf(file)[0] ?? unlocksOf(file)[0]
            if (firstRel) {
                const which = prereqsOf(file).length ? "prereqs" : "unlocks"
                await column(page, which).getByRole("button", { name: messages.vi.roadmap.changeFocus }).first().click()
                await expect(bannerTitle(page, fileOf(uni.code, firstRel)!.subjectName!)).toBeVisible({ timeout: 20000 })
                visited.push(firstRel)
            }

            // Only index.json + the visited course files (+ FPT's default load, + their syllabi where they exist).
            const fptReads = reads.filter((p) => p.startsWith(`/mock/roadmaps/${DEFAULT_UNI}/`) || p.startsWith(`/mock/syllabuses/${DEFAULT_UNI}/`))
            expect(fptReads.length).toBeLessThanOrEqual(3)
            const own = reads.filter((p) => !fptReads.includes(p))
            const allowed = new Set([`/mock/roadmaps/${uni.code}/index.json`, ...visited.map((c) => `/mock/roadmaps/${uni.code}/${fileName(c)}.json`)])
            if (syllabi) visited.forEach((c) => allowed.add(`/mock/syllabuses/${uni.code}/${fileName(c)}.json`))
            expect(own.filter((p) => !allowed.has(p)), "unexpected mock reads").toEqual([])
            expect(own.some((p) => p.startsWith("/mock/syllabuses/"))).toBe(syllabi)
        })
    }

    test("a university with syllabi opens its own syllabus; the modal does not claim missing relations", async ({ page }) => {
        const uni = others.find((u) => hasSyllabi(u.code))
        test.skip(!uni, "no non-default university with syllabi in the snapshot")
        const reads = recordMockReads(page)
        await openRoadmap(page)
        await picker(page).selectOption(uni!.code)
        const code = indexOf(uni!.code)[0]
        await expect(bannerTitle(page, fileOf(uni!.code, code)!.subjectName!)).toBeVisible({ timeout: 20000 })
        await page.getByRole("button", { name: vi.viewSyllabus, exact: true }).click()
        const dialog = page.getByRole("dialog")
        await expect(dialog).toBeVisible()
        await expect.poll(() => reads).toContain(`/mock/syllabuses/${uni!.code}/${fileName(code)}.json`)
        await dialog.getByRole("button", { name: new RegExp(`^${esc(messages.vi.syllabus.tabRoadmap)}`) }).click()
        const r = fileOf(uni!.code, code)!
        if (!prereqsOf(r).length) await expect(dialog.getByText(messages.vi.syllabus.noPrereqRecorded, { exact: true })).toBeVisible()
        if (!unlocksOf(r).length) await expect(dialog.getByText(messages.vi.syllabus.noUnlocksRecorded, { exact: true })).toBeVisible()
        for (const k of ["noPrereq", "noUnlocks"]) await expect(dialog.getByText(messages.vi.syllabus[k], { exact: true })).toHaveCount(0)
    })

    test("picker groups, and a university without roadmap data gets an honest empty state and no request", async ({ page }) => {
        const reads = recordMockReads(page)
        await openRoadmap(page)
        const values = (label: string) => picker(page).locator(`optgroup[label="${label}"] option`).evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))
        expect(await values(vi.universitiesWithData)).toEqual(withData.map((u) => u.code))
        expect(await values(vi.universitiesWithoutData)).toEqual(withoutData.map((u) => u.code))

        const before = reads.length
        const uni = withoutData[0]
        await picker(page).selectOption(uni.code)
        await expect(page.getByRole("heading", { level: 2, name: fill(vi.noDataTitle, { university: uni.name }), exact: true })).toBeVisible()
        await expect(page.getByText(fill(vi.noDataHint, { list: withData.map((u) => u.code).join(", ") }), { exact: true })).toBeVisible()
        for (const ph of [vi.searchPlaceholder, vi.searchPlaceholderCode]) await expect(page.getByPlaceholder(ph, { exact: true })).toHaveCount(0)
        for (const name of [vi.viewSyllabus, vi.viewScores]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0)
        await expect(page.getByTestId("roadmap-prereqs")).toHaveCount(0)
        await page.waitForTimeout(500)
        expect(reads.slice(before), "no roadmap/syllabus request for a university without data").toEqual([])
    })

    test("messages: the new roadmap/syllabus texts exist in vi and en", () => {
        const keys = {
            roadmap: ["universityLabel", "universitiesWithData", "universitiesWithoutData", "searchPlaceholderCode", "noDataTitle", "noDataHint", "noSyllabusNote", "flowStatsData", "prereqNotRecordedTitle", "prereqNotRecordedHint", "unlockNotRecordedTitle", "unlockNotRecordedHint"],
            syllabus: ["noPrereqRecorded", "noUnlocksRecorded"],
        }
        for (const [ns, list] of Object.entries(keys))
            for (const k of list) {
                expect(messages.vi[ns][k], `vi ${ns}.${k}`).toBeTruthy()
                expect(messages.en[ns][k], `en ${ns}.${k}`).toBeTruthy()
                expect(messages.vi[ns][k], `${ns}.${k} translated`).not.toBe(messages.en[ns][k])
            }
        for (const k of ["noDataTitle", "noSyllabusNote", "prereqNotRecordedHint", "unlockNotRecordedHint"])
            for (const l of ["vi", "en"] as Locale[]) expect(messages[l].roadmap[k]).toContain("{university}")
    })

    test("/vi/roadmap keeps its static HTML with the picker on the FPT default", () => {
        const html = readFileSync(path.join(ROOT, ".next", "server", "app", "vi", "roadmap.html"), "utf8")
        expect(html.match(/BAILOUT_TO_CLIENT_SIDE_RENDERING/g) ?? []).toEqual([])
        expect(html).toMatch(new RegExp(`<select[^>]*id="[^"]+"`))
        expect(html).toMatch(new RegExp(`<option value="${DEFAULT_UNI}" selected=""`))
        expect(html).toContain(vi.popularSubjects)
    })
})
