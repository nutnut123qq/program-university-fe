import { test, expect, Page, Route } from "@playwright/test"
import { existsSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.51 — API-mode parity (audit V8, gap G10).
 *
 * Needs a build made with shell env NEXT_PUBLIC_USE_MOCK=false (NEXT_PUBLIC_* is inlined at build
 * time and the shell wins over .env files); on any other build every test here is skipped. Run:
 *   NEXT_PUBLIC_USE_MOCK=false NEXT_PUBLIC_API_URL= E2E_PORT=3100 node node_modules/@playwright/test/cli.js \
 *     test -c e2e/playwright.local.config.ts e2e/v251-api-mode.spec.ts --project=…
 * (an empty NEXT_PUBLIC_API_URL keeps the build on the code's default API base, which is then asserted).
 *
 * No real API and no DB: every request off the app origin is answered by `page.route` from
 * public/mock (a stand-in for the .NET API, incl. its pageSize [Range(1, 1000)] → 400) or aborted.
 * Checked from the intercepted requests: list requests carry isActive=true and pageSize ≤ 1000 —
 * the score-filter pool and the compare slot search (whole catalog) page through; the cohort filter
 * is sent; the default base is http://localhost:5100/api; a non-GUID id (compare ?a=/b=/c=,
 * ?program=, wishlist) sends no request while a GUID still resolves. Cases are derived from
 * public/mock at test time; nothing named is pinned. domcontentloaded, not networkidle (§12).
 */
const API_BUILD = process.env.NEXT_PUBLIC_USE_MOCK === "false"
const SKIP_REASON =
    "API-mode spec: runs only on a build made with shell env NEXT_PUBLIC_USE_MOCK=false (v2.51); a mock build skips it"
const DEFAULT_BASE = "http://localhost:5100/api/"
const CHECK_DEFAULT_BASE = process.env.NEXT_PUBLIC_API_URL === ""
const API_MAX_PAGE_SIZE = 1000
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COHORT = /^[Kk][0-9]{2}$/

const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const vi: Record<string, string> = readJson(path.join(ROOT, "src", "messages", "vi.json")).programs

type MockProgram = {
    id: string
    universityId: string
    universityName: string
    name: string
    code: string | null
    degreeType: string | null
    credits: number | null
    description: string | null
    isActive: boolean
    createdAt: string
}
const all: MockProgram[] = (readJson(path.join(MOCK, "index.json")).chunks as string[]).flatMap((c) =>
    readJson(path.join(MOCK, "programs", c))
)
const universities: unknown[] = readJson(path.join(MOCK, "universities.json"))
const degreeTypes: string[] = readJson(path.join(MOCK, "degree-types.json"))
const mockFile = (dir: string, id: string) => {
    const f = path.join(MOCK, dir, `${id}.json`)
    return GUID.test(id) && existsSync(f) ? readJson(f) : null
}

// ---- the stand-in API (the .NET API's ProgramService rules over the snapshot) --------------------
const lower = (s: string | null | undefined) => (s ?? "").toLowerCase()
const createdMs = (p: MockProgram) => new Date(p.createdAt).getTime()

function listPrograms(q: URLSearchParams): [number, unknown] {
    const page = Number(q.get("page") ?? 1)
    const pageSize = Number(q.get("pageSize") ?? 20)
    const cohort = q.get("cohort")
    if (!(page >= 1) || !(pageSize >= 1 && pageSize <= API_MAX_PAGE_SIZE) || (cohort !== null && !COHORT.test(cohort))) {
        return [400, { title: "One or more validation errors occurred.", status: 400 }]
    }
    const search = lower(q.get("search")?.trim())
    let rows = all.filter(
        (p) =>
            (!search || [p.name, p.code, p.universityName, p.description].some((v) => lower(v).includes(search))) &&
            (!q.get("degreeType") || p.degreeType === q.get("degreeType")) &&
            (!q.get("universityId") || p.universityId === q.get("universityId")) &&
            (!cohort || lower(p.code).includes(lower(cohort)) || lower(p.name).includes(lower(cohort))) &&
            (!q.get("isActive") || String(p.isActive) === q.get("isActive"))
    )
    const desc = q.get("sortDesc") === "true"
    const key = lower(q.get("sortBy"))
    const cmp =
        key === "name"
            ? (a: MockProgram, b: MockProgram) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
            : key === "credits"
              ? (a: MockProgram, b: MockProgram) => (a.credits ?? 0) - (b.credits ?? 0)
              : (a: MockProgram, b: MockProgram) => createdMs(a) - createdMs(b)
    rows = [...rows].sort(key === "" ? (a, b) => createdMs(b) - createdMs(a) : desc ? (a, b) => cmp(b, a) : cmp)
    const totalPages = Math.ceil(rows.length / pageSize)
    return [
        200,
        {
            items: rows.slice((page - 1) * pageSize, page * pageSize),
            totalCount: rows.length,
            page,
            pageSize,
            totalPages,
            hasNextPage: totalPages > 0 && page < totalPages,
            hasPreviousPage: page > 1,
        },
    ]
}

function answer(route: string, q: URLSearchParams): [number, unknown] {
    if (route === "programs") return listPrograms(q)
    if (route === "programs/degree-types") return [200, degreeTypes]
    if (route === "universities")
        return [200, { items: universities, totalCount: universities.length, page: 1, pageSize: 20, totalPages: 1, hasNextPage: false, hasPreviousPage: false }]
    let m = /^programs\/([^/]+)$/.exec(route)
    if (m) {
        const p = mockFile("programs-by-id", m[1])
        return p ? [200, p] : [404, { status: 404 }]
    }
    m = /^curricula\/program\/([^/]+)$/.exec(route)
    if (m) return [200, mockFile("curricula", m[1]) ?? []]
    if (route === "rawdocuments") {
        const items = mockFile("raw-documents", q.get("programId") ?? "") ?? []
        return [200, { items, totalCount: items.length, page: 1, pageSize: 1000, totalPages: 1, hasNextPage: false, hasPreviousPage: false }]
    }
    return [404, { status: 404 }]
}

type Recorder = { api: URL[]; mock: string[]; aborted: number }

/** Answers every request off the app origin (API fixture or abort) and records what the page asked. */
async function useApi(page: Page, baseURL: string | undefined): Promise<Recorder> {
    const appOrigin = new URL(baseURL!).origin
    const rec: Recorder = { api: [], mock: [], aborted: 0 }
    page.on("request", (r) => {
        const u = new URL(r.url())
        if (u.origin === appOrigin && u.pathname.startsWith("/mock/")) rec.mock.push(u.pathname)
    })
    await page.route(
        (url) => url.origin !== appOrigin,
        async (route: Route) => {
            const url = new URL(route.request().url())
            const m = /^\/api\/(.+?)\/?$/.exec(url.pathname)
            if (!m) {
                rec.aborted++
                return route.abort()
            }
            rec.api.push(url)
            const [status, body] = answer(m[1], url.searchParams)
            return route.fulfill({
                status,
                contentType: "application/json",
                headers: { "access-control-allow-origin": "*" },
                body: JSON.stringify(body),
            })
        }
    )
    return rec
}

const isList = (u: URL) => /\/api\/programs\/?$/.test(u.pathname)
const lists = (rec: Recorder) => rec.api.filter(isList)
const byIdPaths = (rec: Recorder) => rec.api.filter((u) => /\/api\/programs\/./.test(u.pathname)).map((u) => u.pathname)

// Every list request: isActive=true and a page size the API accepts.
function expectListContract(rec: Recorder, label: string) {
    expect(lists(rec).length, `${label}: list requests`).toBeGreaterThan(0)
    for (const u of lists(rec)) {
        expect(u.searchParams.get("isActive"), `${label}: isActive`).toBe("true")
        expect(Number(u.searchParams.get("pageSize")), `${label}: pageSize`).toBeLessThanOrEqual(API_MAX_PAGE_SIZE)
    }
}

// ---- cases derived from the snapshot ------------------------------------------------------------
const listMatches = (s: string) => Number((listPrograms(new URLSearchParams({ search: s, pageSize: "1" }))[1] as { totalCount: number }).totalCount)
// The stand-in API's search rule for one program (name, code, university, description).
const isMatch = (id: string, q: string) => {
    const p = all.find((x) => x.id === id)
    return !!p && [p.name, p.code, p.universityName, p.description].some((v) => lower(v).includes(q))
}
// A one-letter compare search with more than API_MAX_PAGE_SIZE matches (needs page 2), not the whole catalog.
const bigQuery = [..."abcdefghijklmnopqrstuvwxyz"]
    .map((c): [string, number] => [c, listMatches(c)])
    .filter(([, n]) => n > API_MAX_PAGE_SIZE && n < all.length)
    .sort((a, b) => b[1] - a[1])[0]
const cohortCount = (k: string) =>
    Number((listPrograms(new URLSearchParams({ cohort: k, isActive: "true", pageSize: "1" }))[1] as { totalCount: number }).totalCount)
// The cohort option (K15–K23 in the filter) with the most programs.
const cohort = ["K23", "K22", "K21", "K20", "K19", "K18", "K17", "K16", "K15"]
    .map((k): [string, number] => [k, cohortCount(k)])
    .sort((a, b) => b[1] - a[1])[0]
// A program outside the compare page's 200 browse options (resolved by id).
const farProgram = all[all.length - 1]
const firstPage = (listPrograms(new URLSearchParams({ page: "1", pageSize: "12", sortBy: "createdAt", sortDesc: "true", isActive: "true" }))[1] as {
    items: MockProgram[]
}).items

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const SHOWING = new RegExp(
    "^" + esc(vi.showingCount).replace(esc("<strong>{shown}</strong>"), "(\\d+)").replace(esc("<strong>{total}</strong>"), "(\\d+)") + "$"
)

async function openList(page: Page, url = "/vi") {
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("program-card").first()).toBeVisible({ timeout: 30000 })
}

