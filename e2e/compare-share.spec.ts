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
 * IDs are the first options of public/mock/programs/page-1.json (same IDs
 * used by compare-admissions.spec.ts).
 */
const PROG_A = "00a9c9f1-2c38-449e-b459-5ef28944e10a" // CNTT - An Toàn Thông Tin (FPT)
const PROG_B = "00f42cd2-1ac7-49c0-803c-fc7d83cf4058" // QTKD - Quản trị khách sạn (FPT)
const PROG_C = "00f81086-e9d4-4491-bb9b-b8459743eec6" // CNTT - Trí tuệ nhân tạo (FPT)

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
