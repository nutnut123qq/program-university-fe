import { test, expect, Page } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"

/**
 * v2.43 — the compare picker reaches every program.
 *
 * Each slot's select lists only the first 200 programs; a search box above it
 * lists every program matching the query, so any program can be picked. The
 * target program is taken from public/mock at test time (the last one in page
 * order) and asserted to be absent from the select before searching — nothing
 * data-dependent is pinned. Ids taken from the URL are encoded before they hit
 * /mock/programs-by-id/, so an odd id is an honest invalid id, never another
 * file. domcontentloaded, not networkidle: a 404 mock fetch can keep
 * networkidle pending on `next start` (AGENTS.md §12).
 */
const PROG_A = "9676bdf4-4586-420d-86d5-03559d09814f" // Công nghệ thông tin (CN1) — ĐH Công nghệ, ĐHQGHN
const PROG_B = "18f67362-9ae0-4832-96c8-287cc3b712fa" // Công nghệ sinh học — ĐH Công nghệ TP.HCM
const NAME_A = "Công nghệ thông tin (CN1)"
const NAME_B = "Công nghệ sinh học"
const NO_MATCH = "zzqx không tồn tại 0000"

type MockProgram = { id: string; name: string; code?: string | null; universityName: string }

const MOCK = path.join(__dirname, "..", "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const vi = readJson(path.join(__dirname, "..", "src", "messages", "vi.json")).programs

// All programs in the paged mock's order (fetchPrograms page order).
function mockPrograms(): MockProgram[] {
    const index = readJson(path.join(MOCK, "index.json"))
    const pages: string[] = index.chunks ?? Array.from({ length: index.totalPages }, (_, i) => `page-${i + 1}.json`)
    return pages.flatMap((file) => readJson(path.join(MOCK, "programs", file)))
}

// Mock-mode search rule of fetchPrograms: name, code or university name contains the query.
const matching = (all: MockProgram[], q: string) =>
    all.filter((p) => [p.name, p.code ?? "", p.universityName].some((s) => s.toLowerCase().includes(q.toLowerCase())))

const searchBox = (page: Page, slot: number) =>
    page.getByRole("searchbox", { name: vi.compareSearchLabel.replace("{slot}", vi[`compareProgram${slot}`]), exact: true })
const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true })
const realOptions = (page: Page, slot: number) => page.locator("select").nth(slot - 1).locator("option:not([disabled])")

async function waitForOptions(page: Page) {
    const selects = page.locator("select")
    await expect(selects.first()).toBeVisible({ timeout: 15000 })
    await page.waitForFunction(
        () => (document.querySelectorAll("select")[0]?.options.length ?? 0) > 10,
        { timeout: 20000 }
    )
    return selects
}

async function noHorizontalScroll(page: Page) {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        clientWidth: window.innerWidth,
    }))
    expect(scrollWidth, `scrollWidth ${scrollWidth} > ${clientWidth}`).toBeLessThanOrEqual(clientWidth + 1)
}

// The last program in page order is far outside the first-200 picker options.
function outsideTarget() {
    const all = mockPrograms()
    expect(all.length, "the catalog must be larger than the 200 picker options").toBeGreaterThan(200)
    const first200 = new Set(all.slice(0, 200).map((p) => p.id))
    const target = [...all]
        .reverse()
        .find((p) => !first200.has(p.id) && ![PROG_A, PROG_B].includes(p.id) && ![NAME_A, NAME_B].includes(p.name))
    expect(target, "a program outside the first 200").toBeTruthy()
    return { all, target: target! }
}

