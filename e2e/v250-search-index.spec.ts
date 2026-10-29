import { test, expect, Page, Request } from "@playwright/test"
import { execFileSync } from "child_process"
import { readFileSync, statSync } from "fs"
import path from "path"

/**
 * v2.50 — compact search index (audit V7, gap G9).
 *
 * The first search/filter on the program list in mock mode loaded every
 * public/mock/programs/page-N.json chunk (98 files, ~16.8 MB raw). It now reads
 * one derived file, public/mock/search-index.json (scripts/build-search-index.mjs):
 * one row per program in chunk order with only the fields the list reads, the
 * card description cut after the word that reaches 250 characters + "…".
 *
 * Checked here: the committed index is what the script builds (drift) and equals
 * the chunk programs field by field; the first search costs ≤ 3 JSON requests and
 * ≤ 1,000,000 bytes raw (measured from the network); results — count and card
 * order, tie-breaks included — equal the old full-chunk algorithm run in the same
 * browser, for queries/filters/sorts derived from public/mock at test time; every
 * cut description still needs more than two lines at the widest card, so the
 * visible card is unchanged; a search-result card opens the full program; plain
 * browsing and the compare page keep the chunk path. Nothing named is pinned.
 * domcontentloaded, not networkidle (AGENTS.md §12).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const INDEX_FILE = path.join(MOCK, "search-index.json")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const vi: Record<string, string> = readJson(path.join(ROOT, "src", "messages", "vi.json")).programs

type MockProgram = {
    id: string
    universityId: string
    universityName: string
    universityIsPublic: boolean
    name: string
    code: string | null
    degreeType: string | null
    credits: number | null
    duration: string | null
    language: string | null
    sourceUrl: string | null
    description: string | null
    courseCount: number
    createdAt: string
}
const chunks: string[] = readJson(path.join(MOCK, "index.json")).chunks
const all: MockProgram[] = chunks.flatMap((c) => readJson(path.join(MOCK, "programs", c)))
const universities: { id: string; name: string }[] = readJson(path.join(MOCK, "universities.json"))
const degreeTypes: string[] = readJson(path.join(MOCK, "degree-types.json"))

// What the list path reads (api.ts applyFiltersAndSort + ProgramCard; universityIsPublic = the type filter, back in v2.54).
const LIST_FIELDS = [
    "id", "universityId", "universityName", "universityIsPublic", "name", "code", "degreeType", "credits",
    "duration", "language", "sourceUrl", "description", "courseCount", "createdAt",
] as const
const BUDGET_REQUESTS = 3
const BUDGET_BYTES = 1_000_000
const CUT = 250
// Widest card description box: 639 px viewport (one column below `sm`) − page px-4 ×2 − card border ×2 − CardContent px-5 ×2.
const WIDEST_TEXT_PX = 639 - 32 - 2 - 40

// The card description rule, restated: cut after the word that reaches CUT characters + "…".
function cardDescription(d: string | null): string | null {
    if (d === null || d.length <= CUT) return d
    const end = d.slice(CUT).search(/\s/)
    return end < 0 ? d : d.slice(0, CUT + end) + "…"
}

function decodeIndex(): Record<string, unknown>[] {
    const { fields, values, rows } = readJson(INDEX_FILE) as {
        fields: string[]
        values: Record<string, unknown[]>
        rows: unknown[][]
    }
    return rows.map((row) => Object.fromEntries(fields.map((f, i) => [f, values[f] ? values[f][row[i] as number] : row[i]])))
}

// ---- cases derived from the snapshot ------------------------------------------------
type Sort = "newest" | "name" | "credits"
type Case = { label: string; typed?: string; universityId?: string; degreeType?: string; cohort?: string; sort: Sort }
type Params = { search?: string; universityId?: string; degreeType?: string; cohort?: string; sortBy: string; sortDesc: boolean }

// The params ProgramList sends for a filter state.
const paramsOf = (c: Case): Params => ({
    search: c.typed || undefined,
    universityId: c.universityId,
    degreeType: c.degreeType,
    cohort: c.cohort,
    sortBy: c.sort === "newest" ? "createdAt" : c.sort,
    sortDesc: c.sort === "newest" || c.sort === "credits",
})

// The old filter (api.ts at Base 4f6c51fc) — used here only to pick cases; the expected order comes from the browser.
function matches(p: MockProgram, prm: Params): boolean {
    if (prm.search) {
        const s = prm.search.toLowerCase()
        if (!(p.name.toLowerCase().includes(s) || (p.code?.toLowerCase().includes(s) ?? false) || p.universityName.toLowerCase().includes(s))) return false
    }
    if (prm.degreeType && p.degreeType !== prm.degreeType) return false
    if (prm.universityId && p.universityId !== prm.universityId) return false
    if (prm.cohort) {
        const c = prm.cohort.toLowerCase()
        if (!((p.code && p.code.toLowerCase().includes(c)) || p.name.toLowerCase().includes(c))) return false
    }
    return true
}
const countOf = (c: Omit<Case, "label">) => all.filter((p) => matches(p, paramsOf({ label: "", ...c }))).length
const byCountThenText = (a: [string, number], b: [string, number]) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
const words = (s: string) => s.toLowerCase().split(/[\s\d.,;:()[\]/\\_+&'"–—-]+/).filter((w) => w.length >= 4)
const NON_ASCII = /[^ -~]/ // outside printable ASCII

// A word with diacritics found in 13–36 programs (2–3 result pages), typed with a capital first letter.
const diacriticWord = [...new Set(all.flatMap((p) => words(p.name)).filter((w) => NON_ASCII.test(w)))]
    .map((w): [string, number] => [w, countOf({ typed: w, sort: "newest" })])
    .filter(([, n]) => n >= 13 && n <= 36)
    .sort(byCountThenText)[0]?.[0]
// Two consecutive words of a name, one with diacritics, typed in capitals.
const twoWords = [
    ...new Set(
        all.flatMap((p) => {
            const ws = p.name.toLowerCase().split(/\s+/)
            return ws.slice(1).map((w, i) => `${ws[i]} ${w}`).filter((q) => NON_ASCII.test(q) && /^[^\d()]+$/.test(q))
        })
    ),
]
    .map((q): [string, number] => [q, countOf({ typed: q, sort: "newest" })])
    .filter(([q, n]) => n >= 2 && n <= 36 && q.toUpperCase().toLowerCase() === q)
    .sort(byCountThenText)[0]?.[0]
// A university matched through its name: the smallest such result set with at least 2 programs.
const uniQuery = universities
    .map((u): [string, number] => [u.name, countOf({ typed: u.name, sort: "newest" })])
    .filter(([, n]) => n >= 2)
    .sort(byCountThenText)[0]?.[0]
// The most shared program code with at most 36 programs.
const codeQuery = [...new Set(all.map((p) => p.code).filter((c): c is string => !!c))]
    .map((c): [string, number] => [c, countOf({ typed: c, sort: "newest" })])
    .filter(([, n]) => n >= 2 && n <= 36)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0]
// A query no program matches.
let emptyQuery = "qzxv"
while (countOf({ typed: emptyQuery, sort: "newest" }) > 0) emptyQuery += "q"
// University + degree + a word, sorted by name: the first combination with 3–36 results and 2+ distinct names.
const multi = (() => {
    for (const u of universities) {
        for (const d of degreeTypes) {
            const subset = all.filter((p) => p.universityId === u.id && p.degreeType === d)
            for (const w of [...new Set(subset.flatMap((p) => words(p.name)))].sort()) {
                const hits = subset.filter((p) => matches(p, { search: w, sortBy: "name", sortDesc: false }))
                if (hits.length >= 3 && hits.length <= 36 && new Set(hits.map((p) => p.name)).size >= 2) {
                    return { universityId: u.id, universityName: u.name, degreeType: d, typed: w }
                }
            }
        }
    }
    return undefined
})()
// The cohort option (as the select lists them) with the most programs.
const COHORT_OPTIONS = ["K23", "K22", "K21", "K20", "K19", "K18", "K17", "K16", "K15"]
const cohort = COHORT_OPTIONS.map((k): [string, number] => [k, countOf({ cohort: k, sort: "newest" })]).sort(
    (a, b) => b[1] - a[1]
)[0]
// The degree with the fewest programs (at least 13), sorted by credits.
const creditsDegree = degreeTypes
    .map((d): [string, number] => [d, countOf({ degreeType: d, sort: "credits" })])
    .filter(([, n]) => n >= 13)
    .sort(byCountThenText)[0]?.[0]

const capitalized = (w: string) => w[0].toUpperCase() + w.slice(1)
const createdMs = (p: MockProgram) => new Date(p.createdAt).getTime()
// The newest-first order of a search (V8's stable sort and Date parser, as in the browser).
const newestFirst = (c: Omit<Case, "label">) =>
    all.filter((p) => matches(p, paramsOf({ label: "", ...c }))).sort((a, b) => createdMs(b) - createdMs(a))
const SEARCH_CASES: Case[] = [
    { label: "diacritics word", typed: diacriticWord && capitalized(diacriticWord), sort: "newest" },
    { label: "two words in capitals", typed: twoWords?.toUpperCase(), sort: "newest" },
    { label: "university name", typed: uniQuery, sort: "newest" },
    { label: "program code", typed: codeQuery, sort: "newest" },
    { label: "empty result", typed: emptyQuery, sort: "newest" },
]
const FILTER_CASES: Case[] = [
    { label: "university + degree + search, by name", ...multi, sort: "name" },
    { label: "cohort", cohort: cohort?.[0], sort: "newest" },
    { label: "degree, by credits", degreeType: creditsDegree, sort: "credits" },
]

// A program whose card description is cut and whose full name finds at most one page of results.
const cutProgram = all.find(
    (p) =>
        cardDescription(p.description) !== p.description &&
        countOf({ typed: p.name, sort: "newest" }) <= 12 &&
        all.filter((q) => q.name === p.name && q.universityName === p.universityName).length === 1
)

// ---- browser helpers ------------------------------------------------------------------
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const SHOWING = new RegExp(
    "^" + esc(vi.showingCount).replace(esc("<strong>{shown}</strong>"), "(\\d+)").replace(esc("<strong>{total}</strong>"), "(\\d+)") + "$"
)
const LOAD_MORE = new RegExp("^" + esc(vi.loadMore).replace(esc("{loaded}"), "\\d+").replace(esc("{total}"), "\\d+") + "$")
const isJson = (url: string) => new URL(url).pathname.endsWith(".json")
type Sig = [string, string, string | null] // name, university, code — unique in the snapshot

async function openList(page: Page) {
    await page.goto("/vi", { waitUntil: "domcontentloaded" })
    // A rendered card = the list is hydrated and loaded.
    await expect(page.getByTestId("program-card").first()).toBeVisible({ timeout: 30000 })
}

async function pick(page: Page, combobox: string, option: string | RegExp) {
    await page.getByRole("combobox", { name: combobox, exact: true }).click()
    await page.getByRole("option", { name: option, exact: typeof option === "string" }).click()
}

async function applyCase(page: Page, c: Case) {
    if (c.universityId) await pick(page, vi.allUniversities, universities.find((u) => u.id === c.universityId)!.name)
    if (c.degreeType) await pick(page, vi.allDegrees, c.degreeType)
    if (c.cohort) await pick(page, vi.cohortAria, new RegExp(`^${esc(vi.cohortBadge.replace("{id}", c.cohort))} \\(`))
    if (c.sort !== "newest") await pick(page, vi.sort, c.sort === "name" ? vi.sortName : vi.sortCredits)
    if (c.typed) await page.getByPlaceholder(vi.searchPlaceholder, { exact: true }).fill(c.typed)
}

const cardSigs = (page: Page): Promise<Sig[]> =>
    page.getByTestId("program-card").evaluateAll((cards) =>
        cards.map((card): [string, string, string | null] => {
            const h3 = card.querySelector("h3")
            return [
                h3?.textContent ?? "",
                card.querySelector("h3 + div > span")?.textContent ?? "",
                h3?.previousElementSibling?.querySelector(":scope > span.bg-muted")?.textContent ?? null,
            ]
        })
    )

async function listTotal(page: Page): Promise<number | null> {
    const text = await page.getByText(SHOWING).first().textContent({ timeout: 1000 }).catch(() => null)
    const m = text ? SHOWING.exec(text.trim()) : null
    return m ? Number(m[2]) : null
}

/** api.ts applyFiltersAndSort at Base 4f6c51fc over every chunk — run in the page so localeCompare is the browser's. */
const oldResults = (page: Page, cases: Params[]): Promise<Sig[][]> =>
    page.evaluate(async (cases) => {
        type P = { name: string; code: string | null; universityName: string; universityId: string; degreeType: string | null; credits: number | null; createdAt: string }
        const index = await (await fetch("/mock/index.json")).json()
        const programs: P[] = (await Promise.all((index.chunks as string[]).map((f) => fetch(`/mock/programs/${f}`).then((r) => r.json())))).flat()
        return cases.map((params) => {
            let result = [...programs]
            if (params.search) {
                const search = params.search.toLowerCase()
                result = result.filter(
                    (p) =>
                        p.name.toLowerCase().includes(search) ||
                        (p.code?.toLowerCase().includes(search) ?? false) ||
                        p.universityName.toLowerCase().includes(search)
                )
            }
            if (params.degreeType) result = result.filter((p) => p.degreeType === params.degreeType)
            if (params.universityId) result = result.filter((p) => p.universityId === params.universityId)
            if (params.cohort && params.cohort !== "all") {
                const c = params.cohort.toLowerCase()
                result = result.filter((p) => (p.code && p.code.toLowerCase().includes(c)) || p.name.toLowerCase().includes(c))
            }
            const sortBy = params.sortBy?.toLowerCase()
            const sortDesc = params.sortDesc ?? false
            result.sort((a, b) => {
                switch (sortBy) {
                    case "name":
                        return sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)
                    case "credits":
                        return sortDesc ? (b.credits ?? 0) - (a.credits ?? 0) : (a.credits ?? 0) - (b.credits ?? 0)
                    case "createdat":
                        return sortDesc
                            ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                            : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                    default:
                        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                }
            })
            return result.map((p): [string, string, string | null] => [p.name, p.universityName, p.code ?? null])
        })
    }, cases)

