import { test, expect, Page } from "@playwright/test"

// Local runs can point at a dev server on a different port when :3000 is
// already taken by another project — CI/default keeps playwright.config.ts.
if (process.env.E2E_BASE_URL) {
    test.use({ baseURL: process.env.E2E_BASE_URL })
}

/**
 * v2.41 — compare up to 3 programs.
 *
 * ?a=&b=&c= resolves three exact programs (A and B are outside the first-200
 * picker options, C is inside them — verified against public/mock); ?a=&b=
 * links keep the old 2-slot behaviour; the 3rd slot is optional/removable;
 * an invalid c is handled like an invalid a/b (honest error, dropped param,
 * no substitution). domcontentloaded, not networkidle: a 404 mock fetch can
 * keep networkidle pending on `next start` (AGENTS.md §12).
 */
const PROG_A = "9676bdf4-4586-420d-86d5-03559d09814f" // Công nghệ thông tin (CN1) — ĐH Công nghệ, ĐHQGHN
const PROG_B = "18f67362-9ae0-4832-96c8-287cc3b712fa" // Công nghệ sinh học — ĐH Công nghệ TP.HCM
const PROG_C = "54e60ab2-43b5-4835-90c8-5e3e142034e4" // Sư phạm Ngữ văn — ĐH Cần Thơ (first-200 option)
const NAME_A = "Công nghệ thông tin (CN1)"
const NAME_B = "Công nghệ sinh học"
const NAME_C = "Sư phạm Ngữ văn"
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

const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true })

