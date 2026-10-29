import { test, expect, type Page } from "@playwright/test"
import { existsSync, readdirSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.54 M3 — filler values are not shown as data.
 *
 * A displayed syllabus field whose value is the same in every file (or every
 * row of every file) of a university is filler, not data: the syllabus modal
 * and /roadmap do not show it. The list is kept by hand in
 * src/features/programs/roadmapUniversities.ts (SYLLABUS_FILLER); this spec
 * re-derives it from public/mock and fails when the two differ in either
 * direction, so the default university keeps every value. Roadmap fields that
 * are filler (a constant `credits`, an English name equal to the Vietnamese
 * one) are not displayed, and the roadmap passes no fixed credits/semester to
 * the syllabus modal. A comma-joined prerequisite entry ("A, B") shows as
 * separate codes; every other entry stays exactly as stored (display only).
 *
 * Fixtures come from public/mock at test time; nothing named is pinned beyond
 * the contract's FPT default (DONE.md v2.53 M2).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const vi = readJson(path.join(ROOT, "src", "messages", "vi.json"))
const vr: Record<string, string> = vi.roadmap
const vs: Record<string, string> = vi.syllabus
const vp: Record<string, string> = vi.programs

type Row = Record<string, unknown>
type Section = "assessments" | "clos" | "sessions" | "materials"
type Syllabus = { info: Row } & Partial<Record<Section, Row[]>>
type RoadmapFile = Row & { subjectName?: string; subjectEnglish?: string; directPrereqs?: string[]; prerequisites?: string[]; unlocks?: string[] }

// The contract's default (DONE.md v2.53 M2): FPT and its curated first course.
const DEFAULT_UNI = "FPT"
const DEFAULT_CODE = "SWE201c"
// Same file-name rule as the fetchers in src/features/programs/api.ts.
const fileName = (code: string) => code.replace(/[^a-zA-Z0-9_\-]/g, "_")
const dirs = (p: string) => readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
const syllabusUnis = dirs(path.join(MOCK, "syllabuses"))
const roadmapUnis = dirs(path.join(MOCK, "roadmaps"))
const universityCount = (readJson(path.join(MOCK, "universities.json")) as unknown[]).length
const indexOf = (uni: string): string[] => readJson(path.join(MOCK, "roadmaps", uni, "index.json"))
const hasRoadmap = (uni: string, code: string) => existsSync(path.join(MOCK, "roadmaps", uni, `${fileName(code)}.json`))
const roadmapOf = (uni: string, code: string): RoadmapFile | null =>
    hasRoadmap(uni, code) ? readJson(path.join(MOCK, "roadmaps", uni, `${fileName(code)}.json`)) : null
const syllabusOf = (uni: string, code: string): Syllabus | null => {
    const f = path.join(MOCK, "syllabuses", uni, `${fileName(code)}.json`)
    return existsSync(f) ? readJson(f) : null
}
const prereqsOf = (r: RoadmapFile) => r.directPrereqs ?? r.prerequisites ?? []
const unlocksOf = (r: RoadmapFile) => r.unlocks ?? []
const splitEntry = (entry: string) => entry.split(",").map((s) => s.trim()).filter(Boolean)
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k])
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
// A message as a "starts with its fixed text" pattern (e.g. any pass score, any scale).
const startsWith = (msg: string) => new RegExp(`^${esc(msg.split("{")[0].trim())}`)
const semesterBadge = new RegExp(`^${esc(vs.semesterBadge).replace(esc("{n}"), "\\d+")}$`)

// Syllabus fields the modal or /roadmap render (info.scoringScale = the modal's scale badge).
const DISPLAYED: Record<"info" | Section, string[]> = {
    info: ["syllabusName", "syllabusEnglish", "credits", "decisionNo", "minAvgToPass", "prerequisite", "scoringScale", "note", "timeAllocation", "studentTasks", "description"],
    assessments: ["category", "type", "part", "weight", "completionCriteria", "duration", "questionType"],
    clos: ["cloName", "loDetails"],
    sessions: ["sessionNo", "topic", "learningTeachingType", "studentTasks"],
    materials: ["materialDescription", "author", "publisher", "isbn"],
}

/** "section.field" of every displayed field with one and the same non-empty value in every file (info) or every row (lists). */
function constantDisplayed(files: Syllabus[]): string[] {
    const out: string[] = []
    for (const [section, fields] of Object.entries(DISPLAYED)) {
        const rows: Row[] = section === "info" ? files.map((f) => f.info ?? {}) : files.flatMap((f) => f[section as Section] ?? [])
        for (const k of fields) {
            const values = new Set(rows.map((r) => JSON.stringify(r[k] ?? null)))
            const [only] = values
            if (rows.length > 0 && values.size === 1 && only !== "null" && only !== '""') out.push(`${section}.${k}`)
        }
    }
    return out.sort()
}
/** The filler fields of a university as its syllabi say (not as the code's table says). */
const derivedFiller = (uni: string) => {
    const dir = path.join(MOCK, "syllabuses", uni)
    return constantDisplayed(readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => readJson(path.join(dir, f))))
}