test.describe("Compare page — search picks any program (v2.43)", () => {
    test("search finds a program outside the first-200 options; the pick sets the slot and URL and stays selected", async ({ page }) => {
        const { all, target } = outsideTarget()
        const matches = matching(all, target.name)
        expect(matches.some((p) => p.id === target.id)).toBe(true)
        expect(matching(all, NO_MATCH)).toHaveLength(0)

        await page.goto(`/vi/compare?a=${PROG_A}&b=${PROG_B}`, { waitUntil: "domcontentloaded" })
        const selects = await waitForOptions(page)
        await expect(selects.nth(1)).toHaveValue(PROG_B, { timeout: 15000 })
        // Not pickable from the browse options.
        await expect(selects.nth(1).locator(`option[value="${target.id}"]`)).toHaveCount(0)

        await searchBox(page, 2).fill(target.name)
        await expect(selects.nth(1).locator(`option[value="${target.id}"]`)).toHaveCount(1, { timeout: 15000 })
        // Every match is listed (none cut off) + the slot's current program, kept.
        const keepsCurrent = matches.some((p) => p.id === PROG_B) ? 0 : 1
        await expect(realOptions(page, 2)).toHaveCount(matches.length + keepsCurrent)
        await expect(selects.nth(1)).toHaveValue(PROG_B)

        await selects.nth(1).selectOption(target.id)

        await expect(selects.nth(1)).toHaveValue(target.id)
        await expect(heading(page, target.name)).toBeVisible({ timeout: 15000 })
        await expect(heading(page, NAME_B)).toHaveCount(0)
        await expect(page).toHaveURL(new RegExp(`/vi/compare\\?a=${PROG_A}&b=${target.id}$`), { timeout: 15000 })

        // Another query (no match): honest empty message, the pick stays.
        await searchBox(page, 2).fill(NO_MATCH)
        await expect(page.getByTestId("compare-search-empty-2")).toHaveText(vi.compareSearchEmpty, { timeout: 15000 })
        await expect(selects.nth(1)).toHaveValue(target.id)
        await expect(realOptions(page, 2)).toHaveCount(1)

        // Cleared: the browse options are back and the pick is still selected.
        await searchBox(page, 2).fill("")
        await expect(page.getByTestId("compare-search-empty-2")).toHaveCount(0)
        await expect(selects.nth(1)).toHaveValue(target.id)
        expect(await realOptions(page, 2).count()).toBeGreaterThan(200)
        await expect(heading(page, target.name)).toBeVisible()
        await expect(page).toHaveURL(new RegExp(`/vi/compare\\?a=${PROG_A}&b=${target.id}$`))

        // The written link resolves the same pair.
        await page.reload({ waitUntil: "domcontentloaded" })
        await waitForOptions(page)
        await expect(page.locator("select").nth(1)).toHaveValue(target.id, { timeout: 15000 })
        await expect(heading(page, target.name)).toBeVisible()
    })

    test("a query with no match shows the empty message and leaves the slot alone", async ({ page }) => {
        expect(matching(mockPrograms(), NO_MATCH)).toHaveLength(0)

        await page.goto(`/vi/compare?a=${PROG_A}&b=${PROG_B}`, { waitUntil: "domcontentloaded" })
        const selects = await waitForOptions(page)
        await expect(selects.nth(0)).toHaveValue(PROG_A, { timeout: 15000 })

        await searchBox(page, 1).fill(NO_MATCH)

        const empty = page.getByTestId("compare-search-empty-1")
        await expect(empty).toHaveText(vi.compareSearchEmpty, { timeout: 15000 })
        await expect(empty).toHaveAttribute("role", "status")
        await expect(selects.nth(0)).toHaveValue(PROG_A)
        await expect(realOptions(page, 1)).toHaveCount(1)
        await expect(heading(page, NAME_A)).toBeVisible()
        await expect(page.getByTestId("compare-search-empty-2")).toHaveCount(0)
        await expect(page).toHaveURL(new RegExp(`/vi/compare\\?a=${PROG_A}&b=${PROG_B}$`))
    })

    test("ids that need encoding are honest invalid ids: encoded request, no junk option, no crash", async ({ page }) => {
        const TRAVERSAL = "../index" // unencoded, /mock/programs-by-id/../index.json is /mock/index.json
        const ODD = "50%?#x"
        const errors: string[] = []
        page.on("pageerror", (e) => errors.push(e.message))
        const traversalReq = page.waitForRequest((r) => r.url().includes(`/mock/programs-by-id/${encodeURIComponent(TRAVERSAL)}.json`))
        const oddReq = page.waitForRequest((r) => r.url().includes(`/mock/programs-by-id/${encodeURIComponent(ODD)}.json`))

        await page.goto(
            `/vi/compare?a=${PROG_A}&b=${encodeURIComponent(TRAVERSAL)}&c=${encodeURIComponent(ODD)}`,
            { waitUntil: "domcontentloaded" }
        )
        await traversalReq
        await oddReq
        const selects = await waitForOptions(page)

        await expect(selects).toHaveCount(3)
        await expect(selects.nth(0)).toHaveValue(PROG_A, { timeout: 15000 })
        await expect(heading(page, NAME_A)).toBeVisible()
        for (const n of [2, 3]) {
            await expect(selects.nth(n - 1)).toHaveValue("")
            await expect(page.getByTestId(`compare-invalid-${n}`)).toBeVisible()
            await expect(page.getByTestId(`compare-slot-empty-${n}`)).toBeVisible()
            await expect(page.getByTestId(`compare-card-${n}`)).toHaveCount(0)
        }
        // Nothing that is not a program becomes an option.
        await expect(page.locator('select option[value="undefined"]')).toHaveCount(0)
        await expect(page).toHaveURL(new RegExp(`/vi/compare\\?a=${PROG_A}$`), { timeout: 15000 })
        expect(errors).toEqual([])
    })

    test("375px: searching with 2 and 3 slots, a searched 3rd pick writes c, no horizontal page scroll", async ({ page }) => {
        const { target } = outsideTarget()
        await page.setViewportSize({ width: 375, height: 812 })
        await page.goto(`/vi/compare?a=${PROG_A}&b=${PROG_B}`, { waitUntil: "domcontentloaded" })
        const selects = await waitForOptions(page)
        await expect(heading(page, NAME_B)).toBeVisible({ timeout: 15000 })

        await searchBox(page, 1).fill(target.name)
        await expect(selects.nth(0).locator(`option[value="${target.id}"]`)).toHaveCount(1, { timeout: 15000 })
        await noHorizontalScroll(page)

        await page.getByTestId("compare-add-program").click()
        await expect(selects).toHaveCount(3)
        await searchBox(page, 3).fill(target.name)
        await expect(selects.nth(2).locator(`option[value="${target.id}"]`)).toHaveCount(1, { timeout: 15000 })
        await selects.nth(2).selectOption(target.id)

        await expect(heading(page, target.name)).toBeVisible({ timeout: 15000 })
        await expect(page).toHaveURL(new RegExp(`/vi/compare\\?a=${PROG_A}&b=${PROG_B}&c=${target.id}$`), { timeout: 15000 })
        // Slot 1's own search did not change slot 1.
        await expect(selects.nth(0)).toHaveValue(PROG_A)
        await noHorizontalScroll(page)
    })
})
