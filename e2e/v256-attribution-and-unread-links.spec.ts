import { test, expect, type Locator, type Page } from "@playwright/test"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import path from "path"

/**
 * v2.56 — attribution on every data surface + publish only what the UI shows (audit 2026-10-30 V2, AGENTS.md §9).
 *
 * Attribution: /roadmap (every university with roadmap data), /materials (FPT) and the syllabus modal (opened from
 * /roadmap and from a program's curriculum row) say where the course data comes from — the university's name
 * (universities.json) and the official host of the fixture table below (= the contract, DONE.md v2.56; for FPT also
 * the unofficial mirror it was collected through) — and when: an FPT syllabus' `info.lastSeenAt` date, otherwise
 * "not recorded" (no roadmap file, no materials file and no TDTU syllabus carries a date). A university outside the
 * table gets no attribution. For NEU/TDTU/UIT the table is cross-checked on the data: most roadmap codes are course
 * codes of that university's programs, and those programs' source host is the one named.
 * Unread links: no syllabus publishes the 7 fields no page reads that carried course-file links (FLM /download/,
 * Google Drive, SharePoint); every such link string left sits in a field the modal displays. The FPT modal still
 * shows the sessions, materials and CLOs of its file; with V256_TEXT_DUMP=<dir> it also writes their visible text,
 * so a run on the Base tree and a run on this tree can be compared line by line.
 * Documents tab: the extracted-text length is a localized character count (was "<n> KB text").
 *
 * Fixtures come from public/mock at test time (nothing named beyond the contract's FPT default course): the FPT
 * course for the content check = the roadmap-indexed FPT syllabus with the most sessions (then by code); the TDTU
 * course = the first TDTU index code with a syllabus; the NEU program = the first listed NEU program whose
 * curriculum has a course with an NEU roadmap file; the "outside the table" program = the first listed program of
 * another university with a curriculum; the documents program = the first listed program with a raw document of
 * ≥ 1,000 extracted characters. Messages come from src/messages and must exist. domcontentloaded, not networkidle
 * (AGENTS.md §12).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
type Locale = "vi" | "en"
type Messages = Record<string, Record<string, string | undefined>>
const messages: Record<Locale, Messages> = {
    vi: readJson(path.join(ROOT, "src", "messages", "vi.json")),
    en: readJson(path.join(ROOT, "src", "messages", "en.json")),
}
/** A message that must exist (a missing key fails the test instead of comparing undefined with undefined). */
const msg = (locale: Locale, ns: string, key: string): string => {
    const m = messages[locale][ns]?.[key]
    if (typeof m !== "string" || m.length === 0) throw new Error(`missing message ${locale}.${ns}.${key}`)
    return m
}
const ATTRIBUTION_KEYS = ["source", "sourceVia", "collected", "collectedNotRecorded"]

// The contract (DONE.md v2.56): the official host of each university's course data, and the unofficial mirror it
// was collected through when it was not collected from the host itself (evidence: courseDataSources.ts comments).
const SOURCES: Record<string, { host: string; via?: string }> = {
    FPT: { host: "flm.fpt.edu.vn", via: "syllabase.online" },
    NEU: { host: "courses.neu.edu.vn" },
    TDTU: { host: "cktt-cdr.tdtu.edu.vn" },
    UIT: { host: "daa.uit.edu.vn" },
}
// The contract's roadmap default (DONE.md v2.53 M2).
const DEFAULT_UNI = "FPT"
const DEFAULT_CODE = "SWE201c"

// Not published since v2.56: no page reads them and they carried course-file links.
const UNPUBLISHED = { top: ["files"], info: ["tools"], materials: ["note"], sessions: ["downloadUrls", "urls", "sDownload", "studentMaterials"] }
// Syllabus fields the modal or /roadmap display (as in e2e/v254-filler-values.spec.ts).
const DISPLAYED: Record<string, string[]> = {
    info: ["syllabusName", "syllabusEnglish", "credits", "decisionNo", "minAvgToPass", "prerequisite", "scoringScale", "note", "timeAllocation", "studentTasks", "description"],
    assessments: ["category", "type", "part", "weight", "completionCriteria", "duration", "questionType"],
    clos: ["cloName", "loDetails"],
    sessions: ["sessionNo", "topic", "learningTeachingType", "studentTasks"],
    materials: ["materialDescription", "author", "publisher", "isbn"],
}
const COURSE_FILE_LINK = /drive\.google\.com|sharepoint\.com|\/download\//i

