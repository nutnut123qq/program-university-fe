import { test, expect, Page, Locator } from "@playwright/test"
import { existsSync, readFileSync } from "fs"
import path from "path"
import { applyFiltersAndSort } from "../src/features/programs/api"
import type { ProgramSummary } from "../src/features/programs/types"

/**
 * v2.54 — documents without full text (M4 UI) + honest null credits/duration (M5 UI).
 *
 * Documents tab: each raw document shows at most a short excerpt (≤ 300 chars at a word
 * boundary + "…", labelled as an excerpt) and a link to its source (http/https only,
 * target=_blank, rel=noopener noreferrer) — no full-text viewer. A longer text and a
 * non-http(s) url are served through page.route to check the defensive cut and the
 * "no public link" text whatever the snapshot holds.
 * Null credits / duration: the detail dialog and compare show the "not verified" text
 * (never "null", "0", "NaN", "N/A" or an empty label); the compact card shows no badge for
 * a null value (as before v2.54) and the badge for a real one. Sorting by credits puts every
 * null after every value, ascending and descending, on every mock list path.
 *
 * Fixtures come from public/mock at test time (nothing named is pinned): the first listed
 * program with a text-bearing raw document; for null credits, null duration and "both
 * values" the listed program (same in programs-by-id) whose name search lists the fewest
 * cards (≤ one page) and is unique by (name, university); for the filtered sort the
 * smallest university having both null and non-null credits. A finder that throws, or
 * finds nothing while the snapshot has such programs, fails the fixtures test — the other
 * tests only skip when the snapshot really has no such program. Message strings are read
 * from src/messages. domcontentloaded, not networkidle (AGENTS.md §12).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const messages = (locale: "vi" | "en"): Record<string, string | undefined> =>
    readJson(path.join(ROOT, "src", "messages", `${locale}.json`)).programs
const vi = messages("vi")
const NEW_KEYS = ["notVerified", "creditsNotVerified", "rawDocExcerptLabel", "rawDocSourceLink", "rawDocNoPublicLink"]

const EXCERPT_MAX = 300
const PAGE_SIZE = 12 // ProgramList's page of results
const OLD_VIEWER = /^(Xem văn bản|Ẩn văn bản|View Text|Hide Text)$/i
// Card badge icons (lucide adds `lucide-<kebab name>`): BookOpen = credits, Clock = duration.
const ICON = { credits: "svg.lucide-book-open", duration: "svg.lucide-clock" } as const
const norm = (s: string) => s.replace(/\s+/g, " ").trim()
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const fill = (msg: string, vars: Record<string, string>) => msg.replace(/\{(\w+)\}/g, (_, k) => vars[k])
const httpUrl = (url: string | null | undefined): URL | null => {
    try {
        const u = new URL(url ?? "")
        return u.protocol === "http:" || u.protocol === "https:" ? u : null
    } catch {
        return null
    }
}

type Row = ProgramSummary
type Doc = { id: string; url: string | null; extractedText?: string | null }
type NullField = "credits" | "duration"
type Fixture = { program: Row | null; candidates: number }
const NONE: Fixture = { program: null, candidates: 0 }

let finderError: string | null = null
let listed: Row[] = []
let indexRows: Row[] = []
let withDoc: { program: Row; docs: Doc[] } | null = null
let anyDocText = false
const nulls: Record<NullField, Fixture> = { credits: NONE, duration: NONE }
let valued: Fixture = NONE
let sortUni: { id: string; name: string; count: number } | null = null
let sortUniCandidates = 0

try {
    listed = (readJson(path.join(MOCK, "index.json")).chunks as string[]).flatMap((c) => readJson(path.join(MOCK, "programs", c)))
    if (listed.length === 0) throw new Error("no listed programs in public/mock")
    // What the browser sorts in mock mode (scripts/build-search-index.mjs, dictionary-coded).
    const index = readJson(path.join(MOCK, "search-index.json")) as { fields: string[]; values: Record<string, unknown[]>; rows: unknown[][] }
    indexRows = index.rows.map((row) => Object.fromEntries(index.fields.map((f, i) => [f, index.values[f] ? index.values[f][row[i] as number] : row[i]]))) as Row[]

    // Stops at the first match; scans everything only when there is none.
    for (const p of listed) {
        const f = path.join(MOCK, "raw-documents", `${p.id}.json`)
        if (!existsSync(f)) continue
        const docs: Doc[] = readJson(f)
        if (!docs.some((d) => norm(d.extractedText ?? ""))) continue
        anyDocText = true
        if (docs.some((d) => httpUrl(d.url))) {
            withDoc = { program: p, docs }
            break
        }
    }

    // The fewest search hits first (api.ts search: lowercase substring of name/code/university).
    const hay = listed.map((r) => [r.name, r.code ?? "", r.universityName].map((s) => s.toLowerCase()))
    const hitsOf = (s: string) => hay.filter((h) => h.some((x) => x.includes(s))).length
    const searchable = (keep: (r: Row) => boolean): Fixture => {
        const candidates = listed.filter(keep)
        const ranked = candidates.map((r) => ({ r, hits: hitsOf(r.name.toLowerCase()) })).sort((a, b) => a.hits - b.hits)
        for (const { r, hits } of ranked) {
            if (hits > PAGE_SIZE) break
            if (listed.filter((x) => x.name === r.name && x.universityName === r.universityName).length !== 1) continue
            if (keep(readJson(path.join(MOCK, "programs-by-id", `${r.id}.json`)))) return { program: r, candidates: candidates.length }
        }
        return { program: null, candidates: candidates.length }
    }
    nulls.credits = searchable((r) => r.credits == null)
    nulls.duration = searchable((r) => r.duration == null)
    // Integer < 1000: the badge text is the plain number in both locales.
    valued = searchable((r) => Number.isInteger(r.credits) && (r.credits as number) < 1000 && !!r.duration?.trim())

    const universities: { id: string; name: string }[] = readJson(path.join(MOCK, "universities.json"))
    const mixed = universities
        .map((u) => {
            const rows = listed.filter((r) => r.universityId === u.id)
            return { ...u, count: rows.length, nulls: rows.filter((r) => r.credits == null).length }
        })
        .filter((u) => u.nulls > 0 && u.nulls < u.count)
        .sort((a, b) => a.count - b.count)
    sortUniCandidates = mixed.length
    sortUni = mixed[0] ?? null
} catch (e) {
    finderError = e instanceof Error ? e.message : String(e)
}

/** Every null after every value; values ascending or descending. */
function expectNullsLast(rows: Row[], desc: boolean, label: string) {
    const firstNull = rows.findIndex((r) => r.credits == null)
    const values = rows.slice(0, firstNull < 0 ? rows.length : firstNull).map((r) => r.credits as number)
    if (firstNull >= 0) expect(rows.slice(firstNull).every((r) => r.credits == null), `${label}: a value after a null`).toBe(true)
    expect(values.every((v) => typeof v === "number"), label).toBe(true)
    expect(values, `${label}: values in order`).toEqual([...values].sort((a, b) => (desc ? b - a : a - b)))
}

