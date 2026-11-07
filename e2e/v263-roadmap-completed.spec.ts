import { test, expect, type Locator, type Page, type Route } from "@playwright/test"
import { execFileSync } from "child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import path from "path"

/**
 * v2.63 — the roadmap for the 4 universities, completed (audit 2026-10-30 §3 V9).
 *
 * - Neighbour names: a prerequisite/unlock card shows the name in the neighbour's own roadmap file (FPT keeps the names
 *   map of its course files); a neighbour without a roadmap file says so, never a name. The names come from one derived
 *   file per university, public/mock/roadmap-names/<UNI>.json (scripts/build-roadmap-names.mjs, --check, drift test).
 * - Name search: a word of a course name, with or without Vietnamese diacritics, finds the course; codes still match
 *   first (the Base rule) and at most 8 suggestions show. The names file is read once per university, never every file.
 * - `?uni=`: the picked university is in the URL (programLink.ts pattern, no useSearchParams): a link or a reload opens
 *   it, a pick pushes a history entry, Back/Forward follow; a value the picker does not offer is the FPT default and
 *   builds no request; a university without data shows its empty state.
 * - A code without a roadmap file (known from the loaded index, nothing requested) gets an honest card naming the code;
 *   a file that fails to load gets its own state with a retry; while a file or an index loads, the loading state shows
 *   (no empty heading, no count), and focus moves to the banner title after a focus change.
 * - en counts are plural forms ("1 prerequisite", "N prerequisites").
 * - Fix r1 (pre-review panel): Back into a `?uni=` entry after leaving the page opens that university's default course;
 *   after a link to /roadmap the page shows the university of the URL Next leaves (the FPT default when `?uni=` came
 *   from a pick), at once; the no-file card claims nothing about the course name; a query with spaces around it reads
 *   as the trimmed query and a whitespace-only query opens no list; a mixed list (codes and names) keeps the codes
 *   first; en `flowStatsData` renders its `other` form.
 *
 * Fixtures by rule from public/mock at test time (nothing named is pinned beyond the contract's FPT + SWE201c default).
 * Messages are read and asserted to exist inside the test bodies (AGENTS.md §12 v2.54/v2.59 (d)).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const ROADMAPS = path.join(MOCK, "roadmaps")
const NAMES_DIR = path.join(MOCK, "roadmap-names")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
type Locale = "vi" | "en"
type Uni = { code: string; name: string }
type RoadmapFile = { code?: string; subjectCode?: string; subjectName?: string; directPrereqs?: string[]; prerequisites?: string[]; unlocks?: string[]; names?: Record<string, string> }

// The contract's default (DONE.md v2.53 M2): FPT and its curated first course.
const DEFAULT_UNI = "FPT"
const DEFAULT_CODE = "SWE201c"
// Restated rules: the fetchers' file name (api.ts), relationCodes and the search fold + rule (roadmapUniversities.ts).
const fileName = (code: string) => code.replace(/[^a-zA-Z0-9_\-]/g, "_")
const relationCodes = (codes: string[] | undefined) => (codes ?? []).flatMap((c) => c.split(",").map((s) => s.trim()).filter(Boolean))
const fold = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim()
const CAP = 8
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k])

const universities: Uni[] = readJson(path.join(MOCK, "universities.json"))
const folders = readdirSync(ROADMAPS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
const withData = universities.filter((u) => folders.includes(u.code))
const withoutData = universities.filter((u) => !folders.includes(u.code))
const others = withData.filter((u) => u.code !== DEFAULT_UNI)
const hasSyllabi = (uni: string) => existsSync(path.join(MOCK, "syllabuses", uni))
// Each file is read once per worker (the search rule below scans every name of a university).
const memo = new Map<string, unknown>()
const once = <T>(key: string, read: () => T): T => {
    if (!memo.has(key)) memo.set(key, read())
    return memo.get(key) as T
}
const indexOf = (uni: string): string[] => once(`index:${uni}`, () => readJson(path.join(ROADMAPS, uni, "index.json")))
const hasFile = (uni: string, code: string) => existsSync(path.join(ROADMAPS, uni, `${fileName(code)}.json`))
const fileOf = (uni: string, code: string): RoadmapFile => once(`file:${uni}/${code}`, () => readJson(path.join(ROADMAPS, uni, `${fileName(code)}.json`)))
const nameOf = (uni: string, code: string) => String(fileOf(uni, code).subjectName ?? "")
const foldedNamesOf = (uni: string) => once(`folded:${uni}`, () => new Map(indexOf(uni).map((c) => [c, fold(nameOf(uni, c))])))
const prereqsOf = (r: RoadmapFile) => relationCodes(r.directPrereqs ?? r.prerequisites)
const unlocksOf = (r: RoadmapFile) => r.unlocks ?? []
const neighboursOf = (uni: string, code: string) => [...prereqsOf(fileOf(uni, code)), ...unlocksOf(fileOf(uni, code))]
/** The search rule's halves, restated; both read the trimmed query (fix r1): the codes containing it (case ignored) in
 *  index order, then the courses whose folded name contains the folded query — a course once. */
function searchParts(uni: string, query: string): { byCode: string[]; byName: string[] } {
    const q = query.trim().toLowerCase()
    if (!q) return { byCode: [], byName: [] }
    const idx = indexOf(uni)
    const f = fold(query)
    return {
        byCode: idx.filter((c) => c.toLowerCase().includes(q)),
        byName: f ? idx.filter((c) => !c.toLowerCase().includes(q) && foldedNamesOf(uni).get(c)!.includes(f)) : [],
    }
}
/** The search rule, restated: the code matches first, then the name matches, at most 8 — v2.68: for a query typed with
 *  diacritics, the names containing it as typed (NFC, case, "_"/spaces tidied) before the names matching only folded. */
const tidy = (s: string) => s.normalize("NFC").toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim()
function searchRule(uni: string, query: string): string[] {
    const { byCode, byName } = searchParts(uni, query)
    const t = tidy(query)
    const asTyped = (c: string) => tidy(nameOf(uni, c)).includes(t)
    const ranked = fold(query) !== t ? [...byName.filter(asTyped), ...byName.filter((c) => !asTyped(c))] : byName
    return [...byCode, ...ranked].slice(0, CAP)
}
/** ICU `{n, plural, one {…} other {…}}` (with `#`) and plain `{x}` — the forms these messages use — via Intl.PluralRules. */
function icu(s: string, vars: Record<string, number>, locale: Locale) {
    const rules = new Intl.PluralRules(locale)
    return s
        .replace(/\{(\w+), plural, one \{([^{}]*)\} other \{([^{}]*)\}\}/g, (_, k: string, one: string, other: string) =>
            (rules.select(vars[k]) === "one" ? one : other).replace(/#/g, String(vars[k]))
        )
        .replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k]))
}