test.describe("Compare page — up to 3 programs (v2.41)", () => {
    test("?a=&b=&c= renders three columns with the exact programs", async ({ page }) => {
        await page.goto(`/vi/compare?a=${PROG_A}&b=${PROG_B}&c=${PROG_C}`, { waitUntil: "domcontentloaded" })
        const selects = await waitForOptions(page)

        await expect(selects).toHaveCount(3)
        await expect(selects.nth(0)).toHaveValue(PROG_A, { timeout: 15000 })
        await expect(selects.nth(1)).toHaveValue(PROG_B, { timeout: 15000 })
        await expect(selects.nth(2)).toHaveValue(PROG_C, { timeout: 15000 })
        await expect(heading(page, NAME_A)).toBeVisible()
        await expect(heading(page, NAME_B)).toBeVisible()
        await expect(heading(page, NAME_C)).toBeVisible()
        await expect(page.getByTestId("compare-admissions")).toHaveCount(3, { timeout: 15000 })
        // Max reached — no further "add" control.
        await expect(page.getByTestId("compare-add-program")).toHaveCount(0)

        const boxes = await Promise.all(
            [1, 2, 3].map((n) => page.getByTestId(`compare-card-${n}`).boundingBox())
        )
        const [b1, b2, b3] = boxes.map((b) => {
            expect(b).not.toBeNull()
            return b!
        })
        if ((page.viewportSize()?.width ?? 0) >= 1024) {
            // lg+: one row, three side-by-side columns.
            expect(Math.abs(b1.y - b2.y)).toBeLessThan(2)
            expect(Math.abs(b2.y - b3.y)).toBeLessThan(2)
            expect(b1.x).toBeLessThan(b2.x)
            expect(b2.x).toBeLessThan(b3.x)
        } else {
            // Narrow screens stack the cards.
            expect(b1.y).toBeLessThan(b2.y)
            expect(b2.y).toBeLessThan(b3.y)
        }

        await expect(page).toHaveURL(new RegExp(`/vi/compare\\?a=${PROG_A}&b=${PROG_B}&c=${PROG_C}$`))
    })

    test("?a=&b= link is unchanged: two slots and no c", async ({ page }) => {
        await page.goto(`/vi/compare?a=${PROG_A}&b=${PROG_B}`, { waitUntil: "domcontentloaded" })
        const selects = await waitForOptions(page)

        await expect(selects.nth(0)).toHaveValue(PROG_A, { timeout: 15000 })
        await expect(selects.nth(1)).toHaveValue(PROG_B, { timeout: 15000 })
        await expect(heading(page, NAME_A)).toBeVisible()
        await expect(heading(page, NAME_B)).toBeVisible()
        await expect(selects).toHaveCount(2)
        await expect(page.getByTestId("compare-card-3")).toHaveCount(0)
        await expect(page.getByTestId("compare-admissions")).toHaveCount(2, { timeout: 15000 })
        await expect(page.getByTestId("compare-add-program")).toBeVisible()
        await expect(page).toHaveURL(new RegExp(`/vi/compare\\?a=${PROG_A}&b=${PROG_B}$`))
    })

    test("removing the 3rd program drops c from the URL", async ({ page }) => {
        await page.goto(`/vi/compare?a=${PROG_A}&b=${PROG_B}&c=${PROG_C}`, { waitUntil: "domcontentloaded" })
        const selects = await waitForOptions(page)
        await expect(selects.nth(2)).toHaveValue(PROG_C, { timeout: 15000 })
        await expect(heading(page, NAME_C)).toBeVisible()

        await page.getByTestId("compare-remove-3").click()

        await expect(selects).toHaveCount(2)
        await expect(heading(page, NAME_C)).toHaveCount(0)
        await expect(page).toHaveURL(new RegExp(`/vi/compare\\?a=${PROG_A}&b=${PROG_B}$`), { timeout: 15000 })
        // The pair itself is untouched.
        await expect(selects.nth(0)).toHaveValue(PROG_A)
        await expect(selects.nth(1)).toHaveValue(PROG_B)
        await expect(page.getByTestId("compare-add-program")).toBeVisible()
    })

    test("invalid c shows an honest error, drops c, never substitutes", async ({ page }) => {
        await page.goto(`/vi/compare?a=${PROG_A}&b=${PROG_B}&c=${BOGUS}`, { waitUntil: "domcontentloaded" })
        const selects = await waitForOptions(page)

        await expect(selects).toHaveCount(3)
        await expect(selects.nth(2)).toHaveValue("", { timeout: 15000 })
        await expect(page.getByTestId("compare-invalid-3")).toBeVisible()
        await expect(page.getByTestId("compare-slot-empty-3")).toBeVisible()
        await expect(page.getByTestId("compare-card-3")).toHaveCount(0)

        // The valid pair still resolves to its exact programs.
        await expect(selects.nth(0)).toHaveValue(PROG_A, { timeout: 15000 })
        await expect(selects.nth(1)).toHaveValue(PROG_B, { timeout: 15000 })
        await expect(heading(page, NAME_A)).toBeVisible()
        await expect(heading(page, NAME_B)).toBeVisible()

        await expect(page).toHaveURL(new RegExp(`/vi/compare\\?a=${PROG_A}&b=${PROG_B}$`), { timeout: 15000 })
    })

    test("adding a 3rd program from the picker writes c", async ({ page }) => {
        await page.goto(`/vi/compare?a=${PROG_A}&b=${PROG_B}`, { waitUntil: "domcontentloaded" })
        const selects = await waitForOptions(page)
        await expect(selects.nth(1)).toHaveValue(PROG_B, { timeout: 15000 })

        await page.getByTestId("compare-add-program").click()

        // New slot starts empty — nothing is picked on the user's behalf.
        await expect(selects).toHaveCount(3)
        await expect(selects.nth(2)).toHaveValue("")
        await expect(page.getByTestId("compare-slot-placeholder-3")).toBeVisible()
        await expect(page.getByTestId("compare-invalid-3")).toHaveCount(0)
        await expect(page).toHaveURL(new RegExp(`/vi/compare\\?a=${PROG_A}&b=${PROG_B}$`))

        await selects.nth(2).selectOption(PROG_C)

        await expect(heading(page, NAME_C)).toBeVisible({ timeout: 15000 })
        await expect(page).toHaveURL(new RegExp(`/vi/compare\\?a=${PROG_A}&b=${PROG_B}&c=${PROG_C}$`), { timeout: 15000 })
    })

    test("wishlist select-3 → compare carries a, b and c", async ({ page }) => {
        await page.goto("/vi", { waitUntil: "domcontentloaded" })
        await page.evaluate(
            (ids) => window.localStorage.setItem("tedo:wishlist", JSON.stringify(ids)),
            [PROG_A, PROG_B, PROG_C]
        )
        await page.reload({ waitUntil: "domcontentloaded" })

        const openBtn = page.getByTestId("wishlist-open")
        await expect(openBtn).toBeVisible()
        // "(3)" renders only after the wishlist store hydrates — the click
        // then lands on a hydrated handler (AGENTS.md §12 hydration race).
        await expect(openBtn).toContainText("(3)", { timeout: 15000 })
        await openBtn.click()

        const boxA = page.getByRole("checkbox", { name: NAME_A })
        const boxB = page.getByRole("checkbox", { name: NAME_B })
        const boxC = page.getByRole("checkbox", { name: NAME_C })
        await expect(boxA).toBeVisible({ timeout: 15000 })
        await expect(boxB).toBeVisible({ timeout: 15000 })
        await expect(boxC).toBeVisible({ timeout: 15000 })

        const compareBtn = page.getByRole("button", { name: /So sánh|Compare/i })
        await boxA.check()
        await expect(compareBtn).toBeDisabled()
        await boxB.check()
        await boxC.check()
        await expect(page.getByText("(3/3)")).toBeVisible()
        await expect(compareBtn).toBeEnabled()
        await compareBtn.click()

        await expect(page).toHaveURL(new RegExp(`/compare\\?a=${PROG_A}&b=${PROG_B}&c=${PROG_C}`), {
            timeout: 15000,
        })
        const selects = await waitForOptions(page)
        await expect(selects.nth(0)).toHaveValue(PROG_A, { timeout: 15000 })
        await expect(selects.nth(1)).toHaveValue(PROG_B, { timeout: 15000 })
        await expect(selects.nth(2)).toHaveValue(PROG_C, { timeout: 15000 })
        await expect(heading(page, NAME_C)).toBeVisible()
    })

    test("three programs at 375px: no horizontal page scroll", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 })
        await page.goto(`/vi/compare?a=${PROG_A}&b=${PROG_B}&c=${PROG_C}`, { waitUntil: "domcontentloaded" })
        await waitForOptions(page)
        await expect(heading(page, NAME_A)).toBeVisible({ timeout: 15000 })
        await expect(heading(page, NAME_B)).toBeVisible()
        await expect(heading(page, NAME_C)).toBeVisible()
        await expect(page.getByTestId("compare-admissions")).toHaveCount(3, { timeout: 15000 })

        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
            scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
            clientWidth: window.innerWidth,
        }))
        expect(scrollWidth, `scrollWidth ${scrollWidth} > ${clientWidth}`).toBeLessThanOrEqual(clientWidth + 1)
    })
})