const sortByCredits = (rows: Row[], desc: boolean, universityId?: string) =>
    applyFiltersAndSort(rows, { page: 1, pageSize: rows.length, sortBy: "credits", sortDesc: desc, universityId }).items

const dialogNamed = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function openDialog(page: Page, p: Row): Promise<Locator> {
    await page.goto(`/vi?program=${p.id}`, { waitUntil: "domcontentloaded" })
    const box = dialogNamed(page, p.name)
    await expect(box).toBeVisible({ timeout: 30000 })
    return box
}

async function openDocuments(page: Page, p: Row): Promise<Locator> {
    const box = await openDialog(page, p)
    await box.getByRole("tab", { name: vi.rawDocumentsTab!, exact: true }).click()
    return box
}

async function openList(page: Page) {
    await page.goto("/vi", { waitUntil: "domcontentloaded" })
    // A rendered card = the list is hydrated and loaded.
    await expect(page.getByTestId("program-card").first()).toBeVisible({ timeout: 30000 })
}

async function pick(page: Page, combobox: string, option: string) {
    await page.getByRole("combobox", { name: combobox, exact: true }).click()
    await page.getByRole("option", { name: option, exact: true }).click()
}

const cardNames = (page: Page) => page.getByTestId("program-card").locator("h3").allTextContents()

