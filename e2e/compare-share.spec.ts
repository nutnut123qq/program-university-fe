import { test, expect, Page } from "@playwright/test"

// Local runs can point at a dev server on a different port when :3000 is
// already taken by another project — CI/default keeps playwright.config.ts.
if (process.env.E2E_BASE_URL) {
    test.use({ baseURL: process.env.E2E_BASE_URL })
}

/**
 * Share-link contract for /vi/compare: ?a=<id>&b=<id> pre-selects the two
 * comparison pickers, picker changes rewrite the query string in place
 * (router.replace, no reload), and the share button copies the current URL.
 * IDs are options of the first-200 programs list (same programs used by
 * compare-admissions.spec.ts — CTU since Round 13's expansion reordered
 * page-1.json to the new universities).
 */
const PROG_A = "0c4e1c83-e094-407d-a953-91d1a84be7fa" // Sư phạm Vật lý (CTU)
const PROG_B = "13b1696c-6dc9-4fa0-8456-433c25de24d8" // Kỹ thuật ô tô (CTU)
const PROG_C = "54e60ab2-43b5-4835-90c8-5e3e142034e4" // Sư phạm Ngữ văn (CTU)

async function waitForOptions(page: Page) {
    const selects = page.locator("select")
    await expect(selects.first()).toBeVisible({ timeout: 15000 })
    await page.waitForFunction(
        () => (document.querySelectorAll("select")[0]?.options.length ?? 0) > 10,
        { timeout: 20000 }
    )
    return selects
}

test.describe("Compare page — shareable ?a=&b= link", () => {
    // Clipboard API needs explicit grants in headless Chromium.
    test.use({ permissions: ["clipboard-read", "clipboard-write"] })

    test("?a=<id>&b=<id> pre-selects both pickers on mount", async ({ page }) => {
        await page.goto(`/vi/compare?a=${PROG_A}&b=${PROG_B}`, { waitUntil: "networkidle" })
        const selects = await waitForOptions(page)

        await expect(selects.nth(0)).toHaveValue(PROG_A, { timeout: 15000 })
        await expect(selects.nth(1)).toHaveValue(PROG_B, { timeout: 15000 })
    })

    test("share button copies the current URL containing a & b params", async ({ page }) => {
        await page.goto(`/vi/compare?a=${PROG_A}&b=${PROG_B}`, { waitUntil: "networkidle" })
        await waitForOptions(page)

        const shareBtn = page.getByTestId("compare-share-button")
        await expect(shareBtn).toBeVisible()
        await expect(shareBtn).toContainText("Chia sẻ so sánh")

        await shareBtn.click()

        // Transient copied state
        await expect(shareBtn).toContainText("Đã sao chép liên kết")

        const clip = await page.evaluate(() => navigator.clipboard.readText())
        expect(clip).toContain("/vi/compare")
        expect(clip).toContain(`a=${PROG_A}`)
        expect(clip).toContain(`b=${PROG_B}`)
    })

    test("changing a selection updates the URL query in place (no reload)", async ({ page }) => {
        await page.goto(`/vi/compare?a=${PROG_A}&b=${PROG_B}`, { waitUntil: "networkidle" })
        const selects = await waitForOptions(page)
        await expect(selects.nth(0)).toHaveValue(PROG_A, { timeout: 15000 })

        // Marker on window proves no full reload happened after replace().
        await page.evaluate(() => {
            ;(window as unknown as { __cmpMark: number }).__cmpMark = 42
        })

        await selects.nth(0).selectOption(PROG_C)

        await expect(page).toHaveURL(
            new RegExp(`/vi/compare\\?a=${PROG_C}&b=${PROG_B}`),
            { timeout: 15000 }
        )
        const mark = await page.evaluate(
            () => (window as unknown as { __cmpMark?: number }).__cmpMark
        )
        expect(mark).toBe(42)
        await expect(selects.nth(1)).toHaveValue(PROG_B)
    })
})
