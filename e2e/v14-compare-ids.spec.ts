import { test, expect, Page } from "@playwright/test"

// Local runs can point at a dev server on a different port when :3000 is
// already taken by another project — CI/default keeps playwright.config.ts.
if (process.env.E2E_BASE_URL) {
    test.use({ baseURL: process.env.E2E_BASE_URL })
}

/**
 * v1.4 — compare query-ID integrity (SPEC-V14-TRUST UC-V14-02).
 *
 * ?a=<id>&b=<id> must resolve the exact programs even when they are NOT
 * among the first-200 browse options (fetched individually by id), must
 * never silently substitute another program, and invalid/nonexistent ids
 * produce an honest error state plus a normalized URL with the bad param
 * dropped.
 *
 * Both ids below are real programs verified against
 * public/mock/programs-by-id/ AND confirmed absent from pages 1-10 of
 * public/mock/programs/ (i.e. outside the 200 options the pickers load).
 */
const PROG_A = "9676bdf4-4586-420d-86d5-03559d09814f" // Công nghệ thông tin (CN1) — ĐH Công nghệ, ĐHQGHN
const PROG_B = "18f67362-9ae0-4832-96c8-287cc3b712fa" // Công nghệ sinh học — ĐH Công nghệ TP.HCM
const NAME_A = "Công nghệ thông tin (CN1)"
const NAME_B = "Công nghệ sinh học"
const BOGUS = "00000000-0000-0000-0000-000000000000" // no such program in the snapshot

async function waitForOptions(page: Page) {
    const selects = page.locator("select")
    await expect(selects.first()).toBeVisible({ timeout: 15000 })
    await page.waitForFunction(
        () => (document.querySelectorAll("select")[0]?.options.length ?? 0) > 10,
        { timeout: 20000 }
    )
    return selects
}

test.describe("Compare page — query ids outside the first-200 options (v1.4)", () => {
    test("?a=&b= resolve the exact programs, not first-200 fallbacks", async ({ page }) => {
        await page.goto(`/vi/compare?a=${PROG_A}&b=${PROG_B}`, { waitUntil: "networkidle" })
        const selects = await waitForOptions(page)

        await expect(selects.nth(0)).toHaveValue(PROG_A, { timeout: 15000 })
        await expect(selects.nth(1)).toHaveValue(PROG_B, { timeout: 15000 })

        // The selected option label and the detail card heading show the
        // real programs — not a substituted first-200 program.
        await expect(selects.nth(0).locator("option:checked")).toContainText(NAME_A)
        await expect(selects.nth(1).locator("option:checked")).toContainText(NAME_B)
        await expect(page.getByRole("heading", { name: NAME_A, exact: true })).toBeVisible()
        await expect(page.getByRole("heading", { name: NAME_B, exact: true })).toBeVisible()

        // Normalized URL keeps the exact visible ids.
        await expect(page).toHaveURL(new RegExp(`/vi/compare\\?a=${PROG_A}&b=${PROG_B}`))
    })

    test("share link contains the exact resolved ids", async ({ page, context }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"])
        await page.goto(`/vi/compare?a=${PROG_A}&b=${PROG_B}`, { waitUntil: "networkidle" })
        const selects = await waitForOptions(page)
        await expect(selects.nth(0)).toHaveValue(PROG_A, { timeout: 15000 })
        await expect(selects.nth(1)).toHaveValue(PROG_B, { timeout: 15000 })

        const shareBtn = page.getByTestId("compare-share-button")
        await shareBtn.click()
        const clip = await page.evaluate(() => navigator.clipboard.readText())
        expect(clip).toContain(`a=${PROG_A}`)
        expect(clip).toContain(`b=${PROG_B}`)
    })

    test("invalid id shows an honest error, drops the param, never substitutes", async ({ page }) => {
        await page.goto(`/vi/compare?a=${BOGUS}&b=${PROG_B}`, { waitUntil: "networkidle" })
        const selects = await waitForOptions(page)

        // Invalid side stays empty — no silent pick of programsList[0].
        await expect(selects.nth(0)).toHaveValue("", { timeout: 15000 })
        await expect(page.getByTestId("compare-invalid-1")).toBeVisible()
        await expect(page.getByTestId("compare-slot-empty-1")).toBeVisible()

        // Valid side still resolves to its exact program.
        await expect(selects.nth(1)).toHaveValue(PROG_B, { timeout: 15000 })
        await expect(page.getByRole("heading", { name: NAME_B, exact: true })).toBeVisible()

        // Normalized URL drops the bad param and keeps the good one.
        await expect(page).toHaveURL(new RegExp(`/vi/compare\\?b=${PROG_B}`), { timeout: 15000 })
    })

    test("wishlist select-2 → compare preserves the exact ids", async ({ page }) => {
        await page.goto("/vi", { waitUntil: "networkidle" })
        await page.evaluate(
            ([a, b]) => window.localStorage.setItem("tedo:wishlist", JSON.stringify([a, b])),
            [PROG_A, PROG_B]
        )
        await page.reload({ waitUntil: "networkidle" })

        const openBtn = page.getByTestId("wishlist-open")
        await expect(openBtn).toBeVisible()
        await openBtn.click()

        // The drawer resolves each id via fetchProgramById — the real names
        // land on the checkbox aria-labels.
        const boxA = page.getByRole("checkbox", { name: NAME_A })
        const boxB = page.getByRole("checkbox", { name: NAME_B })
        await expect(boxA).toBeVisible({ timeout: 15000 })
        await expect(boxB).toBeVisible({ timeout: 15000 })

        const compareBtn = page.getByRole("button", { name: /So sánh|Compare/i })
        await boxA.check()
        await boxB.check()
        await expect(compareBtn).toBeEnabled()
        await compareBtn.click()

        await expect(page).toHaveURL(new RegExp(`/compare\\?a=${PROG_A}&b=${PROG_B}`), {
            timeout: 15000,
        })

        const selects = await waitForOptions(page)
        await expect(selects.nth(0)).toHaveValue(PROG_A, { timeout: 15000 })
        await expect(selects.nth(1)).toHaveValue(PROG_B, { timeout: 15000 })
        await expect(page.getByRole("heading", { name: NAME_A, exact: true })).toBeVisible()
        await expect(page.getByRole("heading", { name: NAME_B, exact: true })).toBeVisible()
    })
})
