import { test, expect, Page } from "@playwright/test"
import { existsSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.48 — program deep link (audit V5, gap G7).
 *
 * The program detail dialog lives in the URL: `?program=<id>` opens it (also
 * for a program outside the first listing page), closing it removes the
 * param, browser Back closes it and stays on the list, a wishlist entry opens
 * it, and the dialog copies a link to itself. The param is untrusted input:
 * anything that is not a program id (GUID) shows an honest notice and never
 * reaches a fetch path.
 *
 * Fixtures come from public/mock at test time (nothing named is pinned): the
 * last program of the last chunk (never on the first listing page), the first
 * program of the first chunk (= the first card), and a GUID with no program.
 * Message strings are read from src/messages inside the tests.
 * domcontentloaded, not networkidle (AGENTS.md §12); every click waits for a
 * hydration-dependent signal first (cards come from a client fetch, the
 * wishlist count from localStorage).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const messages = (locale: "vi" | "en"): Record<string, string | undefined> =>
    readJson(path.join(ROOT, "src", "messages", `${locale}.json`)).programs

type MockProgram = { id: string; name: string; universityName: string }
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const index = readJson(path.join(MOCK, "index.json"))
const chunks: string[] = index.chunks
const firstChunk: MockProgram[] = readJson(path.join(MOCK, "programs", chunks[0]))
const lastChunk: MockProgram[] = readJson(path.join(MOCK, "programs", chunks[chunks.length - 1]))
const first = firstChunk[0]
const last = lastChunk[lastChunk.length - 1]
const byIdFile = (id: string) => path.join(MOCK, "programs-by-id", `${id}.json`)
// A GUID-shaped id with no program in the snapshot.
const unknownId = ["00000000-0000-4000-8000-000000000000", "ffffffff-ffff-4fff-bfff-ffffffffffff"].find(
    (id) => !existsSync(byIdFile(id))
)
// Not program ids — the path-like ones must never reach /mock/programs-by-id/.
const INVALID = ["zzz", "../index", `${last.id}/../index`, `${last.id}.json`]
const NEW_KEYS = ["copyLink", "programLinkInvalid", "programLinkNotFound", "programLinkError", "programLinkDismiss"]

// Backdrop + panel of the detail dialog; the panel is the last one.
const dialog = (page: Page) => page.locator("div.fixed.inset-0.z-50").last()
const dialogHeading = (page: Page, name: string) =>
    page.locator("div.fixed.inset-0.z-50").getByRole("heading", { level: 2, name, exact: true })
const pathAndQuery = (page: Page) => {
    const u = new URL(page.url())
    return u.pathname + u.search
}

test.describe("v2.48 — program deep link ?program=<id>", () => {
    // Several full page loads per test (each waits for the client-fetched list).
    test.describe.configure({ timeout: 90000 })

    test("fixtures exist in the snapshot", () => {
        expect(chunks.length).toBeGreaterThan(1)
        for (const p of [first, last]) {
            expect(p.id).toMatch(GUID)
            const detail = readJson(byIdFile(p.id))
            expect(detail.id).toBe(p.id)
            expect(detail.name).toBe(p.name)
            expect(detail.universityName).toBe(p.universityName)
        }
        // The first listing page (12 cards) is a slice of the first chunk.
        expect(firstChunk.some((p) => p.id === last.id)).toBe(false)
        expect(unknownId).toBeTruthy()
        expect(INVALID.some((v) => GUID.test(v))).toBe(false)
    })

    test("messages: the new copy exists in vi and en", () => {
        for (const locale of ["vi", "en"] as const) {
            const m = messages(locale)
            for (const key of [...NEW_KEYS, "viewDetail", "compareShareCopied"]) {
                expect(m[key], `${locale}.programs.${key}`).toBeTruthy()
            }
        }
    })

    test("a link to a program outside the first page opens it; Back closes it and stays on the list", async ({ page }) => {
        const errors: string[] = []
        page.on("pageerror", (e) => errors.push(e.message))
        const heading = dialogHeading(page, last.name)

        await page.goto(`/vi?program=${last.id}`, { waitUntil: "domcontentloaded" })
        await expect(heading).toBeVisible({ timeout: 30000 })
        await expect(dialog(page)).toContainText(last.universityName)
        expect(pathAndQuery(page)).toBe(`/vi?program=${last.id}`)

        await page.goBack()
        await expect(heading).toHaveCount(0)
        await expect.poll(() => pathAndQuery(page)).toBe("/vi")
        // Still on the site, with the list loaded.
        await expect(page.getByTestId("program-card").first()).toBeVisible({ timeout: 30000 })

        // Landing again: the close button removes the param.
        await page.goto(`/vi?program=${last.id}`, { waitUntil: "domcontentloaded" })
        await expect(heading).toBeVisible({ timeout: 30000 })
        await dialog(page).locator("button:has(svg.lucide-x)").first().click()
        await expect(heading).toHaveCount(0)
        await expect.poll(() => pathAndQuery(page)).toBe("/vi")

        // English route.
        await page.goto(`/en?program=${last.id}`, { waitUntil: "domcontentloaded" })
        await expect(heading).toBeVisible({ timeout: 30000 })
        expect(errors).toEqual([])
    })

    test("opening a card pushes ?program=<id>; Back and the close button both leave a clean URL", async ({ page }) => {
        await page.goto("/vi", { waitUntil: "domcontentloaded" })
        const card = page.getByTestId("program-card").first()
        await expect(card).toBeVisible({ timeout: 30000 })
        await expect(card.getByRole("heading", { name: first.name, exact: true })).toBeVisible()
        const heading = dialogHeading(page, first.name)

        await card.getByRole("button", { name: /Xem chi tiết/i }).click()
        await expect(heading).toBeVisible({ timeout: 15000 })
        await expect.poll(() => pathAndQuery(page)).toBe(`/vi?program=${first.id}`)
        await page.goBack()
        await expect(heading).toHaveCount(0)
        await expect.poll(() => pathAndQuery(page)).toBe("/vi")
        await expect(card).toBeVisible()

        await card.getByRole("button", { name: /Xem chi tiết/i }).click()
        await expect(heading).toBeVisible({ timeout: 15000 })
        await expect.poll(() => pathAndQuery(page)).toBe(`/vi?program=${first.id}`)
        await dialog(page).locator("button:has(svg.lucide-x)").first().click()
        await expect(heading).toHaveCount(0)
        await expect.poll(() => pathAndQuery(page)).toBe("/vi")
        await expect(card).toBeVisible()
    })

    test("a wishlist entry opens its program detail with the link", async ({ page }) => {
        const vi = messages("vi")
        await page.goto("/vi", { waitUntil: "domcontentloaded" })
        await page.evaluate((id) => window.localStorage.setItem("tedo:wishlist", JSON.stringify([id])), last.id)
        await page.reload({ waitUntil: "domcontentloaded" })
        const openBtn = page.getByTestId("wishlist-open")
        // "(1)" renders only once the wishlist store has read localStorage (hydrated).
        await expect(openBtn).toContainText("(1)", { timeout: 15000 })
        await openBtn.click()

        const openDetail = page.getByTestId("wishlist-open-detail")
        await expect(openDetail).toHaveCount(1, { timeout: 15000 })
        await expect(openDetail).toHaveText(vi.viewDetail!)
        await openDetail.click()
        const heading = dialogHeading(page, last.name)
        await expect(heading).toBeVisible({ timeout: 15000 })
        await expect(openDetail).toHaveCount(0)
        await expect.poll(() => pathAndQuery(page)).toBe(`/vi?program=${last.id}`)

        await page.goBack()
        await expect(heading).toHaveCount(0)
        await expect.poll(() => pathAndQuery(page)).toBe("/vi")
    })

    test("the dialog copies a link that opens the same program", async ({ page, context }) => {
        const vi = messages("vi")
        await context.grantPermissions(["clipboard-read", "clipboard-write"])
        await page.goto(`/vi?program=${last.id}`, { waitUntil: "domcontentloaded" })
        await expect(dialogHeading(page, last.name)).toBeVisible({ timeout: 30000 })
        // The extra header button must not widen the page (mobile).
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

        const copy = page.getByTestId("program-copy-link")
        await expect(copy).toHaveAccessibleName(vi.copyLink!)
        await copy.click()
        // The copied state lasts 2 s; its accessible name is the signal.
        await expect(copy).toHaveAccessibleName(vi.compareShareCopied!)
        const clip = await page.evaluate(() => navigator.clipboard.readText())
        expect(clip).toBe(`${new URL(page.url()).origin}/vi?program=${last.id}`)

        const other = await context.newPage()
        await other.goto(clip, { waitUntil: "domcontentloaded" })
        await expect(dialogHeading(other, last.name)).toBeVisible({ timeout: 30000 })
    })

    test("an invalid, unknown or unloadable id shows an honest notice, fetches nothing unsafe and does not crash", async ({ page }) => {
        const vi = messages("vi")
        const en = messages("en")
        const errors: string[] = []
        page.on("pageerror", (e) => errors.push(e.message))
        const byIdRequests: string[] = []
        page.on("request", (r) => {
            if (r.url().includes("/mock/programs-by-id/")) byIdRequests.push(r.url())
        })
        const notice = page.getByTestId("program-link-notice")

        for (const value of INVALID) {
            await page.goto(`/vi?program=${encodeURIComponent(value)}`, { waitUntil: "domcontentloaded" })
            await expect(notice).toBeVisible({ timeout: 30000 })
            await expect(notice).toHaveAttribute("role", "alert")
            await expect(notice).toHaveAttribute("data-reason", "invalid")
            await expect(notice).toContainText(vi.programLinkInvalid!)
            await expect(page.getByTestId("program-card").first()).toBeVisible({ timeout: 30000 })
            await expect(page.locator("div.fixed.inset-0.z-50")).toHaveCount(0)
        }
        expect(byIdRequests).toEqual([])

        // Dismiss removes the notice and the param; the list stays.
        await notice.getByRole("button", { name: vi.programLinkDismiss!, exact: true }).click()
        await expect(notice).toHaveCount(0)
        await expect.poll(() => pathAndQuery(page)).toBe("/vi")
        await expect(page.getByTestId("program-card").first()).toBeVisible()

        // A GUID with no program: "not found", no dialog.
        await page.goto(`/vi?program=${unknownId}`, { waitUntil: "domcontentloaded" })
        await expect(notice).toHaveAttribute("data-reason", "notFound", { timeout: 30000 })
        await expect(notice).toContainText(vi.programLinkNotFound!)
        await expect(page.locator("div.fixed.inset-0.z-50")).toHaveCount(0)

        // The program file cannot be loaded: "error", not "not found".
        await page.route("**/mock/programs-by-id/**", (route) => route.abort())
        await page.goto(`/vi?program=${last.id}`, { waitUntil: "domcontentloaded" })
        await expect(notice).toHaveAttribute("data-reason", "error", { timeout: 30000 })
        await expect(notice).toContainText(vi.programLinkError!)
        await page.unroute("**/mock/programs-by-id/**")

        // English copy.
        await page.goto("/en?program=zzz", { waitUntil: "domcontentloaded" })
        await expect(notice).toContainText(en.programLinkInvalid!, { timeout: 30000 })
        expect(errors).toEqual([])
    })
})