// The hand-kept list in code: `["<UNI>", { info: [...], sessions: [...] }]` entries of SYLLABUS_FILLER.
const helperSrc = readFileSync(path.join(ROOT, "src", "features", "programs", "roadmapUniversities.ts"), "utf8")
const quoted = (s: string) => [...s.matchAll(/"(\w+)"/g)].map((m) => m[1])
const fillerTable: Record<string, string[]> = Object.fromEntries(
    [...helperSrc.matchAll(/\["([A-Z0-9_]+)", \{ info: \[([^\]]*)\], sessions: \[([^\]]*)\] \}\]/g)].map((m) => [
        m[1],
        [...quoted(m[2]).map((k) => `info.${k}`), ...quoted(m[3]).map((k) => `sessions.${k}`)].sort(),
    ])
)

const picker = (page: Page) => page.getByLabel(vr.universityLabel, { exact: true })
const column = (page: Page, which: "prereqs" | "unlocks") => page.getByTestId(`roadmap-${which}`)
const columnCodes = (page: Page, which: "prereqs" | "unlocks") => column(page, which).locator("span.font-black").allTextContents()
const bannerTitle = (page: Page, name: string) => page.getByRole("heading", { level: 2, name, exact: true })
const placeholderOf = (uni: string) => (uni === DEFAULT_UNI ? vr.searchPlaceholder : vr.searchPlaceholderCode)

async function openRoadmap(page: Page, uni: string) {
    await page.goto("/vi/roadmap", { waitUntil: "domcontentloaded" })
    // The picker is in the static HTML: wait until universities.json has filled it (hydrated + loaded).
    await expect(picker(page).locator("option")).toHaveCount(universityCount, { timeout: 30000 })
    if (uni !== DEFAULT_UNI) await picker(page).selectOption(uni)
    await expect(bannerTitle(page, roadmapOf(uni, uni === DEFAULT_UNI ? DEFAULT_CODE : indexOf(uni)[0])!.subjectName!)).toBeVisible({ timeout: 20000 })
}

/** Moves the focus to `code` through the search box (its suggestion), unless it is already the focus. */
async function goToCourse(page: Page, uni: string, code: string) {
    const ph = placeholderOf(uni)
    expect(indexOf(uni).filter((c) => c.toLowerCase().includes(code.toLowerCase())).slice(0, 8), "course among the 8 suggestions").toContain(code)
    await page.getByPlaceholder(ph, { exact: true }).fill(code)
    await page
        .getByPlaceholder(ph, { exact: true })
        .locator("xpath=..")
        .locator("div.absolute button")
        .filter({ has: page.locator("span", { hasText: new RegExp(`^${esc(code)}$`) }) })
        .click()
    await expect(page.getByRole("heading", { level: 3, name: roadmapOf(uni, code)!.subjectName!, exact: true })).toBeVisible({ timeout: 20000 })
}