// Messages are read inside the tests: a missing key fails the test that needs it, with its name.
const messagesOf = (l: Locale) => readJson(path.join(ROOT, "src", "messages", `${l}.json`)) as Record<string, Record<string, string>>
function msg(l: Locale, ns: string, key: string): string {
    const v = messagesOf(l)[ns]?.[key]
    expect(typeof v === "string" && v.length > 0, `message ${l}.${ns}.${key}`).toBe(true)
    return v
}

// ---- fixtures by rule ----
/** First index course of `uni` with a neighbour that has / has not a roadmap file. */
const courseWith = (uni: string, withFile: boolean) => indexOf(uni).find((c) => neighboursOf(uni, c).some((x) => hasFile(uni, x) === withFile))
/** A word of a course name for the name search: ≥ 4 letters, with a diacritic, matched by no code, the course among the suggestions. */
function nameWord(uni: string): { code: string; word: string } | null {
    for (const code of indexOf(uni)) {
        for (const raw of nameOf(uni, code).split(/[\s_]+/)) {
            const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
            if (word.length < 4 || fold(word) === word.toLowerCase()) continue
            if (indexOf(uni).some((c) => c.toLowerCase().includes(word.toLowerCase()) || c.toLowerCase().includes(fold(word)))) continue
            if (searchRule(uni, word).includes(code) && searchRule(uni, fold(word)).includes(code)) return { code, word }
        }
    }
    return null
}
/** The folded name word of `uni` that the most names contain (so its suggestions hit the cap), if more than the cap. */
function capWord(uni: string): string | null {
    const count = new Map<string, number>()
    for (const c of indexOf(uni)) for (const w of new Set(foldedNamesOf(uni).get(c)!.split(" ").filter((x) => /^[a-z]{4,}$/.test(x)))) count.set(w, (count.get(w) ?? 0) + 1)
    const best = [...count].filter(([w]) => !indexOf(uni).some((c) => c.toLowerCase().includes(w))).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]
    return best && best[1] > CAP ? best[0] : null
}
/** A query matching codes AND names, with more matches than the cap (fix r1): the first 2-character code prefix in index
 *  order with 1–7 code matches (so names show) and more than 8 matches in all (so one cap covers both halves). */
function mixedQuery(uni: string): string | null {
    const seen = new Set<string>()
    for (const code of indexOf(uni)) {
        const q = code.slice(0, 2)
        if (q.length < 2 || seen.has(q.toLowerCase())) continue
        seen.add(q.toLowerCase())
        const { byCode, byName } = searchParts(uni, q)
        if (byCode.length >= 1 && byCode.length < CAP && byName.length >= 1 && byCode.length + byName.length > CAP) return q
    }
    return null
}
const mixedCases = () => withData.map((u) => ({ uni: u.code, q: mixedQuery(u.code) })).filter((c): c is { uni: string; q: string } => c.q !== null)

// ---- page helpers ----
const picker = (page: Page, l: Locale) => page.getByLabel(msg(l, "roadmap", "universityLabel"), { exact: true })
const bannerTitle = (page: Page, name: string) => page.getByRole("heading", { level: 2, name, exact: true })
const searchBox = (page: Page, uni: string, l: Locale = "vi") =>
    page.getByPlaceholder(msg(l, "roadmap", uni === DEFAULT_UNI ? "searchPlaceholder" : "searchPlaceholderCode"), { exact: true })
const suggestions = (box: Locator) => box.locator("xpath=..").locator("div.absolute button")
const suggestion = (page: Page, box: Locator, code: string) => suggestions(box).filter({ has: page.locator("span", { hasText: new RegExp(`^${esc(code)}$`) }) })
/** The suggestion rows are exactly `expected`, in order (each row's code span). */
async function expectSuggestions(box: Locator, expected: string[], what: string) {
    await expect(suggestions(box), `${what}: ${expected.length} suggestions`).toHaveCount(expected.length, { timeout: 20000 })
    for (const [i, code] of expected.entries())
        await expect(suggestions(box).nth(i).locator("span", { hasText: new RegExp(`^${esc(code)}$`) }), `${what}: #${i + 1} is ${code}`).toHaveCount(1)
}
/** Clicks a navbar link by its name; at phone width (Pixel 7) the links sit behind the menu button. */
async function clickNavLink(page: Page, l: Locale, key: string) {
    const menu = page.getByRole("button", { name: msg(l, "navbar", "menu"), exact: true })
    if (await menu.isVisible()) await menu.click()
    await page.getByRole("link", { name: msg(l, "navbar", key), exact: true }).click()
}
const column = (page: Page, which: "prereqs" | "unlocks") => page.getByTestId(`roadmap-${which}`)
/** A neighbour card, found by its code. */
const card = (page: Page, which: "prereqs" | "unlocks", code: string) =>
    column(page, which).locator("div.rounded-xl").filter({ has: page.locator("span.font-black", { hasText: new RegExp(`^${esc(code)}$`) }) })
const countLine = (page: Page) => page.getByText(/^(Per the data: |Theo dữ liệu: )?\d+ (prerequisites?|môn tiên quyết) · \d+ (unlocked|môn mở khóa)$/)
const pathAndQuery = (page: Page) => {
    const u = new URL(page.url())
    return u.pathname + u.search
}

async function openRoadmap(page: Page, url = "/vi/roadmap", l: Locale = "vi") {
    await page.goto(url, { waitUntil: "domcontentloaded" })
    // The picker is in the static HTML: wait until universities.json has filled it (hydrated + loaded).
    await expect(picker(page, l).locator("option")).toHaveCount(universities.length, { timeout: 30000 })
}
/** Picks a university (unless it is already picked) and waits for its default course. */
async function pickUniversity(page: Page, uni: string, l: Locale = "vi") {
    if ((await picker(page, l).inputValue()) !== uni) await picker(page, l).selectOption(uni)
    await expect(bannerTitle(page, nameOf(uni, uni === DEFAULT_UNI ? DEFAULT_CODE : indexOf(uni)[0]))).toBeVisible({ timeout: 20000 })
}
/** Moves the focus to `code` through its code suggestion. */
async function goToCourse(page: Page, uni: string, code: string, l: Locale = "vi") {
    expect(searchRule(uni, code), `${uni} ${code} among the ${CAP} suggestions`).toContain(code)
    const box = searchBox(page, uni, l)
    await box.fill(code)
    await suggestion(page, box, code).click()
    await expect(bannerTitle(page, nameOf(uni, code))).toBeVisible({ timeout: 20000 })
}