type Row = Record<string, unknown>
type Syllabus = { info: Row; clos?: Row[]; sessions?: Row[]; materials?: Row[] } & Row
type Program = { id: string; name: string; universityId: string; sourceUrl?: string | null }
type Uni = { id: string; code: string; name: string }

const fileName = (code: string) => code.replace(/[^a-zA-Z0-9_\-]/g, "_")
const dirs = (p: string) => readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
const jsonFiles = (p: string) => readdirSync(p).filter((f) => f.endsWith(".json"))
const universities: Uni[] = readJson(path.join(MOCK, "universities.json"))
const uniByCode = (code: string) => universities.find((u) => u.code === code)!
const roadmapUnis = dirs(path.join(MOCK, "roadmaps"))
const syllabusUnis = dirs(path.join(MOCK, "syllabuses"))
const materialUnis = jsonFiles(path.join(MOCK, "materials")).map((f) => f.slice(0, -5))
const indexOf = (uni: string): string[] => readJson(path.join(MOCK, "roadmaps", uni, "index.json"))
const roadmapPath = (uni: string, code: string) => path.join(MOCK, "roadmaps", uni, `${fileName(code)}.json`)
const roadmapOf = (uni: string, code: string): Row & { subjectName?: string } => readJson(roadmapPath(uni, code))
const syllabusPath = (uni: string, code: string) => path.join(MOCK, "syllabuses", uni, `${fileName(code)}.json`)
const syllabusOf = (uni: string, code: string): Syllabus => readJson(syllabusPath(uni, code))
const listed: Program[] = (readJson(path.join(MOCK, "index.json")).chunks as string[]).flatMap((c) => readJson(path.join(MOCK, "programs", c)))
const curriculaOf = (id: string): Row[] | null => {
    const f = path.join(MOCK, "curricula", `${id}.json`)
    return existsSync(f) ? readJson(f) : null
}
const hostOf = (url: string | null | undefined) => {
    try {
        return new URL(url ?? "").hostname
    } catch {
        return ""
    }
}
const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim()
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k])
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const sourceText = (locale: Locale, uni: string) => {
    const s = SOURCES[uni]
    return fill(msg(locale, "dataSource", s.via ? "sourceVia" : "source"), { university: uniByCode(uni).name, host: s.host, via: s.via ?? "" })
}
/** The date part of the ISO timestamp as written: vi DD/MM/YYYY, en YYYY-MM-DD; none → "not recorded". */
const dateText = (locale: Locale, iso: unknown) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof iso === "string" ? iso : "")
    if (!m) return msg(locale, "dataSource", "collectedNotRecorded")
    return fill(msg(locale, "dataSource", "collected"), { date: locale === "vi" ? `${m[3]}/${m[2]}/${m[1]}` : `${m[1]}-${m[2]}-${m[3]}` })
}

async function expectAttribution(scope: Page | Locator, locale: Locale, uni: string, collectedAt: unknown) {
    const box = scope.getByTestId("data-attribution")
    await expect(box).toHaveCount(1, { timeout: 20000 })
    // The university name arrives with universities.json: wait for the full text.
    await expect(box.getByTestId("data-attribution-source")).toHaveText(sourceText(locale, uni), { timeout: 20000 })
    await expect(box.getByTestId("data-attribution-date")).toHaveText(dateText(locale, collectedAt))
    await expect(box).toBeVisible()
}

const picker = (page: Page, locale: Locale) => page.getByLabel(msg(locale, "roadmap", "universityLabel"), { exact: true })
const bannerTitle = (page: Page, name: string) => page.getByRole("heading", { level: 2, name, exact: true })

async function openRoadmap(page: Page, uni: string, locale: Locale = "vi") {
    await page.goto(`/${locale}/roadmap`, { waitUntil: "domcontentloaded" })
    // The picker is in the static HTML: wait until universities.json has filled it (hydrated + loaded).
    await expect(picker(page, locale).locator("option")).toHaveCount(universities.length, { timeout: 30000 })
    if (uni !== DEFAULT_UNI) await picker(page, locale).selectOption(uni)
    await expect(bannerTitle(page, roadmapOf(uni, uni === DEFAULT_UNI ? DEFAULT_CODE : indexOf(uni)[0]).subjectName!)).toBeVisible({ timeout: 20000 })
}