/** The value next to a label (`<span>label</span><span>value</span>`). */
const valueOf = (scope: Locator, label: string) => scope.getByText(label, { exact: true }).locator("xpath=following-sibling::span[1]")

test.describe("v2.54 — documents excerpt + null credits/duration", () => {
    test.describe.configure({ timeout: 90000 })

    test("fixtures: the finder runs and finds what the snapshot has", () => {
        expect(finderError, "fixture finder error").toBeNull()
        expect(listed.length).toBeGreaterThan(0)
        expect(indexRows.map((r) => r.id)).toEqual(listed.map((r) => r.id))
        // Text-bearing documents exist ⇒ the finder must pick one (with an http(s) source).
        if (anyDocText) expect(withDoc, "a program with a text-bearing raw document and an http(s) url").not.toBeNull()
        // Such programs exist ⇒ the finder must pick one; else the tests below skip.
        for (const [label, f] of [["credits null", nulls.credits], ["duration null", nulls.duration], ["both values", valued]] as const) {
            if (f.candidates > 0) expect(f.program, `${label}: ${f.candidates} rows but no searchable fixture`).not.toBeNull()
        }
        if (sortUniCandidates > 0) expect(sortUni).not.toBeNull()
    })

    test("messages: the new copy exists in vi and en", () => {
        for (const locale of ["vi", "en"] as const) {
            const m = messages(locale)
            for (const key of NEW_KEYS) expect(m[key], `${locale}.programs.${key}`).toBeTruthy()
            expect(m.rawDocSourceLink).toContain("{domain}")
        }
    })

    test("documents tab: a short excerpt and a source link per document, no full-text viewer", async ({ page }) => {
        test.skip(!withDoc, "public/mock has no raw document with text and an http(s) url")
        const { program, docs } = withDoc!
        const box = await openDocuments(page, program)
        const cards = box.getByTestId("raw-doc")
        await expect(cards).toHaveCount(docs.length, { timeout: 15000 })

        for (const [i, doc] of docs.entries()) {
            const card = cards.nth(i)
            const src = norm(doc.extractedText ?? "")
            const excerpt = card.getByTestId("raw-doc-excerpt")
            if (!src) {
                await expect(excerpt).toHaveCount(0)
            } else {
                await expect(card.getByText(vi.rawDocExcerptLabel!, { exact: true })).toBeVisible()
                const shown = norm((await excerpt.textContent()) ?? "")
                expect(shown.length, `doc ${i} excerpt length`).toBeLessThanOrEqual(EXCERPT_MAX + 1)
                if (src.replace(/…$/, "").length <= EXCERPT_MAX) {
                    expect(shown).toBe(src)
                } else {
                    expect(shown.endsWith("…")).toBe(true)
                    expect(src.startsWith(shown.slice(0, -1)), `doc ${i} excerpt is the start of its text`).toBe(true)
                }
            }

            const u = httpUrl(doc.url)
            if (u) {
                const link = card.getByRole("link", { name: fill(vi.rawDocSourceLink!, { domain: u.hostname.replace(/^www\./, "") }), exact: true })
                await expect(link).toHaveAttribute("href", doc.url!)
                await expect(link).toHaveAttribute("target", "_blank")
                expect(((await link.getAttribute("rel")) ?? "").split(/\s+/)).toEqual(expect.arrayContaining(["noopener", "noreferrer"]))
            } else {
                await expect(card.getByRole("link")).toHaveCount(0)
                await expect(card.getByText(vi.rawDocNoPublicLink!, { exact: true })).toBeVisible()
            }
        }
        await expect(box.getByRole("button", { name: OLD_VIEWER })).toHaveCount(0)
    })

    test("a longer text is cut at a word to the excerpt; a non-http(s) url gets no link", async ({ page }) => {
        test.skip(!withDoc, "public/mock has no raw document with text and an http(s) url")
        const { program, docs } = withDoc!
        const marker = "ZZTAILV254"
        const long = `${Array.from({ length: 400 }, (_, i) => `từ${i}`).join(" ")} ${marker}`
        const served = [{ ...docs[0], extractedText: long, url: "javascript:alert(1)" }, ...docs.slice(1)]
        await page.route(`**/mock/raw-documents/${program.id}.json`, (r) => r.fulfill({ json: served }))

        const box = await openDocuments(page, program)
        const card = box.getByTestId("raw-doc").first()
        const excerpt = card.getByTestId("raw-doc-excerpt")
        await expect(excerpt).toBeVisible({ timeout: 15000 })
        const shown = norm((await excerpt.textContent()) ?? "")
        expect(shown.length).toBeLessThanOrEqual(EXCERPT_MAX + 1)
        expect(shown.endsWith("…")).toBe(true)
        const body = shown.slice(0, -1)
        expect(long.startsWith(body)).toBe(true)
        expect(long[body.length], "cut at a word boundary").toBe(" ")
        await expect(box).not.toContainText(marker)

        await expect(card.getByRole("link")).toHaveCount(0)
        await expect(card.getByText(vi.rawDocNoPublicLink!, { exact: true })).toBeVisible()
        await expect(box.locator('a[href^="javascript:"]')).toHaveCount(0)
        await expect(box.getByRole("button", { name: OLD_VIEWER })).toHaveCount(0)
    })

    test("card: no credits / duration badge for a null value, the badge for a real one", async ({ page }) => {
        const cases: [Row, NullField, boolean][] = [
            ...(nulls.credits.program ? [[nulls.credits.program, "credits", false] as [Row, NullField, boolean]] : []),
            ...(nulls.duration.program ? [[nulls.duration.program, "duration", false] as [Row, NullField, boolean]] : []),
            ...(valued.program ? (["credits", "duration"] as NullField[]).map((f) => [valued.program!, f, true] as [Row, NullField, boolean]) : []),
        ]
        test.skip(cases.length === 0, "public/mock has no searchable program with null or real credits/duration")
        const creditsBadge = new RegExp(esc(vi.credits!).replace(esc("{count}"), "\\d+"))
        await openList(page)

        for (const [p, field, hasValue] of cases) {
            await page.getByPlaceholder(vi.searchPlaceholder!, { exact: true }).fill(p.name)
            const card = page
                .getByTestId("program-card")
                .filter({ has: page.getByRole("heading", { name: p.name, exact: true }) })
                .filter({ hasText: p.universityName })
            await expect(card, p.id).toHaveCount(1, { timeout: 30000 })
            const icon = card.locator(ICON[field])
            if (hasValue) {
                const want = field === "credits" ? fill(vi.credits!, { count: String(p.credits) }) : norm(p.duration!)
                await expect(icon.locator(".."), `${field} badge of ${p.id}`).toHaveText(want)
            } else {
                await expect(icon, `no ${field} badge for ${p.id}`).toHaveCount(0)
                if (field === "credits") await expect(card).not.toContainText(creditsBadge)
                await expect(card).not.toContainText(/\b(null|NaN|undefined)\b/)
            }
        }
    })

    test("detail dialog: null credits / duration read 'not verified'", async ({ page }) => {
        const pc = nulls.credits.program
        const pd = nulls.duration.program
        test.skip(!pc && !pd, "no listed program has null credits or duration in public/mock/programs-by-id")
        if (pc) {
            const box = await openDialog(page, pc)
            await expect(box.getByText(vi.creditsNotVerified!, { exact: true })).toBeVisible()
        }
        if (pd) {
            const box = await openDialog(page, pd)
            // The info tab is the default tab.
            await expect(valueOf(box, vi.duration!)).toHaveText(vi.notVerified!)
        }
    })

    test("compare: null credits / duration read 'not verified', not N/A", async ({ page }) => {
        const pc = nulls.credits.program
        const pd = nulls.duration.program
        test.skip(!pc && !pd, "no listed program has null credits or duration in public/mock/programs-by-id")
        const a = (pc ?? pd)!
        const other = listed.find((p) => p.id !== a.id)!
        const b = pd && pd.id !== a.id ? pd : other
        await page.goto(`/vi/compare?a=${a.id}&b=${b.id}`, { waitUntil: "domcontentloaded" })
        const cards = [page.getByTestId("compare-card-1"), page.getByTestId("compare-card-2")]
        await expect(cards[0]).toBeVisible({ timeout: 30000 })
        await expect(cards[0]).toContainText(a.name)

        if (pc) await expect(valueOf(cards[0], vi.compareTotalCredits!)).toHaveText(vi.notVerified!)
        if (pd) {
            const card = cards[pd.id === a.id ? 0 : 1]
            await expect(card).toBeVisible({ timeout: 30000 })
            await expect(valueOf(card, vi.duration!)).toHaveText(vi.notVerified!)
        }
    })

    test("sort by credits (api.ts): every null after every value, ascending and descending", () => {
        test.skip(!listed.some((r) => r.credits == null), "public/mock has no program with null credits")
        // The search-index rows (search/filter/sort path) and the chunk rows (whole-catalog path).
        for (const [label, rows] of [["index", indexRows], ["chunks", listed]] as const) {
            for (const desc of [false, true]) {
                const all = sortByCredits(rows, desc)
                expect(all).toHaveLength(rows.length)
                expectNullsLast(all, desc, `${label} ${desc ? "desc" : "asc"}`)
                if (sortUni) expectNullsLast(sortByCredits(rows, desc, sortUni.id), desc, `${label} ${sortUni.name} ${desc ? "desc" : "asc"}`)
            }
        }
    })

    test("the list sorted by credits: plain paging and a university filter list nulls last", async ({ page }) => {
        test.skip(!sortUni, "public/mock has no university with both null and non-null credits")
        await openList(page)
        await pick(page, vi.sort!, vi.sortCredits!)
        // Plain paging (no filter) now sorts too: the first page = the first 12 of the catalog by credits.
        const top = sortByCredits(indexRows, true).slice(0, PAGE_SIZE).map((r) => r.name)
        await expect.poll(() => cardNames(page), { timeout: 30000 }).toEqual(top)

        await pick(page, vi.allUniversities!, sortUni!.name)
        const want = sortByCredits(indexRows, true, sortUni!.id)
        expect(want).toHaveLength(sortUni!.count)
        // "Xem thêm (12/N)" with N = this university's count = the filtered list is the one on screen.
        for (let shown = PAGE_SIZE; shown < want.length; shown += PAGE_SIZE) {
            const loadMore = page.getByRole("button", { name: fill(vi.loadMore!, { loaded: String(shown), total: String(want.length) }), exact: true })
            await expect(loadMore).toBeVisible({ timeout: 30000 })
            await loadMore.click()
        }
        await expect.poll(() => cardNames(page), { timeout: 30000 }).toEqual(want.map((r) => r.name))
        // On screen: no card with a credits badge after one without.
        const badges = await page.getByTestId("program-card").evaluateAll((cards, sel) => cards.map((c) => c.querySelector(sel) !== null), ICON.credits)
        expect(badges.indexOf(false)).toBeGreaterThan(0)
        expect(badges.slice(badges.indexOf(false)).every((b) => !b)).toBe(true)
    })
})