/** Every /mock/ request of the page from now on (paths, decoded), with a quiet wait. */
function recorder(page: Page) {
    const got: string[] = []
    let pending = 0
    let last = Date.now()
    const onRequest = (r: { url(): string }) => {
        const p = new URL(r.url()).pathname
        if (!p.startsWith("/mock/")) return
        got.push(decodeURIComponent(p))
        pending++
        last = Date.now()
    }
    // Done at the response headers: a 404 body from `next start` may never end (AGENTS.md §12).
    const onDone = (r: { url(): string }) => {
        if (!new URL(r.url()).pathname.startsWith("/mock/")) return
        pending = Math.max(0, pending - 1)
        last = Date.now()
    }
    page.on("request", onRequest)
    page.on("response", onDone)
    page.on("requestfailed", onDone)
    return {
        got,
        /** The roadmap data reads (roadmaps/, roadmap-names/, syllabuses/) as a sorted set. */
        data: () => [...new Set(got.filter((p) => /^\/mock\/(roadmaps|roadmap-names|syllabuses)\//.test(p)))].sort(),
        all: () => [...new Set(got)].sort(),
        quiet: async (ms = 800) => {
            await expect.poll(() => pending === 0 && Date.now() - last >= ms, { timeout: 30000, intervals: [100] }).toBe(true)
        },
        stop: () => {
            page.off("request", onRequest)
            page.off("response", onDone)
            page.off("requestfailed", onDone)
        },
    }
}
/** Holds every request matching `pattern` until release() (always released in a finally). */
async function hold(page: Page, pattern: string) {
    let release: () => void = () => {}
    const held = new Promise<void>((r) => (release = r))
    let hits = 0
    await page.route(pattern, async (route: Route) => {
        hits++
        await held
        await route.continue().catch(() => {})
    })
    return { release: () => release(), hits: () => hits }
}
const activeElement = (page: Page) =>
    page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null
        return a ? { tag: a.tagName.toLowerCase(), text: (a.textContent ?? "").trim() } : null
    })
const fileRead = (uni: string, code: string) => `/mock/roadmaps/${uni}/${fileName(code)}.json`
const syllabusRead = (uni: string, code: string) => `/mock/syllabuses/${uni}/${fileName(code)}.json`
const namesRead = (uni: string) => `/mock/roadmap-names/${uni}.json`

test.describe("v2.63 roadmap for the 4 universities, completed", () => {
    // Several pages, held routes and reloads per test on a shared machine (AGENTS.md §12): 30 s is too tight.
    test.describe.configure({ timeout: 180000 })

    test("drift: roadmap-names/<UNI>.json is what scripts/build-roadmap-names.mjs builds — one file per roadmap folder, each index code → its own file's name", () => {
        let out = ""
        try {
            out = execFileSync(process.execPath, [path.join("scripts", "build-roadmap-names.mjs"), "--check"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" })
        } catch (e) {
            const err = e as { stderr?: string; message: string }
            throw new Error(`build-roadmap-names.mjs --check failed: ${err.stderr || err.message}`)
        }
        expect(out).toContain("matches public/mock/roadmaps")
        expect(readdirSync(NAMES_DIR).sort(), "one names file per roadmap folder").toEqual(folders.map((u) => `${fileName(u)}.json`).sort())
        let total = 0
        for (const uni of folders) {
            const file = path.join(NAMES_DIR, `${fileName(uni)}.json`)
            const names = readJson(file) as Record<string, string>
            // Every index code once. The JSON key order is JavaScript's (integer-like codes first, ascending: TDTU), so
            // the page looks names up by code and never relies on the order; --check pins the bytes.
            expect(Object.keys(names).sort(), `${uni}: every index code once`).toEqual([...indexOf(uni)].sort())
            expect(names, `${uni}: each code's own file name`).toEqual(Object.fromEntries(indexOf(uni).map((c) => [c, nameOf(uni, c)])))
            total += statSync(file).size
            console.log(`[v263] roadmap-names/${uni}.json ${statSync(file).size} B, ${indexOf(uni).length} names`)
        }
        console.log(`[v263] roadmap-names total ${total} B`)
    })

    test("messages: the v2.63 roadmap texts exist in vi and en with the same keys; en counts are plural forms", () => {
        const added = ["missingTitle", "missingHint", "noFileShort", "loadFailedTitle", "loadFailedHint", "indexFailedHint", "retry", "nameLoading", "nameFailed", "namesLoading", "namesFailed"]
        for (const k of added)
            for (const l of ["vi", "en"] as Locale[]) {
                msg(l, "roadmap", k)
                if (l === "en") expect(msg("vi", "roadmap", k), `roadmap.${k} translated`).not.toBe(msg("en", "roadmap", k))
            }
        for (const l of ["vi", "en"] as Locale[]) {
            for (const k of ["missingTitle", "loadFailedHint"]) expect(msg(l, "roadmap", k)).toContain("{code}")
            for (const k of ["missingHint", "indexFailedHint"]) expect(msg(l, "roadmap", k)).toContain("{university}")
            // The generic "not found" card is gone: every state now says what it is.
            for (const k of ["emptyTitle", "emptyHint"]) expect(messagesOf(l).roadmap[k], `${l}.roadmap.${k} removed`).toBeUndefined()
        }
        const plural = /\{(\w+), plural, one \{[^{}]*#[^{}]*\} other \{[^{}]*#[^{}]*\}\}/
        for (const [ns, k] of [["roadmap", "flowStats"], ["roadmap", "flowStatsData"], ["roadmap", "courseCount"], ["syllabus", "courseCount"]])
            expect(msg("en", ns, k), `en ${ns}.${k} is a plural form`).toMatch(plural)
        const keyPaths = (o: Record<string, unknown>, pre = ""): string[] =>
            Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keyPaths(v as Record<string, unknown>, `${pre}${k}.`) : [`${pre}${k}`]))
        expect(keyPaths(messagesOf("vi")), "vi and en: the same keys in the same order").toEqual(keyPaths(messagesOf("en")))
    })

    test("the no-file card claims nothing about the course name: the data names most of those codes (a referencing file's names map)", () => {
        // Data: the FPT neighbour codes without a roadmap file that a referencing course file names (its names map).
        const all = new Set<string>()
        const named = new Set<string>()
        for (const c of indexOf(DEFAULT_UNI)) {
            const f = fileOf(DEFAULT_UNI, c)
            for (const x of neighboursOf(DEFAULT_UNI, c).filter((y) => !hasFile(DEFAULT_UNI, y))) {
                all.add(x)
                if (String(f.names?.[x] ?? "").trim()) named.add(x)
            }
        }
        console.log(`[v263] FPT codes without a roadmap file: ${all.size}, named by a referencing file: ${named.size}`)
        expect(named.size, "codes without a roadmap file that the data names").toBeGreaterThan(0)
        // So the card says there is no roadmap file, never that there is no name.
        for (const l of ["vi", "en"] as Locale[])
            for (const k of ["missingHint", "missingTitle"])
                expect(msg(l, "roadmap", k), `${l}.roadmap.${k}: no claim about the course name`).not.toMatch(l === "vi" ? /tên/i : /\bnames?\b/i)
    })

    test("neighbour names: each neighbour card shows the name in that neighbour's own file (vi and en); a neighbour without a file says so", async ({ page }) => {
        const cases = others.map((u) => ({ uni: u.code, named: courseWith(u.code, true), missing: courseWith(u.code, false) }))
        for (const c of cases) console.log(`[v263] ${c.uni}: course with a named neighbour ${c.named ?? "none"}, with a neighbour without a file ${c.missing ?? "none"}`)
        // Universities whose files list no relation at all have no neighbour card to name (TDTU, UIT on today's data).
        expect(cases.filter((c) => c.named).length, "a university other than the default with a neighbour that has a file").toBeGreaterThanOrEqual(1)
        for (const l of ["vi", "en"] as Locale[]) {
            for (const c of cases.filter((x) => x.named || x.missing)) {
                await openRoadmap(page, `/${l}/roadmap`, l)
                await pickUniversity(page, c.uni, l)
                for (const course of [...new Set([c.named, c.missing].filter((x): x is string => !!x))]) {
                    await goToCourse(page, c.uni, course, l)
                    const file = fileOf(c.uni, course)
                    for (const [which, list] of [["prereqs", prereqsOf(file)], ["unlocks", unlocksOf(file)]] as const) {
                        for (const code of list) {
                            const line = card(page, which, code).locator("p").first()
                            if (hasFile(c.uni, code)) await expect(line, `${l} ${c.uni} ${course} → ${code}`).toHaveText(nameOf(c.uni, code), { timeout: 20000 })
                            else await expect(line, `${l} ${c.uni} ${course} → ${code} (no file)`).toHaveText(msg(l, "roadmap", "noFileShort"))
                        }
                    }
                    // Never the placeholder dash or a loading line once the names are in.
                    await expect(column(page, "prereqs").getByText("—", { exact: true })).toHaveCount(0)
                    await expect(column(page, "prereqs").getByText(msg(l, "roadmap", "nameLoading"), { exact: true })).toHaveCount(0)
                }
            }
        }
        // A neighbour without a file is also its own focus: the honest card, not a name (NEU-style stored entries).
        const m = cases.find((c) => c.missing)
        if (m) {
            await openRoadmap(page, "/en/roadmap", "en")
            await pickUniversity(page, m.uni, "en")
            await goToCourse(page, m.uni, m.missing!, "en")
            const file = fileOf(m.uni, m.missing!)
            const which = prereqsOf(file).some((x) => !hasFile(m.uni, x)) ? "prereqs" : "unlocks"
            const code = (which === "prereqs" ? prereqsOf(file) : unlocksOf(file)).find((x) => !hasFile(m.uni, x))!
            await card(page, which, code).getByRole("button", { name: msg("en", "roadmap", "changeFocus"), exact: true }).click()
            await expect(page.getByRole("heading", { level: 4, name: fill(msg("en", "roadmap", "missingTitle"), { code }), exact: true })).toBeVisible()
        }
    })

    test("name search: a word of a course name, with and without diacritics, finds the course in each university; at most 8 suggestions", async ({ page }) => {
        await openRoadmap(page)
        for (const u of withData) {
            const c = nameWord(u.code)
            expect(c, `${u.code}: a course name word for the search`).not.toBeNull()
            await pickUniversity(page, u.code)
            const box = searchBox(page, u.code)
            for (const q of [c!.word, fold(c!.word), c!.word.toUpperCase()]) {
                const expected = searchRule(u.code, q)
                await box.fill(q)
                await expect(suggestion(page, box, c!.code), `${u.code}: "${q}" finds ${c!.code}`).toHaveCount(1, { timeout: 20000 })
                await expect(suggestions(box), `${u.code}: "${q}" → the rule's list`).toHaveCount(expected.length)
                for (const [i, code] of expected.entries()) await expect(suggestions(box).nth(i).locator("span", { hasText: new RegExp(`^${esc(code)}$`) })).toHaveCount(1)
            }
            // A suggestion found by its name also shows that name.
            await box.fill(c!.word)
            await expect(suggestion(page, box, c!.code).getByText(nameOf(u.code, c!.code), { exact: true })).toBeVisible()
            await suggestion(page, box, c!.code).click()
            await expect(bannerTitle(page, nameOf(u.code, c!.code))).toBeVisible({ timeout: 20000 })
            // The cap: a word in more than 8 names shows exactly 8.
            const w = capWord(u.code)
            if (w) {
                await box.fill(w)
                await expect(suggestions(box), `${u.code}: "${w}" is capped`).toHaveCount(CAP, { timeout: 20000 })
            }
            await box.fill("")
        }
    })

    test("search order: a query matching codes and names lists the codes first, then the names — each course once, 8 at most, letter case ignored", async ({ page }) => {
        const cases = mixedCases()
        for (const c of cases) console.log(`[v263] ${c.uni}: mixed query "${c.q}" → ${searchRule(c.uni, c.q).join(" ")}`)
        expect(cases.length, "a university with a query that matches codes and names").toBeGreaterThanOrEqual(1)
        await openRoadmap(page)
        for (const c of cases) {
            const { byCode, byName } = searchParts(c.uni, c.q)
            const expected = searchRule(c.uni, c.q)
            // The fixture is mixed: code and name matches in the list, more matches than the cap, each course once.
            expect(expected.filter((x) => byCode.includes(x)).length, `${c.uni} "${c.q}": code matches listed`).toBeGreaterThanOrEqual(1)
            expect(expected.filter((x) => byName.includes(x)).length, `${c.uni} "${c.q}": name matches listed`).toBeGreaterThanOrEqual(1)
            expect(byCode.length + byName.length, `${c.uni} "${c.q}": more matches than the cap`).toBeGreaterThan(CAP)
            expect(new Set(expected).size, `${c.uni} "${c.q}": each course once`).toBe(expected.length)
            await pickUniversity(page, c.uni)
            const box = searchBox(page, c.uni)
            for (const q of [...new Set([c.q, c.q.toLowerCase()])]) {
                await box.fill(q)
                await expectSuggestions(box, expected, `${c.uni} "${q}"`)
            }
            await box.fill("")
        }
    })

    test("search: spaces around a query read as the trimmed query — the same list, codes first", async ({ page }) => {
        const cases = mixedCases()
        expect(cases.length, "a university with a query that matches codes and names").toBeGreaterThanOrEqual(1)
        await openRoadmap(page)
        for (const c of cases) {
            const expected = searchRule(c.uni, c.q)
            await pickUniversity(page, c.uni)
            const box = searchBox(page, c.uni)
            for (const q of [`${c.q} `, ` ${c.q}`, `  ${c.q}  `, c.q]) {
                expect(searchRule(c.uni, q), `the rule reads "${q}" as "${c.q}"`).toEqual(expected)
                await box.fill(q)
                await expectSuggestions(box, expected, `${c.uni} "${q}"`)
            }
            await box.fill("")
        }
    })

    test("search: a whitespace-only query opens no list — no suggestion and no names status row, also while the names load", async ({ page }) => {
        const uni = withData[0].code
        const code = uni === DEFAULT_UNI ? DEFAULT_CODE : indexOf(uni)[0]
        await openRoadmap(page)
        await pickUniversity(page, uni)
        const box = searchBox(page, uni)
        const list = box.locator("xpath=..").locator("div.absolute")
        const status = list.locator("[role=status]")
        const h = await hold(page, `**${namesRead(uni)}`)
        try {
            // A query wants the names file (held): the list shows the code matches and the loading status row.
            await box.fill(code)
            await expect(status, "the names are loading").toHaveText(msg("vi", "roadmap", "namesLoading"), { timeout: 20000 })
            await expect(suggestion(page, box, code)).toHaveCount(1)
            for (const q of [" ", "   "]) {
                await box.fill(q)
                await expect(list, `${JSON.stringify(q)} while the names load: no list, no status row`).toHaveCount(0)
            }
        } finally {
            h.release()
        }
        // Names loaded: the query lists again, whitespace still nothing.
        await box.fill(code)
        await expect(suggestion(page, box, code)).toHaveCount(1, { timeout: 20000 })
        await expect(status).toHaveCount(0, { timeout: 20000 })
        await box.fill("   ")
        await expect(list, "whitespace with the names loaded: no list").toHaveCount(0)
    })

    test("?uni=: a link opens that university and a reload keeps it; a pick pushes a history entry and Back/Forward follow it", async ({ page }) => {
        expect(others.length, "two universities other than the default").toBeGreaterThanOrEqual(2)
        const [a, b] = others
        const rec = recorder(page)
        await openRoadmap(page, `/vi/roadmap?uni=${a.code}`)
        await expect(picker(page, "vi"), "the link's university").toHaveValue(a.code)
        await expect(bannerTitle(page, nameOf(a.code, indexOf(a.code)[0]))).toBeVisible({ timeout: 20000 })
        expect(rec.data()).toContain(`/mock/roadmaps/${a.code}/index.json`)
        await page.reload({ waitUntil: "domcontentloaded" })
        await expect(picker(page, "vi").locator("option")).toHaveCount(universities.length, { timeout: 30000 })
        await expect(picker(page, "vi"), "after a reload").toHaveValue(a.code)
        await expect(bannerTitle(page, nameOf(a.code, indexOf(a.code)[0]))).toBeVisible({ timeout: 20000 })
        // Another course of a, then a pick: the URL takes the new university, the page its default course.
        const other = indexOf(a.code).find((c) => c !== indexOf(a.code)[0] && searchRule(a.code, c).includes(c))!
        await goToCourse(page, a.code, other)
        await picker(page, "vi").selectOption(b.code)
        await expect.poll(() => pathAndQuery(page)).toBe(`/vi/roadmap?uni=${b.code}`)
        await expect(bannerTitle(page, nameOf(b.code, indexOf(b.code)[0]))).toBeVisible({ timeout: 20000 })
        await picker(page, "vi").selectOption(DEFAULT_UNI)
        await expect.poll(() => pathAndQuery(page), "the default university = no uni").toBe("/vi/roadmap")
        await expect(bannerTitle(page, nameOf(DEFAULT_UNI, DEFAULT_CODE))).toBeVisible({ timeout: 20000 })
        // Back/Forward: the university of each entry, on its default course.
        await page.goBack()
        await expect.poll(() => pathAndQuery(page)).toBe(`/vi/roadmap?uni=${b.code}`)
        await expect(picker(page, "vi")).toHaveValue(b.code)
        await expect(bannerTitle(page, nameOf(b.code, indexOf(b.code)[0]))).toBeVisible({ timeout: 20000 })
        await page.goBack()
        await expect.poll(() => pathAndQuery(page)).toBe(`/vi/roadmap?uni=${a.code}`)
        await expect(picker(page, "vi")).toHaveValue(a.code)
        await expect(bannerTitle(page, nameOf(a.code, indexOf(a.code)[0])), "Back opens the university's default course").toBeVisible({ timeout: 20000 })
        await page.goForward()
        await expect.poll(() => pathAndQuery(page)).toBe(`/vi/roadmap?uni=${b.code}`)
        await expect(picker(page, "vi")).toHaveValue(b.code)
        rec.stop()
        // en reads the same parameter.
        await openRoadmap(page, `/en/roadmap?uni=${b.code}`, "en")
        await expect(picker(page, "en")).toHaveValue(b.code)
        await expect(bannerTitle(page, nameOf(b.code, indexOf(b.code)[0]))).toBeVisible({ timeout: 20000 })
    })

    test("?uni= the picker does not offer: a university without data shows its empty state; an unknown value is the FPT default and builds no request", async ({ page }) => {
        const none = withoutData[0]
        let rec = recorder(page)
        await openRoadmap(page, `/vi/roadmap?uni=${none.code}`)
        await expect(page.getByRole("heading", { level: 2, name: fill(msg("vi", "roadmap", "noDataTitle"), { university: none.name }), exact: true })).toBeVisible({ timeout: 20000 })
        await expect(picker(page, "vi")).toHaveValue(none.code)
        await rec.quiet()
        expect(rec.all().filter((p) => p.includes(`/${none.code}/`) || p.includes(`/${none.code}.`)), `no path built from ${none.code}`).toEqual([])
        rec.stop()
        // The plain page's reads are the baseline of the default.
        rec = recorder(page)
        await openRoadmap(page)
        await expect(bannerTitle(page, nameOf(DEFAULT_UNI, DEFAULT_CODE))).toBeVisible({ timeout: 20000 })
        await rec.quiet()
        const baseline = rec.all()
        rec.stop()
        expect(baseline).toContain(fileRead(DEFAULT_UNI, DEFAULT_CODE))
        for (const v of ["zzz", "..%2Fx", "../x", "FPT%2F..", "fpt", "%2E%2E", `${others[0].code}%2F..`, ""]) {
            rec = recorder(page)
            await openRoadmap(page, `/vi/roadmap?uni=${v}`)
            await expect(picker(page, "vi"), `?uni=${v}`).toHaveValue(DEFAULT_UNI)
            await expect(bannerTitle(page, nameOf(DEFAULT_UNI, DEFAULT_CODE))).toBeVisible({ timeout: 20000 })
            await rec.quiet()
            expect(rec.all(), `?uni=${v}: the default's reads only`).toEqual(baseline)
            rec.stop()
        }
    })

    test("Back into a ?uni= entry after leaving /roadmap (a pick, then a ?uni= link): that university on its own default course, nothing of FPT's", async ({ page }) => {
        expect(others.length, "two universities other than the default").toBeGreaterThanOrEqual(2)
        const [a, b] = others
        // Leave by a navbar link (a client navigation: /roadmap unmounts), go Back (a new page instance, not a hydration).
        const leaveAndBack = async (uni: string) => {
            const rec = recorder(page)
            await clickNavLink(page, "vi", "materials")
            await expect.poll(() => new URL(page.url()).pathname, "left /roadmap").toBe("/vi/materials")
            await expect(page.getByRole("heading", { level: 1, name: msg("vi", "materials", "title"), exact: true })).toBeVisible({ timeout: 20000 })
            await page.goBack()
            await expect.poll(() => pathAndQuery(page)).toBe(`/vi/roadmap?uni=${uni}`)
            await expect(picker(page, "vi"), "the entry's university").toHaveValue(uni)
            await expect(bannerTitle(page, nameOf(uni, indexOf(uni)[0])), `Back opens ${uni}'s default course, not ${DEFAULT_CODE}`).toBeVisible({ timeout: 20000 })
            await expect(page.getByTestId("roadmap-no-file"), "no no-file card").toHaveCount(0)
            await expect(searchBox(page, uni), "the search is empty").toHaveValue("")
            await rec.quiet()
            expect(rec.all().filter((p) => p.endsWith(`/${fileName(DEFAULT_CODE)}.json`)), `no read of ${DEFAULT_CODE} under ${uni}`).toEqual([])
            rec.stop()
        }
        await openRoadmap(page)
        await pickUniversity(page, a.code)
        await expect.poll(() => pathAndQuery(page), "the pick is in the URL").toBe(`/vi/roadmap?uni=${a.code}`)
        await leaveAndBack(a.code)
        await openRoadmap(page, `/vi/roadmap?uni=${b.code}`)
        await expect(picker(page, "vi")).toHaveValue(b.code)
        await expect(bannerTitle(page, nameOf(b.code, indexOf(b.code)[0]))).toBeVisible({ timeout: 20000 })
        await leaveAndBack(b.code)
    })

    test("a link to /roadmap from a ?uni= entry (the navbar's roadmap link): the page shows the university its URL names at once and the next keystroke keeps it; Back returns to the entry", async ({ page }) => {
        const a = others[0].code
        const typed = DEFAULT_CODE.slice(0, 1)
        /** The university the page's rule reads from the current URL: `?uni=` when the picker offers it, else the default. */
        const urlUniversity = () => {
            const v = new URL(page.url()).searchParams.get("uni")
            return v !== null && universities.some((u) => u.code === v) ? v : DEFAULT_UNI
        }
        const defaultCourse = (uni: string) => (uni === DEFAULT_UNI ? DEFAULT_CODE : indexOf(uni)[0])
        // (1) `?uni=` from a pick: Next writes the link's URL (no uni) with its own history state — no popstate, no event of
        // ours — and keeps the page instance.
        await openRoadmap(page)
        await pickUniversity(page, a)
        await expect.poll(() => pathAndQuery(page), "the pick is in the URL").toBe(`/vi/roadmap?uni=${a}`)
        await clickNavLink(page, "vi", "roadmap")
        await expect.poll(() => pathAndQuery(page), "the link's URL has no uni").toBe("/vi/roadmap")
        await expect(picker(page, "vi"), "the URL without uni is the FPT default, shown at once").toHaveValue(DEFAULT_UNI)
        await expect(bannerTitle(page, nameOf(DEFAULT_UNI, DEFAULT_CODE))).toBeVisible({ timeout: 20000 })
        const box = searchBox(page, DEFAULT_UNI)
        await expect(box).toHaveValue("")
        // The next render (one character typed) reads the same URL: nothing jumps, the character stays.
        await box.fill(typed)
        await expect(box, "the typed character stays").toHaveValue(typed)
        await expect(picker(page, "vi")).toHaveValue(DEFAULT_UNI)
        await expect(bannerTitle(page, nameOf(DEFAULT_UNI, DEFAULT_CODE))).toBeVisible()
        // Back: the picked entry again, on its default course with an empty search.
        await page.goBack()
        await expect.poll(() => pathAndQuery(page)).toBe(`/vi/roadmap?uni=${a}`)
        await expect(picker(page, "vi")).toHaveValue(a)
        await expect(bannerTitle(page, nameOf(a, indexOf(a)[0]))).toBeVisible({ timeout: 20000 })
        await expect(searchBox(page, a)).toHaveValue("")
        // (2) `?uni=` loaded with the page: whatever URL Next leaves after the link (16.2.1 keeps `?uni=` there — the loaded
        // route's canonical URL), the page shows the university that URL names, and the next keystroke keeps it.
        await openRoadmap(page, `/vi/roadmap?uni=${a}`)
        await expect(bannerTitle(page, nameOf(a, indexOf(a)[0]))).toBeVisible({ timeout: 20000 })
        const rec = recorder(page)
        await clickNavLink(page, "vi", "roadmap")
        await rec.quiet(1500)
        rec.stop()
        const shown = urlUniversity()
        console.log(`[v263] navbar link from a loaded ?uni=${a}: URL ${pathAndQuery(page)} → ${shown}`)
        await expect(picker(page, "vi"), "the university the URL names").toHaveValue(shown)
        await expect(bannerTitle(page, nameOf(shown, defaultCourse(shown)))).toBeVisible({ timeout: 20000 })
        await searchBox(page, shown).fill(typed)
        await expect(searchBox(page, shown), "the typed character stays").toHaveValue(typed)
        await expect(picker(page, "vi")).toHaveValue(urlUniversity())
    })

    test("a code without a roadmap file: the honest card with the code, nothing requested for it, no syllabus action; focus on the banner title", async ({ page }) => {
        // Data guard: no FPT neighbour code without a roadmap file has a syllabus file (the card offers no syllabus).
        const missingCodes = [...new Set(indexOf(DEFAULT_UNI).flatMap((c) => neighboursOf(DEFAULT_UNI, c).filter((x) => !hasFile(DEFAULT_UNI, x))))]
        expect(missingCodes.length, "FPT neighbour codes without a roadmap file").toBeGreaterThan(0)
        expect(missingCodes.filter((x) => existsSync(path.join(MOCK, "syllabuses", DEFAULT_UNI, `${fileName(x)}.json`))), "of those, with a syllabus file").toEqual([])
        const course = courseWith(DEFAULT_UNI, false)!
        const file = fileOf(DEFAULT_UNI, course)
        const which = prereqsOf(file).some((x) => !hasFile(DEFAULT_UNI, x)) ? "prereqs" : "unlocks"
        const code = (which === "prereqs" ? prereqsOf(file) : unlocksOf(file)).find((x) => !hasFile(DEFAULT_UNI, x))!
        console.log(`[v263] FPT ${course} → ${code} (no roadmap file)`)
        await openRoadmap(page)
        await goToCourse(page, DEFAULT_UNI, course)
        const rec = recorder(page)
        await card(page, which, code).getByRole("button", { name: msg("vi", "roadmap", "changeFocus"), exact: true }).click()
        await expect(page.getByTestId("roadmap-no-file"), "the honest card").toBeVisible({ timeout: 20000 })
        await rec.quiet()
        expect(rec.data(), "nothing requested for a code the loaded index does not hold").toEqual([])
        rec.stop()
        await expect(page.getByTestId("roadmap-no-file").getByRole("heading", { level: 4, name: fill(msg("vi", "roadmap", "missingTitle"), { code }), exact: true })).toBeVisible()
        await expect(page.getByTestId("roadmap-no-file").getByText(fill(msg("vi", "roadmap", "missingHint"), { university: universities.find((u) => u.code === DEFAULT_UNI)!.name }), { exact: true })).toBeVisible()
        await expect(bannerTitle(page, code)).toBeVisible()
        for (const k of ["viewSyllabus", "viewScores"]) await expect(page.getByRole("button", { name: msg("vi", "roadmap", k), exact: true })).toHaveCount(0)
        await expect(countLine(page), "no count without a file").toHaveCount(0)
        await expect(page.getByTestId("roadmap-prereqs")).toHaveCount(0)
        await expect.poll(() => activeElement(page), { message: "focus on the banner title" }).toEqual({ tag: "h2", text: code })
    })

    test("a course file pending or failing: the loading state with focus on the banner title, then its own failed state with a retry — never the no-file card", async ({ page }) => {
        const uni = others[0].code
        const reachable: string[] = []
        for (const c of indexOf(uni).slice(1)) if (reachable.length < 2 && searchRule(uni, c).includes(c)) reachable.push(c)
        const [pendingCode, failedCode] = reachable
        await openRoadmap(page)
        await pickUniversity(page, uni)
        // Pending (held route): the banner names the code at once and takes focus; the loading line, no count.
        const h = await hold(page, `**${fileRead(uni, pendingCode)}`)
        try {
            const box = searchBox(page, uni)
            await box.fill(pendingCode)
            await suggestion(page, box, pendingCode).click()
            await expect.poll(() => h.hits(), "the file is requested").toBeGreaterThan(0)
            await expect(bannerTitle(page, pendingCode)).toBeVisible()
            await expect.poll(() => activeElement(page), { message: "focus on the banner title while the file loads" }).toEqual({ tag: "h2", text: pendingCode })
            await expect(page.getByText(msg("vi", "roadmap", "loading"), { exact: true })).toBeVisible()
            await expect(countLine(page)).toHaveCount(0)
            await expect(page.getByTestId("roadmap-no-file")).toHaveCount(0)
            await expect(page.getByTestId("roadmap-load-failed")).toHaveCount(0)
        } finally {
            h.release()
        }
        await expect(bannerTitle(page, nameOf(uni, pendingCode))).toBeVisible({ timeout: 20000 })
        await page.unroute(`**${fileRead(uni, pendingCode)}`)
        // Failed (aborted): its own state, the code named, a retry that loads the file once the network is back.
        await page.route(`**${fileRead(uni, failedCode)}`, (route) => route.abort())
        const box = searchBox(page, uni)
        await box.fill(failedCode)
        await suggestion(page, box, failedCode).click()
        const failed = page.getByTestId("roadmap-load-failed")
        await expect(failed, "the failed state").toBeVisible({ timeout: 20000 })
        await expect(failed.getByRole("heading", { level: 4, name: msg("vi", "roadmap", "loadFailedTitle"), exact: true })).toBeVisible()
        await expect(failed.getByText(fill(msg("vi", "roadmap", "loadFailedHint"), { code: failedCode }), { exact: true })).toBeVisible()
        await expect(page.getByTestId("roadmap-no-file")).toHaveCount(0)
        await expect(countLine(page)).toHaveCount(0)
        await page.unroute(`**${fileRead(uni, failedCode)}`)
        await failed.getByRole("button", { name: msg("vi", "roadmap", "retry"), exact: true }).click()
        await expect(bannerTitle(page, nameOf(uni, failedCode))).toBeVisible({ timeout: 20000 })
        await expect(page.getByTestId("roadmap-load-failed")).toHaveCount(0)
    })

    test("names file pending or failing: the search says so and still matches codes; neighbour cards say the name is loading or failed, never a name", async ({ page }) => {
        const c = others.map((u) => ({ uni: u.code, code: courseWith(u.code, true) })).find((x) => x.code)!
        const named = neighboursOf(c.uni, c.code!).find((x) => hasFile(c.uni, x))!
        const which = prereqsOf(fileOf(c.uni, c.code!)).includes(named) ? "prereqs" : "unlocks"
        await openRoadmap(page)
        await pickUniversity(page, c.uni)
        const h = await hold(page, `**${namesRead(c.uni)}`)
        try {
            const box = searchBox(page, c.uni)
            await box.fill(c.code!)
            const status = box.locator("xpath=..").locator("div.absolute [role=status]")
            await expect(status, "the search says the names are loading").toBeVisible({ timeout: 20000 })
            await expect(status).toHaveText(msg("vi", "roadmap", "namesLoading"))
            await suggestion(page, box, c.code!).click()
            await expect(bannerTitle(page, nameOf(c.uni, c.code!))).toBeVisible({ timeout: 20000 })
            await expect(card(page, which, named).locator("p").first(), "a neighbour name while the names load").toHaveText(msg("vi", "roadmap", "nameLoading"))
        } finally {
            h.release()
        }
        await expect(card(page, which, named).locator("p").first()).toHaveText(nameOf(c.uni, named), { timeout: 20000 })
        await page.unroute(`**${namesRead(c.uni)}`)
        // Failed: a fresh page, the names file aborted.
        await page.route(`**${namesRead(c.uni)}`, (route) => route.abort())
        await openRoadmap(page)
        await pickUniversity(page, c.uni)
        const box = searchBox(page, c.uni)
        await box.fill(c.code!)
        const status = box.locator("xpath=..").locator("div.absolute [role=status]")
        await expect(status).toHaveText(msg("vi", "roadmap", "namesFailed"), { timeout: 20000 })
        await expect(suggestion(page, box, c.code!), "codes still match").toHaveCount(1)
        await suggestion(page, box, c.code!).click()
        await expect(bannerTitle(page, nameOf(c.uni, c.code!))).toBeVisible({ timeout: 20000 })
        await expect(card(page, which, named).locator("p").first(), "a neighbour name when the names failed").toHaveText(msg("vi", "roadmap", "nameFailed"), { timeout: 20000 })
    })

    test("en counts: '1 prerequisite' for a course with exactly one, 'N prerequisites' otherwise; vi keeps its one form", async ({ page }) => {
        const unis = [DEFAULT_UNI, ...others.map((u) => u.code)]
        const one = unis.map((u) => ({ uni: u, code: indexOf(u).find((c) => prereqsOf(fileOf(u, c)).length === 1) })).filter((x) => x.code)
        // N ≠ 1 per university (fix r1): the first course with more than one prerequisite, else the first with none — so
        // the `other` form of both en messages renders (flowStats for the default, flowStatsData for the others).
        const many = unis
            .map((u) => ({ uni: u, code: indexOf(u).find((c) => prereqsOf(fileOf(u, c)).length > 1) ?? indexOf(u).find((c) => prereqsOf(fileOf(u, c)).length === 0) }))
            .filter((x) => x.code)
        for (const c of many) console.log(`[v263] ${c.uni}: N ≠ 1 course ${c.code} (${prereqsOf(fileOf(c.uni, c.code!)).length} prerequisites)`)
        expect(one.length, "courses with exactly one prerequisite").toBeGreaterThanOrEqual(1)
        expect(many.filter((x) => x.uni === DEFAULT_UNI).length, "a default-university course with N ≠ 1 (flowStats)").toBe(1)
        expect(many.filter((x) => x.uni !== DEFAULT_UNI).length, "a course of another university with N ≠ 1 (flowStatsData)").toBeGreaterThanOrEqual(1)
        for (const l of ["en", "vi"] as Locale[]) {
            for (const c of [...one, ...many]) {
                await openRoadmap(page, `/${l}/roadmap`, l)
                await pickUniversity(page, c.uni, l)
                await goToCourse(page, c.uni, c.code!, l)
                const file = fileOf(c.uni, c.code!)
                const vars = { prereqs: prereqsOf(file).length, unlocks: unlocksOf(file).length }
                const line = countLine(page)
                await expect(line).toHaveCount(1)
                const text = (await line.textContent())!.trim()
                if (l === "en") expect(text, `en ${c.uni} ${c.code}`).toMatch(vars.prereqs === 1 ? /(^|: )1 prerequisite · / : new RegExp(`(^|: )${vars.prereqs} prerequisites · `))
                const key = c.uni === DEFAULT_UNI ? "flowStats" : "flowStatsData"
                expect(text, `${l} ${c.uni} ${c.code}: ${key}`).toBe(icu(msg(l, "roadmap", key), vars, l))
                await expect(column(page, "prereqs").getByText(icu(msg(l, "roadmap", "courseCount"), { count: vars.prereqs }, l), { exact: true })).toBeVisible()
            }
        }
    })

    test("while a university's index loads: no empty heading or badge and no count — the loading state; then its default course", async ({ page }) => {
        const uni = others[0].code
        await openRoadmap(page)
        await expect(bannerTitle(page, nameOf(DEFAULT_UNI, DEFAULT_CODE))).toBeVisible({ timeout: 20000 })
        const h = await hold(page, `**/mock/roadmaps/${uni}/index.json`)
        try {
            await picker(page, "vi").selectOption(uni)
            await expect.poll(() => h.hits(), "the index is requested").toBeGreaterThan(0)
            await expect(page.locator("h2"), "no heading while the index loads").toHaveCount(0)
            await expect(countLine(page), "no count while the index loads").toHaveCount(0)
            await expect(page.getByText(msg("vi", "roadmap", "loading"), { exact: true })).toBeVisible()
        } finally {
            h.release()
        }
        await expect(bannerTitle(page, nameOf(uni, indexOf(uni)[0]))).toBeVisible({ timeout: 20000 })
        await expect(page.locator("h2")).toHaveCount(1)
    })

    test("requests per focus change: the course file (+ its syllabus where the university has syllabi); the names file once per university, on the first search", async ({ page }) => {
        // One course per university: with a neighbour that has a file when there is one, else the second index code.
        const cases = withData.map((u) => ({ uni: u.code, code: courseWith(u.code, true) ?? indexOf(u.code)[1] }))
        // The universities whose course has neighbours needing a name first.
        cases.sort((a, b) => Number(!(a.uni !== DEFAULT_UNI && courseWith(a.uni, true))) - Number(!(b.uni !== DEFAULT_UNI && courseWith(b.uni, true))))
        const focusSet = (uni: string, code: string) => [fileRead(uni, code), ...(hasSyllabi(uni) ? [syllabusRead(uni, code)] : [])].sort()
        await openRoadmap(page)
        await expect(bannerTitle(page, nameOf(DEFAULT_UNI, DEFAULT_CODE))).toBeVisible({ timeout: 20000 })
        for (const c of cases) {
            let rec = recorder(page)
            await pickUniversity(page, c.uni)
            await rec.quiet()
            if (c.uni !== DEFAULT_UNI)
                expect(rec.data(), `${c.uni}: a pick reads the index and the default course only`).toEqual([`/mock/roadmaps/${c.uni}/index.json`, ...focusSet(c.uni, indexOf(c.uni)[0])].sort())
            rec.stop()
            const box = searchBox(page, c.uni)
            rec = recorder(page)
            await box.fill(c.code)
            await expect(suggestion(page, box, c.code)).toHaveCount(1, { timeout: 20000 })
            await rec.quiet()
            expect(rec.data(), `${c.uni}: the first search reads the names file`).toEqual([namesRead(c.uni)])
            rec.stop()
            rec = recorder(page)
            await suggestion(page, box, c.code).click()
            await expect(bannerTitle(page, nameOf(c.uni, c.code))).toBeVisible({ timeout: 20000 })
            await rec.quiet()
            expect(rec.data(), `${c.uni} → ${c.code}`).toEqual(focusSet(c.uni, c.code))
            rec.stop()
            const nb = neighboursOf(c.uni, c.code).find((x) => hasFile(c.uni, x))
            if (nb) {
                const which = prereqsOf(fileOf(c.uni, c.code)).includes(nb) ? "prereqs" : "unlocks"
                rec = recorder(page)
                await card(page, which, nb).getByRole("button", { name: msg("vi", "roadmap", "changeFocus"), exact: true }).click()
                await expect(bannerTitle(page, nameOf(c.uni, nb))).toBeVisible({ timeout: 20000 })
                await rec.quiet()
                expect(rec.data(), `${c.uni} → ${nb} (a neighbour): no second names read`).toEqual(focusSet(c.uni, nb))
                rec.stop()
            }
            console.log(`[v263] requests per focus change ${c.uni}: ${c.code}${nb ? ` → ${nb}` : ""} = ${focusSet(c.uni, c.code).length}`)
        }
    })

    test("static HTML: /vi and /en roadmap keep the picker on the FPT default with no client-side bailout, and show no count before the data", () => {
        for (const l of ["vi", "en"] as Locale[]) {
            const html = readFileSync(path.join(ROOT, ".next", "server", "app", l, "roadmap.html"), "utf8")
            const counts = html.match(/<span class="text-xs text-muted-foreground font-mono font-medium">[^<]*<\/span>/g) ?? []
            expect(counts, `${l}: no count rendered while loading`).toEqual([])
            expect(html.match(/BAILOUT_TO_CLIENT_SIDE_RENDERING/g) ?? [], `${l}: bailout`).toEqual([])
            expect(html).toMatch(/<select[^>]*id="[^"]+"/)
            expect(html).toMatch(new RegExp(`<option value="${DEFAULT_UNI}" selected=""`))
            expect(html).toContain(msg(l, "roadmap", "popularSubjects"))
            expect(html).toContain(`>${DEFAULT_CODE}</h2>`)
        }
    })
})