/** Moves the /roadmap focus to `code` through the search box (its suggestion), unless it already is the focus. */
async function goToCourse(page: Page, uni: string, code: string) {
    const current = uni === DEFAULT_UNI ? DEFAULT_CODE : indexOf(uni)[0]
    if (code === current) return
    const ph = msg("vi", "roadmap", uni === DEFAULT_UNI ? "searchPlaceholder" : "searchPlaceholderCode")
    expect(indexOf(uni).filter((c) => c.toLowerCase().includes(code.toLowerCase())).slice(0, 8), "course among the 8 suggestions").toContain(code)
    await page.getByPlaceholder(ph, { exact: true }).fill(code)
    await page
        .getByPlaceholder(ph, { exact: true })
        .locator("xpath=..")
        .locator("div.absolute button")
        .filter({ has: page.locator("span", { hasText: new RegExp(`^${esc(code)}$`) }) })
        .click()
    await expect(page.getByRole("heading", { level: 3, name: roadmapOf(uni, code).subjectName!, exact: true })).toBeVisible({ timeout: 20000 })
}

/** Opens the syllabus modal of the /roadmap focus course and waits for its file's title. */
async function openSyllabusModal(page: Page, syl: Syllabus, locale: Locale = "vi"): Promise<Locator> {
    await page.getByRole("button", { name: msg(locale, "roadmap", "viewSyllabus"), exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { level: 2, name: String(syl.info.syllabusName), exact: true })).toBeVisible({ timeout: 20000 })
    return dialog
}

const dialogNamed = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

/** Opens a program's detail dialog, its curriculum tab, and the syllabus modal of the row of `code` (else the first row). */
async function openCourseFromProgram(page: Page, p: Program, code?: string): Promise<Locator> {
    await page.goto(`/vi?program=${p.id}`, { waitUntil: "domcontentloaded" })
    const detail = dialogNamed(page, p.name)
    await expect(detail).toBeVisible({ timeout: 30000 })
    await detail.getByRole("tab", { name: msg("vi", "programs", "curriculumTab"), exact: true }).click()
    const rows = detail.locator("tbody tr")
    const row = code ? rows.filter({ has: page.locator("td span.font-black", { hasText: new RegExp(`^${esc(code)}$`) }) }).first() : rows.first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.click()
    const dialogs = page.getByRole("dialog")
    await expect(dialogs).toHaveCount(2, { timeout: 15000 })
    return dialogs.nth(1)
}

// ---- fixtures (from public/mock) ----
const fptCase = (() => {
    const rows = indexOf(DEFAULT_UNI)
        .filter((c) => existsSync(syllabusPath(DEFAULT_UNI, c)))
        .map((c) => ({ c, s: syllabusOf(DEFAULT_UNI, c) }))
        .filter(({ s }) => (s.sessions?.length ?? 0) > 0 && (s.materials?.length ?? 0) > 0 && (s.clos?.length ?? 0) > 0)
        .sort((a, b) => b.s.sessions!.length - a.s.sessions!.length || (a.c < b.c ? -1 : a.c > b.c ? 1 : 0))
    return rows[0] ?? null
})()
const neuCase = (() => {
    const uni = uniByCode("NEU")
    if (!uni || !roadmapUnis.includes("NEU")) return null
    for (const p of listed.filter((r) => r.universityId === uni.id)) {
        const course = curriculaOf(p.id)?.find((c) => typeof c.courseCode === "string" && c.courseCode && existsSync(roadmapPath("NEU", c.courseCode)))
        if (course) return { program: p, code: course.courseCode as string }
    }
    return null
})()
const outsideCase = (() => {
    const ids = new Set(universities.filter((u) => !(u.code in SOURCES)).map((u) => u.id))
    return listed.find((r) => ids.has(r.universityId) && (curriculaOf(r.id)?.length ?? 0) > 0) ?? null
})()
type Doc = { extractedTextLength: number | null }
const docCase = (() => {
    for (const p of listed) {
        const f = path.join(MOCK, "raw-documents", `${p.id}.json`)
        if (!existsSync(f)) continue
        const docs: Doc[] = readJson(f)
        if (docs.some((d) => (d.extractedTextLength ?? 0) >= 1000)) return { program: p, docs }
    }
    return null
})()