test.describe("v2.54 filler values are not shown as data", () => {
    test("data: the filler list in code is exactly the displayed syllabus fields with one value per university", () => {
        test.setTimeout(300000) // reads every syllabus file once (~3,000)
        expect(Object.keys(fillerTable).length, "SYLLABUS_FILLER entries parsed from roadmapUniversities.ts").toBeGreaterThan(0)
        for (const uni of Object.keys(fillerTable)) expect(syllabusUnis, `${uni} has syllabi`).toContain(uni)
        for (const uni of syllabusUnis) {
            const dir = path.join(MOCK, "syllabuses", uni)
            const files: Syllabus[] = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => readJson(path.join(dir, f)))
            const derived = constantDisplayed(files)
            test.info().annotations.push({ type: `${uni} (${files.length} syllabi) filler`, description: derived.join(", ") || "none" })
            // Each hidden field really is one value in every file, and every such displayed field is hidden.
            expect(fillerTable[uni] ?? [], `${uni}: hidden fields = displayed fields with one value`).toEqual(derived)
        }
        expect(fillerTable[DEFAULT_UNI], "the default university hides nothing").toBeUndefined()
    })

    test("filler: /roadmap and the syllabus modal show the real values and none of the filler", async ({ page }) => {
        test.setTimeout(300000) // derives the filler from the syllabus files (~3,000), like the data test
        // From the data, so the UI is checked even when the code's table is missing or wrong.
        const derived = new Map(roadmapUnis.filter((u) => syllabusUnis.includes(u)).map((u) => [u, derivedFiller(u)]))
        const uni = [...derived.keys()].find((u) => derived.get(u)!.length > 0)
        test.skip(!uni, "no university with filler syllabus fields and roadmap data")
        const filler = derived.get(uni!)!
        // First index course with a syllabus that has sessions, an English name, and credits other than its roadmap file's.
        const code = indexOf(uni!).find((c) => {
            const s = syllabusOf(uni!, c)
            return !!s && (s.sessions?.length ?? 0) > 0 && !!s.info.syllabusEnglish && String(s.info.credits) !== String(roadmapOf(uni!, c)?.credits)
        })
        expect(code, "a course to check").toBeTruthy()
        const syl = syllabusOf(uni!, code!)!
        const roadmapCredits = String(roadmapOf(uni!, code!)!.credits)
        const info = (k: string) => String(syl.info[k])

        await openRoadmap(page, uni!)
        if (code !== indexOf(uni!)[0]) await goToCourse(page, uni!, code!)
        // Real values from the syllabus file are shown (they also prove it has loaded).
        await expect(page.getByText(fill(vp.credits, { count: info("credits") }), { exact: true })).toBeVisible({ timeout: 20000 })
        await expect(page.getByText(info("syllabusEnglish"), { exact: true })).toBeVisible()
        // Filler is not: no pass score, no decision line, no filler value, not the roadmap file's credits.
        await expect(page.getByText(startsWith(vr.passScore))).toHaveCount(0)
        await expect(page.getByText(startsWith(vr.decisionNo))).toHaveCount(0)
        for (const f of filler.filter((x) => x.startsWith("info."))) await expect(page.getByText(info(f.slice(5)), { exact: true }), f).toHaveCount(0)
        await expect(page.getByText(fill(vp.credits, { count: roadmapCredits }), { exact: true })).toHaveCount(0)

        await page.getByRole("button", { name: vr.viewSyllabus, exact: true }).click()
        const dialog = page.getByRole("dialog")
        await expect(dialog.getByRole("heading", { level: 2, name: info("syllabusName"), exact: true })).toBeVisible({ timeout: 20000 })
        await expect(dialog.getByText(info("syllabusEnglish"), { exact: true })).toBeVisible()
        for (const label of [vs.decisionNo, vs.passScore]) await expect(dialog.getByText(label, { exact: true }), label).toHaveCount(0)
        await expect(dialog.getByText(startsWith(vs.scoringScale))).toHaveCount(0)
        for (const f of filler.filter((x) => x.startsWith("info."))) await expect(dialog.getByText(info(f.slice(5)), { exact: true }), f).toHaveCount(0)
        // The roadmap no longer hands the modal a fixed semester/credits.
        await expect(dialog.getByText(semesterBadge)).toHaveCount(0)
        await expect(dialog.getByText(fill(vp.credits, { count: roadmapCredits }), { exact: true })).toHaveCount(0)

        const sessions = syl.sessions!
        await dialog.getByRole("button", { name: new RegExp(`^${esc(vs.tabSessions)}`) }).click()
        await expect(dialog.getByText(fill(vs.sessionsTitle, { count: String(sessions.length) }), { exact: true })).toBeVisible()
        await expect(dialog.getByText(fill(vs.sessionNo, { n: String(sessions[0].sessionNo) }), { exact: true }).first()).toBeVisible()
        for (const f of filler.filter((x) => x.startsWith("sessions."))) {
            for (const v of new Set(sessions.map((s) => String(s[f.slice(9)])))) await expect(dialog.getByText(v, { exact: true }), f).toHaveCount(0)
        }
        if (filler.includes("sessions.studentTasks")) await expect(dialog.getByText(vs.prepTasks, { exact: true })).toHaveCount(0)
    })

    test("the default university keeps its real values: credits, pass score, decision no., English name, scale", async ({ page }) => {
        const syl = syllabusOf(DEFAULT_UNI, DEFAULT_CODE)!
        const info = (k: string) => String(syl.info[k])
        // Fixture: the default course carries every value checked below.
        for (const k of ["credits", "minAvgToPass", "decisionNo", "syllabusEnglish", "scoringScale"]) expect(syl.info[k], k).toBeTruthy()
        expect(syl.sessions?.[0]?.learningTeachingType, "session type").toBeTruthy()

        await openRoadmap(page, DEFAULT_UNI)
        await expect(page.getByText(fill(vp.credits, { count: info("credits") }), { exact: true })).toBeVisible({ timeout: 20000 })
        await expect(page.getByText(fill(vr.passScore, { score: info("minAvgToPass") }), { exact: true })).toBeVisible()
        await expect(page.getByText(info("syllabusEnglish"), { exact: true })).toBeVisible()
        await expect(page.getByText(info("decisionNo"), { exact: true })).toBeVisible()

        await page.getByRole("button", { name: vr.viewSyllabus, exact: true }).click()
        const dialog = page.getByRole("dialog")
        await expect(dialog.getByRole("heading", { level: 2, name: info("syllabusName"), exact: true })).toBeVisible({ timeout: 20000 })
        await expect(dialog.getByText(info("syllabusEnglish"), { exact: true })).toBeVisible()
        await expect(dialog.getByText(info("decisionNo"), { exact: true })).toBeVisible()
        await expect(dialog.getByText(vs.passScore, { exact: true })).toBeVisible()
        await expect(dialog.getByText(`≥ ${info("minAvgToPass")} / 10`, { exact: true })).toBeVisible()
        await expect(dialog.getByText(fill(vs.scoringScale, { scale: info("scoringScale") }), { exact: true })).toBeVisible()
        await dialog.getByRole("button", { name: new RegExp(`^${esc(vs.tabSessions)}`) }).click()
        await expect(dialog.getByText(String(syl.sessions![0].learningTeachingType), { exact: true }).first()).toBeVisible()
    })

    test("an English name equal to the Vietnamese one is not shown as a translation", async ({ page }) => {
        // A university without syllabi whose first course stores the same text as its English and Vietnamese name.
        const uni = roadmapUnis.find((u) => {
            if (u === DEFAULT_UNI || syllabusUnis.includes(u)) return false
            const r = roadmapOf(u, indexOf(u)[0])!
            return !!r.subjectEnglish && r.subjectEnglish === r.subjectName
        })
        test.skip(!uni, "no roadmap course whose English name equals its Vietnamese name")
        const name = roadmapOf(uni!, indexOf(uni!)[0])!.subjectName!
        await openRoadmap(page, uni!)
        // The banner's text block holds the title and, where a syllabus gives one, an English line: here only the title.
        await expect(bannerTitle(page, name).locator("xpath=..").getByText(name, { exact: true })).toHaveCount(1)
    })

    test("a comma-joined prerequisite entry shows as separate codes; other entries stay as stored", async ({ page }) => {
        test.setTimeout(120000)
        // First university/course storing a prerequisite entry as "A, B", and one storing an entry that is neither a list nor a file.
        let found: { uni: string; joined: string; stored?: string } | undefined
        // Non-default universities first: the default (full graph) is scanned only if none has such an entry.
        for (const uni of [...roadmapUnis].sort((x, y) => Number(x === DEFAULT_UNI) - Number(y === DEFAULT_UNI))) {
            let joined: string | undefined
            let stored: string | undefined
            for (const c of indexOf(uni)) {
                const p = prereqsOf(roadmapOf(uni, c)!)
                if (!joined && p.some((e) => e.includes(","))) joined = c
                if (!stored && p.some((e) => !e.includes(",") && !hasRoadmap(uni, e))) stored = c
                if (joined && stored) break
            }
            if (joined) {
                found = { uni, joined, stored }
                break
            }
        }
        test.skip(!found, "no comma-joined prerequisite entry in the snapshot")
        const { uni, joined, stored } = found!
        const file = roadmapOf(uni, joined)!
        const parts = prereqsOf(file).flatMap(splitEntry)
        expect(parts.length).toBeGreaterThan(prereqsOf(file).length)

        await openRoadmap(page, uni)
        await goToCourse(page, uni, joined)
        await expect.poll(() => columnCodes(page, "prereqs"), "one card per code").toEqual(parts)
        await expect(column(page, "prereqs").getByText(fill(vr.courseCount, { count: String(parts.length) }), { exact: true })).toBeVisible()
        const counts = { prereqs: String(parts.length), unlocks: String(unlocksOf(file).length) }
        await expect(page.getByText(new RegExp(`^(${esc(fill(vr.flowStats, counts))}|${esc(fill(vr.flowStatsData, counts))})$`))).toBeVisible()

        // Each code is its own focus target.
        const target = parts.find((p) => hasRoadmap(uni, p))
        if (target) {
            await column(page, "prereqs").getByRole("button", { name: vr.changeFocus, exact: true }).nth(parts.indexOf(target)).click()
            await expect(page.getByRole("heading", { level: 3, name: roadmapOf(uni, target)!.subjectName!, exact: true })).toBeVisible({ timeout: 20000 })
        }

        if (stored) {
            const kept = prereqsOf(roadmapOf(uni, stored)!)
            await goToCourse(page, uni, stored)
            await expect.poll(() => columnCodes(page, "prereqs"), "entries without a comma shown as stored").toEqual(kept.flatMap(splitEntry))
            for (const e of kept.filter((x) => !x.includes(","))) expect(await columnCodes(page, "prereqs")).toContain(e)
        }
    })
})