/** Each case on a fresh list: count and card order (up to 3 pages) equal the old algorithm. */
async function expectSameAsOld(page: Page, cases: Case[]) {
    await openList(page)
    const expected = await oldResults(page, cases.map(paramsOf))
    for (const [k, c] of cases.entries()) {
        const want = expected[k]
        if (k > 0) await openList(page)
        await applyCase(page, c)
        if (want.length === 0) {
            await expect(page.getByRole("heading", { name: vi.emptyTitle, exact: true }), c.label).toBeVisible({ timeout: 20000 })
            await expect(page.getByTestId("program-card"), c.label).toHaveCount(0)
            continue
        }
        const pages = Math.min(3, Math.ceil(want.length / 12))
        for (let n = 1; n <= pages; n++) {
            if (n > 1) await page.getByRole("button", { name: LOAD_MORE }).click()
            await expect.poll(() => cardSigs(page), { message: `${c.label} page ${n}`, timeout: 20000 }).toEqual(want.slice(0, 12 * n))
        }
        await expect.poll(() => listTotal(page), { message: `${c.label} total` }).toBe(want.length)
    }
    return expected
}

test.describe("v2.50 — compact search index", () => {
    test.describe.configure({ timeout: 120000 })

    test("fixtures: every case is derived from the snapshot", () => {
        const shown = [...SEARCH_CASES, ...FILTER_CASES].map((c) => `${c.label}: ${JSON.stringify({ ...c, label: undefined, n: countOf(c) })}`)
        console.log(`[v250 ${test.info().project.name}] cases\n  ${shown.join("\n  ")}\n  cut program: ${cutProgram?.id}`)
        expect(all.length).toBeGreaterThan(1000)
        for (const c of [...SEARCH_CASES, ...FILTER_CASES]) {
            expect(c.typed || c.universityId || c.degreeType || c.cohort, c.label).toBeTruthy()
        }
        expect(NON_ASCII.test(diacriticWord ?? "")).toBe(true)
        expect(multi).toBeTruthy()
        expect(cohort[1]).toBeGreaterThan(0)
        expect(countOf({ typed: emptyQuery, sort: "newest" })).toBe(0)
        expect(cutProgram).toBeTruthy()
        // Tie-breaks are exercised: within the compared pages (≤ 36 cards) a newest-first case holds two programs
        // with the same createdAt (ms) and the credits case two with the same credits — their order is the input order.
        const hasTie = (xs: number[]) => new Set(xs).size < xs.length
        expect(SEARCH_CASES.some((c) => hasTie(newestFirst(c).slice(0, 36).map(createdMs)))).toBe(true)
        const byCredits = all.filter((p) => p.degreeType === creditsDegree).sort((a, b) => (b.credits ?? 0) - (a.credits ?? 0))
        expect(hasTie(byCredits.slice(0, 36).map((p) => p.credits ?? 0))).toBe(true)
        for (const key of ["showingCount", "loadMore", "emptyTitle", "searchPlaceholder", "allUniversities", "allDegrees", "cohortAria", "cohortBadge", "sort", "sortName", "sortCredits", "viewDetail"]) {
            expect(vi[key], key).toBeTruthy()
        }
    })

    test("drift: the committed index is what scripts/build-search-index.mjs builds, ≤ 1 MB", () => {
        let out = ""
        try {
            out = execFileSync(process.execPath, [path.join("scripts", "build-search-index.mjs"), "--check"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" })
        } catch (e) {
            const err = e as { stderr?: string; message: string }
            throw new Error(`build-search-index.mjs --check failed: ${err.stderr || err.message}`)
        }
        expect(out).toContain("matches public/mock")
        expect(statSync(INDEX_FILE).size).toBeLessThanOrEqual(BUDGET_BYTES)
    })

    test("the index holds the list fields of every program, in chunk order (recomputed here)", () => {
        const { fields } = readJson(INDEX_FILE)
        expect(fields).toEqual([...LIST_FIELDS])
        const want = all.map((p) =>
            Object.fromEntries(LIST_FIELDS.map((f) => [f, f === "description" ? cardDescription(p.description) : (p[f] ?? null)]))
        )
        expect(decodeIndex()).toEqual(want)
    })

    test("first search: ≤ 3 JSON requests and ≤ 1,000,000 bytes raw, measured from the network", async ({ page }, info) => {
        await openList(page)
        const typed = capitalized(diacriticWord!)
        const total = countOf({ typed, sort: "newest" })
        const seen = new Set<Request>()
        const pending = new Set<Request>()
        const got: { path: string; bytes: number }[] = []
        const reads: Promise<void>[] = []
        page.on("request", (r) => {
            if (!isJson(r.url())) return
            seen.add(r)
            pending.add(r)
        })
        page.on("requestfailed", (r) => pending.delete(r))
        page.on("response", (res) => {
            const r = res.request()
            if (!seen.has(r)) return
            reads.push(
                res
                    .body()
                    .then((b) => void got.push({ path: new URL(r.url()).pathname, bytes: b.length }))
                    .catch(() => void got.push({ path: new URL(r.url()).pathname, bytes: 0 }))
                    .finally(() => pending.delete(r))
            )
        })
        const firstHit = newestFirst({ typed, sort: "newest" })[0]
        const box = page.getByPlaceholder(vi.searchPlaceholder, { exact: true })
        // Typed key by key: every keystroke is a new query while the first one is still loading.
        await box.pressSequentially(typed, { delay: 40 })
        await expect(box).toHaveValue(typed)
        await expect.poll(() => listTotal(page), { timeout: 60000 }).toBe(total)
        await expect
            .poll(async () => (await cardSigs(page))[0], { timeout: 60000 })
            .toEqual([firstHit.name, firstHit.universityName, firstHit.code])
        await expect.poll(() => pending.size, { timeout: 60000 }).toBe(0)
        await Promise.all(reads)
        const bytes = got.reduce((s, x) => s + x.bytes, 0)
        const summary = `first search "${typed}" (${total} results): ${got.length} JSON requests, ${bytes} bytes raw — ${[...new Set(got.map((x) => x.path))].slice(0, 5).join(", ")}${got.length > 5 ? ", …" : ""}`
        console.log(`[v250 ${info.project.name}] ${summary}`)
        info.annotations.push({ type: "first-search", description: summary })
        expect(got.filter((x) => x.path.startsWith("/mock/programs/")), "no chunk is read").toEqual([])
        expect(got.length).toBeLessThanOrEqual(BUDGET_REQUESTS)
        expect(bytes).toBeLessThanOrEqual(BUDGET_BYTES)
    })

    test("search results equal the old full-chunk algorithm (diacritics, capitals, university, code, empty)", async ({ page }) => {
        await expectSameAsOld(page, SEARCH_CASES)
    })

    test("filtered and sorted results equal the old full-chunk algorithm (multi-filter by name, cohort, by credits)", async ({ page }) => {
        await expectSameAsOld(page, FILTER_CASES)
    })

    test("every cut card description still needs more than two lines at the widest card, and the dialog shows the full program", async ({ page }) => {
        const p = cutProgram!
        const cut = cardDescription(p.description)!
        const kept = decodeIndex()
            .map((r) => r.description)
            .filter((d): d is string => typeof d === "string" && d.endsWith("…"))
            .map((d) => d.slice(0, -1))
        expect(kept.length).toBeGreaterThan(0)

        await openList(page)
        await page.getByPlaceholder(vi.searchPlaceholder, { exact: true }).fill(p.name)
        const card = page
            .getByTestId("program-card")
            .filter({ has: page.getByRole("heading", { name: p.name, exact: true }) })
            .filter({ hasText: p.universityName })
        await expect(card).toHaveCount(1, { timeout: 30000 })
        const desc = card.locator("p.line-clamp-2")
        await expect(desc).toHaveText(cut)
        await page.evaluate(() => document.fonts.ready.then(() => undefined))
        // The rendered card is clamped at this project's width.
        expect(await desc.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)

        // A clone of the card's own <p> (same classes, font) at the widest card width.
        const notOverflowing = await desc.evaluate(
            (el, { texts, width }) => {
                const clone = el.cloneNode(false) as HTMLElement
                clone.style.width = `${width}px`
                clone.style.maxWidth = "none"
                el.parentElement!.appendChild(clone)
                const bad: string[] = []
                for (const t of texts) {
                    clone.textContent = t
                    if (!(clone.scrollHeight > clone.clientHeight)) bad.push(t)
                }
                clone.remove()
                return bad
            },
            { texts: kept, width: WIDEST_TEXT_PX }
        )
        expect(notOverflowing, `kept texts that fit in two lines at ${WIDEST_TEXT_PX}px`).toEqual([])
        console.log(`[v250] ${kept.length} cut descriptions measured at ${WIDEST_TEXT_PX}px: every kept text needs more than two lines`)

        // The dialog is fed by the full program (programs-by-id), not the index row.
        const byId = page.waitForResponse((r) => new URL(r.url()).pathname === `/mock/programs-by-id/${p.id}.json`)
        await card.getByRole("button", { name: vi.viewDetail, exact: true }).click()
        await byId
        const dialog = page.getByRole("dialog", { name: p.name, exact: true })
        await expect(dialog).toBeVisible({ timeout: 15000 })
        await expect.poll(() => dialog.locator("div.whitespace-pre-line").allTextContents()).toContain(p.description)
    })

    test("plain browsing and the compare page keep the chunk path and never load the index", async ({ page }) => {
        const indexRequests: string[] = []
        page.on("request", (r) => {
            if (new URL(r.url()).pathname === "/mock/search-index.json") indexRequests.push(r.url())
        })
        await openList(page)
        // Page 2 of 12 cards spans chunks 1–2.
        const chunk2 = page.waitForResponse((r) => new URL(r.url()).pathname === `/mock/programs/${chunks[1]}`)
        await page.getByRole("button", { name: LOAD_MORE }).click()
        await chunk2
        await expect(page.getByTestId("program-card")).toHaveCount(24)

        await page.goto("/vi/compare", { waitUntil: "domcontentloaded" })
        // Its browse options (the first 200 programs) are loaded = the page is hydrated.
        const select = page.getByRole("combobox", { name: vi.compareProgram1, exact: true })
        await expect.poll(() => select.locator("option").count(), { timeout: 30000 }).toBeGreaterThan(1)
        const lastChunk = page.waitForResponse((r) => new URL(r.url()).pathname === `/mock/programs/${chunks[chunks.length - 1]}`, { timeout: 60000 })
        const box = page.getByRole("searchbox", { name: vi.compareSearchLabel.replace("{slot}", vi.compareProgram1), exact: true })
        await box.fill(diacriticWord!)
        await lastChunk
        expect(indexRequests).toEqual([])
    })
})