async function listTotal(page: Page): Promise<number | null> {
    const text = await page.getByText(SHOWING).first().textContent({ timeout: 1000 }).catch(() => null)
    const m = text ? SHOWING.exec(text.trim()) : null
    return m ? Number(m[2]) : null
}

async function compareSelects(page: Page) {
    const selects = page.locator("select")
    await expect(selects.first()).toBeVisible({ timeout: 30000 })
    await page.waitForFunction(() => (document.querySelectorAll("select")[0]?.options.length ?? 0) > 10, undefined, { timeout: 30000 })
    return selects
}

test.describe("v2.51 — API mode", () => {
    test.skip(!API_BUILD, SKIP_REASON)
    test.describe.configure({ timeout: 120000 })

    test("fixtures: cases derived from the snapshot", () => {
        console.log(
            `[v251 ${test.info().project.name}] API build, default-base check ${CHECK_DEFAULT_BASE ? "on" : "off"}; ` +
                `${all.length} programs; compare query "${bigQuery?.[0]}" ${bigQuery?.[1]} matches; cohort ${cohort[0]} ${cohort[1]}; far program ${farProgram.id}`
        )
        expect(all.length).toBeGreaterThan(API_MAX_PAGE_SIZE)
        expect(bigQuery).toBeTruthy()
        expect(cohort[1]).toBeGreaterThan(0)
        expect(mockFile("programs-by-id", farProgram.id)?.id).toBe(farProgram.id)
        expect(firstPage).toHaveLength(12)
        expect(vi.showingCount && vi.cohortAria && vi.cohortBadge).toBeTruthy()
    })

    test("list: API requests only, isActive=true, page size ≤ 1000, default base", async ({ page, baseURL }) => {
        const rec = await useApi(page, baseURL)
        await openList(page)
        await expect
            .poll(() => page.getByTestId("program-card").locator("h3").allTextContents(), { timeout: 20000 })
            .toEqual(firstPage.map((p) => p.name))
        expectListContract(rec, "first page")
        // An API build reads no program data from the snapshot files.
        expect(rec.mock.filter((p) => /^\/mock\/(index|search-index)\.json$|^\/mock\/programs(-by-id)?\//.test(p))).toEqual([])
        if (CHECK_DEFAULT_BASE) {
            expect(rec.api.every((u) => u.href.startsWith(DEFAULT_BASE)), "every API request goes to the default base").toBe(true)
        }
        console.log(`[v251 ${test.info().project.name}] list: ${rec.api.length} API requests (${lists(rec).length} list), ${rec.aborted} aborted`)
    })

    test("cohort filter is sent and applied", async ({ page, baseURL }) => {
        const rec = await useApi(page, baseURL)
        await openList(page)
        await page.getByRole("combobox", { name: vi.cohortAria, exact: true }).click()
        await page.getByRole("option", { name: new RegExp(`^${esc(vi.cohortBadge.replace("{id}", cohort[0]))} \\(`) }).click()
        await expect
            .poll(() => lists(rec).filter((u) => u.searchParams.get("cohort") === cohort[0]).length, { timeout: 20000 })
            .toBeGreaterThan(0)
        await expect.poll(() => listTotal(page), { timeout: 20000 }).toBe(cohort[1])
        expectListContract(rec, "cohort")
    })

    test("score-filter pool pages through the API limit", async ({ page, baseURL }) => {
        const rec = await useApi(page, baseURL)
        await openList(page)
        await page.getByTestId("score-filter-input").fill("22")
        await page.getByRole("combobox", { name: vi.scoreFilterScale, exact: true }).click()
        await page.getByRole("option", { name: "30", exact: true }).click()
        await expect(page.getByTestId("score-filter-result")).toBeVisible({ timeout: 60000 })
        const pool = lists(rec).filter((u) => u.searchParams.get("pageSize") === String(API_MAX_PAGE_SIZE))
        const pages = pool.map((u) => Number(u.searchParams.get("page")))
        expect(new Set(pages)).toEqual(new Set(Array.from({ length: Math.ceil(all.length / API_MAX_PAGE_SIZE) }, (_, i) => i + 1)))
        expectListContract(rec, "score pool")
        console.log(`[v251 ${test.info().project.name}] score pool: pages ${pages.join(",")} of ${API_MAX_PAGE_SIZE}`)
    })

    test("compare slot search lists every match across API pages", async ({ page, baseURL }) => {
        const rec = await useApi(page, baseURL)
        await page.goto("/vi/compare", { waitUntil: "domcontentloaded" })
        const slot = (await compareSelects(page)).first()
        const current = await slot.inputValue()
        const [q, n] = bigQuery!
        await page.getByTestId("compare-search-1").fill(q)
        // every match + the disabled placeholder + the slot's current program when it does not match
        const want = n + 1 + (isMatch(current, q) ? 0 : 1)
        await expect.poll(() => slot.locator("option").count(), { timeout: 30000 }).toBe(want)
        const searches = lists(rec).filter((u) => u.searchParams.get("search") === q)
        expect(searches.map((u) => Number(u.searchParams.get("page"))).sort()).toEqual([1, 2])
        expectListContract(rec, "compare")
    })

    test("non-GUID ids reach no fetch path; a GUID still resolves", async ({ page, baseURL }) => {
        const rec = await useApi(page, baseURL)
        const far = `/api/programs/${farProgram.id}`

        // compare ?a=/b=/c=: "zzz", a sibling route name, "." (= the list route after URL normalisation)
        for (const query of [`a=zzz&b=${farProgram.id}&c=degree-types`, `a=.&b=${farProgram.id}`]) {
            rec.api.length = 0
            await page.goto(`/vi/compare?${query}`, { waitUntil: "domcontentloaded" })
            await compareSelects(page)
            await expect(page.getByTestId("compare-invalid-1"), query).toBeVisible({ timeout: 30000 })
            await expect(page.getByRole("heading", { name: farProgram.name, exact: true }).first(), query).toBeVisible()
            if (query.includes("c=")) await expect(page.getByTestId("compare-invalid-3")).toBeVisible()
            expect(byIdPaths(rec), query).toEqual([far])
            // "." must not turn into a list request beyond the browse list itself
            expect(lists(rec).every((u) => u.searchParams.get("pageSize") === "200"), query).toBe(true)
        }

        // ?program= on the list
        rec.api.length = 0
        await openList(page, "/vi?program=zzz")
        await expect(page.getByTestId("program-link-notice")).toHaveAttribute("data-reason", "invalid")
        expect(byIdPaths(rec).filter((p) => p !== "/api/programs/degree-types")).toEqual([])

        // wishlist ids from localStorage
        await page.evaluate((ids) => window.localStorage.setItem("tedo:wishlist", JSON.stringify(ids)), ["zzz", farProgram.id])
        rec.api.length = 0
        await openList(page, "/vi")
        const open = page.getByTestId("wishlist-open")
        await expect(open).toContainText("(2)", { timeout: 15000 })
        await open.click()
        await expect(page.getByRole("checkbox", { name: farProgram.name, exact: true })).toBeVisible({ timeout: 15000 })
        expect(byIdPaths(rec).filter((p) => p !== "/api/programs/degree-types")).toEqual([far])
    })
})