test.describe("v2.56 — attribution on every data surface + publish only what the UI shows", () => {
    test.describe.configure({ timeout: 120000 })

    test("fixtures: each case exists in the snapshot", () => {
        expect(fptCase, "an FPT syllabus with sessions, materials and CLOs").not.toBeNull()
        expect(neuCase, "an NEU program course with a roadmap file").not.toBeNull()
        expect(outsideCase, "a program with a curriculum outside the source table").not.toBeNull()
        expect(docCase, "a raw document with ≥ 1,000 extracted characters").not.toBeNull()
    })

    test("messages: the new copy exists in vi and en with its placeholders", () => {
        for (const locale of ["vi", "en"] as Locale[]) {
            for (const k of ATTRIBUTION_KEYS) msg(locale, "dataSource", k)
            for (const v of ["{university}", "{host}"]) {
                expect(msg(locale, "dataSource", "source")).toContain(v)
                expect(msg(locale, "dataSource", "sourceVia")).toContain(v)
            }
            expect(msg(locale, "dataSource", "sourceVia")).toContain("{via}")
            expect(msg(locale, "dataSource", "collected")).toContain("{date}")
            expect(msg(locale, "programs", "rawDocTextLength")).toContain("{count")
        }
        expect(Object.keys(messages.en.dataSource).sort()).toEqual(Object.keys(messages.vi.dataSource).sort())
        // The vi count is a grouped number ("12.345"), the en one a plural.
        expect(msg("vi", "programs", "rawDocTextLength")).toContain("{count, number}")
        expect(msg("en", "programs", "rawDocTextLength")).toContain("{count, plural,")
    })

    test("data: no syllabus publishes an unread course-file field; link strings sit only in displayed fields", () => {
        const unread: string[] = []
        const misplaced: string[] = []
        let files = 0
        let sessions = 0
        let materials = 0
        let clos = 0
        const walk = (value: unknown, keys: string[], where: string) => {
            if (Array.isArray(value)) value.forEach((v) => walk(v, keys, where))
            else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, [...keys, k], where)
            else if (typeof value === "string" && COURSE_FILE_LINK.test(value)) {
                const shown = keys.length === 2 && !!DISPLAYED[keys[0]]?.includes(keys[1])
                if (!shown) misplaced.push(`${where} ${keys.join(".")}`)
            }
        }
        for (const uni of syllabusUnis) {
            for (const f of jsonFiles(path.join(MOCK, "syllabuses", uni))) {
                const where = `${uni}/${f}`
                const s: Syllabus = readJson(path.join(MOCK, "syllabuses", uni, f))
                files++
                for (const k of UNPUBLISHED.top) if (k in s) unread.push(`${where} ${k}`)
                for (const k of UNPUBLISHED.info) if (k in (s.info ?? {})) unread.push(`${where} info.${k}`)
                for (const sec of ["materials", "sessions"] as const) {
                    for (const row of s[sec] ?? []) for (const k of UNPUBLISHED[sec]) if (k in row) unread.push(`${where} ${sec}[].${k}`)
                }
                sessions += s.sessions?.length ?? 0
                materials += s.materials?.length ?? 0
                clos += s.clos?.length ?? 0
                walk(s, [], where)
            }
        }
        // The displayed content is still there.
        expect(files).toBeGreaterThan(1000)
        for (const [label, n] of [["sessions", sessions], ["materials", materials], ["clos", clos]] as const) expect(n, label).toBeGreaterThan(0)
        expect(unread.slice(0, 20), `${unread.length} unread course-file fields published`).toEqual([])
        expect(misplaced.slice(0, 20), `${misplaced.length} course-file links outside a displayed field`).toEqual([])
    })

    test("data: the source table covers every university with course data, matches the code, and its hosts are the courses' sources", () => {
        const withData = [...new Set([...roadmapUnis, ...syllabusUnis, ...materialUnis])].sort()
        expect(Object.keys(SOURCES).sort()).toEqual(withData)
        // The code's table says the same as the contract.
        const src = readFileSync(path.join(ROOT, "src", "features", "programs", "courseDataSources.ts"), "utf8")
        const inCode = Object.fromEntries(
            [...src.matchAll(/\["([A-Z0-9_]+)", \{ host: "([^"]+)"(?:, via: "([^"]+)")? \}\]/g)].map((m) => [m[1], m[3] ? { host: m[2], via: m[3] } : { host: m[2] }])
        )
        expect(inCode).toEqual(SOURCES)
        // NEU/TDTU/UIT: most roadmap codes are course codes of the university's programs, whose source host is the one named.
        for (const uni of roadmapUnis.filter((u) => u !== DEFAULT_UNI)) {
            const id = uniByCode(uni).id
            const hostsOfCode = new Map<string, string[]>()
            for (const p of listed.filter((r) => r.universityId === id)) {
                for (const c of curriculaOf(p.id) ?? []) {
                    if (typeof c.courseCode !== "string" || !c.courseCode.trim()) continue
                    const k = c.courseCode.trim()
                    hostsOfCode.set(k, [...(hostsOfCode.get(k) ?? []), hostOf(p.sourceUrl)])
                }
            }
            const codes = indexOf(uni)
            const matched = codes.filter((c) => hostsOfCode.has(c.trim()))
            expect(matched.length / codes.length, `${uni}: ${matched.length}/${codes.length} roadmap codes in its curricula`).toBeGreaterThan(0.5)
            const tally = new Map<string, number>()
            for (const c of matched) for (const h of new Set(hostsOfCode.get(c.trim()))) tally.set(h, (tally.get(h) ?? 0) + 1)
            const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0]
            expect(top, `${uni}: the source host of the programs holding its roadmap codes`).toBe(SOURCES[uni].host)
        }
    })

    test("/roadmap: every university with roadmap data names its source, no date is recorded; a university without data names none", async ({ page }) => {
        await openRoadmap(page, DEFAULT_UNI)
        await expectAttribution(page, "vi", DEFAULT_UNI, null)
        for (const uni of roadmapUnis.filter((u) => u !== DEFAULT_UNI)) {
            await picker(page, "vi").selectOption(uni)
            await expect(bannerTitle(page, roadmapOf(uni, indexOf(uni)[0]).subjectName!)).toBeVisible({ timeout: 20000 })
            await expectAttribution(page, "vi", uni, null)
        }
        const without = universities.find((u) => !roadmapUnis.includes(u.code))!
        await picker(page, "vi").selectOption(without.code)
        await expect(page.getByRole("heading", { level: 2, name: fill(msg("vi", "roadmap", "noDataTitle"), { university: without.name }), exact: true })).toBeVisible()
        await expect(page.getByTestId("data-attribution")).toHaveCount(0)
    })

    test("/materials: the FPT library names its source; no date is recorded", async ({ page }) => {
        expect(materialUnis).toEqual(["FPT"])
        await page.goto("/vi/materials", { waitUntil: "domcontentloaded" })
        await expectAttribution(page, "vi", "FPT", null)
    })

    test("syllabus modal from /roadmap: an FPT syllabus shows its lastSeenAt date, a TDTU one 'not recorded'", async ({ page }) => {
        for (const uni of syllabusUnis) {
            const code = uni === DEFAULT_UNI ? DEFAULT_CODE : indexOf(uni).find((c) => existsSync(syllabusPath(uni, c)))
            expect(code, `${uni}: an index course with a syllabus`).toBeTruthy()
            const syl = syllabusOf(uni, code!)
            if (uni === DEFAULT_UNI) expect(syl.info.lastSeenAt, "the FPT default syllabus has a collection time").toBeTruthy()
            await openRoadmap(page, uni)
            await goToCourse(page, uni, code!)
            const dialog = await openSyllabusModal(page, syl)
            await expectAttribution(dialog, "vi", uni, syl.info.lastSeenAt)
        }
    })

    test("en: /roadmap and the FPT syllabus modal name the source in English, date as YYYY-MM-DD", async ({ page }) => {
        const syl = syllabusOf(DEFAULT_UNI, DEFAULT_CODE)
        await openRoadmap(page, DEFAULT_UNI, "en")
        await expectAttribution(page, "en", DEFAULT_UNI, null)
        const dialog = await openSyllabusModal(page, syl, "en")
        await expectAttribution(dialog, "en", DEFAULT_UNI, syl.info.lastSeenAt)
    })

    test("syllabus modal from a program's curriculum: NEU (roadmap only) names its source; a university outside the table names none", async ({ page }) => {
        const neu = await openCourseFromProgram(page, neuCase!.program, neuCase!.code)
        await expectAttribution(neu, "vi", "NEU", null)

        const other = await openCourseFromProgram(page, outsideCase!)
        // Loaded: no syllabus and no roadmap for this course → the empty state.
        await expect(other.getByRole("heading", { level: 3, name: msg("vi", "syllabus", "emptyTitle"), exact: true })).toBeVisible({ timeout: 20000 })
        await expect(other.getByTestId("data-attribution")).toHaveCount(0)
    })

    test("FPT syllabus modal: sessions, materials and CLOs exactly as in the file (visible text dumped for a Base comparison)", async ({ page }, info) => {
        const { c: code, s: syl } = fptCase!
        await openRoadmap(page, DEFAULT_UNI)
        await goToCourse(page, DEFAULT_UNI, code)
        const dialog = await openSyllabusModal(page, syl)
        const vs = (k: string) => msg("vi", "syllabus", k)
        const tabs = [
            {
                key: "sessions",
                label: vs("tabSessions"),
                heading: fill(vs("sessionsTitle"), { count: String(syl.sessions!.length) }),
                expected: syl.sessions!.flatMap((s) => [fill(vs("sessionNo"), { n: String(s.sessionNo) }), s.topic, s.learningTeachingType, s.studentTasks]),
            },
            {
                key: "materials",
                label: vs("tabMaterials"),
                heading: vs("materialsTitle"),
                expected: syl.materials!.flatMap((m) => [m.materialDescription, m.author, m.publisher, m.isbn]),
            },
            {
                key: "clos",
                label: vs("tabClos"),
                heading: vs("closTitle"),
                expected: syl.clos!.flatMap((c, i) => [c.cloName || `CLO${i + 1}`, c.loDetails]),
            },
        ]
        const dumpDir = process.env.V256_TEXT_DUMP
        if (dumpDir) mkdirSync(dumpDir, { recursive: true })
        for (const tab of tabs) {
            await dialog.getByRole("button", { name: new RegExp(`^${esc(tab.label)}`) }).click()
            const heading = dialog.getByRole("heading", { level: 4, name: tab.heading, exact: true })
            await expect(heading).toBeVisible({ timeout: 15000 })
            // The modal body (the scrolling panel holding the tab), without the attribution line.
            // `has` is matched inside each candidate div, so the inner locator must start from `page`, not from `dialog`.
            const body = dialog.locator("div.overflow-y-auto").filter({ has: page.getByRole("heading", { level: 4, name: tab.heading, exact: true }) })
            await expect(body).toHaveCount(1)
            let text = await body.innerText()
            const attribution = body.getByTestId("data-attribution")
            if (await attribution.count()) text = text.replace(await attribution.innerText(), "")
            const flat = norm(text)
            const missing = tab.expected.map(norm).filter((v) => v && !flat.includes(v))
            expect(missing.slice(0, 10), `${tab.key}: ${missing.length} values of the file not shown`).toEqual([])
            if (dumpDir) writeFileSync(path.join(dumpDir, `${info.project.name.replace(/[^\w.-]+/g, "_")}__${code}__${tab.key}.txt`), text.trimEnd() + "\n", "utf8")
        }
    })

    test("documents tab: the extracted-text length is a localized character count", async ({ page }) => {
        const { program, docs } = docCase!
        const template = msg("vi", "programs", "rawDocTextLength")
        const vi = new Intl.NumberFormat("vi")
        await page.goto(`/vi?program=${program.id}`, { waitUntil: "domcontentloaded" })
        const box = dialogNamed(page, program.name)
        await expect(box).toBeVisible({ timeout: 30000 })
        await box.getByRole("tab", { name: msg("vi", "programs", "rawDocumentsTab"), exact: true }).click()
        const cards = box.getByTestId("raw-doc")
        await expect(cards).toHaveCount(docs.length, { timeout: 15000 })
        for (const [i, doc] of docs.entries()) {
            const card = cards.nth(i)
            const count = card.getByTestId("raw-doc-text-length")
            if (doc.extractedTextLength == null) await expect(count).toHaveCount(0)
            else await expect(count).toHaveText(template.replace("{count, number}", vi.format(doc.extractedTextLength)))
            // Not the old byte-size reading.
            await expect(card.getByText(/\d\s?(B|KB|MB|GB) text$/)).toHaveCount(0)
        }
    })
})
