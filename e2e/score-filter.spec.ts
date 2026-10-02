import { test, expect } from "@playwright/test"

/**
 * Score-filter E2E — assertions are against the real mock fixtures:
 * - NEU.json: "An toàn thông tin (7480202)" cutoff 25.59/30, scope "program".
 * - UEH.json also has "An toàn thông tin (7480202)" at 23.8/30 and several
 *   NEU programs sit at 24.75/30, so the NEU ATTT card is always located
 *   via BOTH program name and university name ("Đại học Kinh tế Quốc dân").
 * - FPT.json contains ONLY school-scope rows (e.g. 21/30 học bạ, 18.5/30
 *   THPT, 653/1200 ĐGNL). They must NEVER make an FPT program pass.
 */

const NEU_ATTT_NAME = "An toàn thông tin (7480202)"
const NEU_NAME = "Đại học Kinh tế Quốc dân"
const UEH_NAME = "Trường Đại học Kinh tế TP.HCM"
const FPT_NAME = "Trường Đại học FPT"

const cards = (page: import("@playwright/test").Page) =>
    page.getByTestId("program-card")

async function openScoreFilter(page: import("@playwright/test").Page) {
    await page.goto("/vi", { waitUntil: "networkidle" })
    const input = page.getByTestId("score-filter-input")
    await expect(input).toBeVisible()
    return input
}

async function pickScale(page: import("@playwright/test").Page, scale: string) {
    const scaleSelect = page.getByRole("combobox", { name: /Thang điểm|Scale/i })
    await scaleSelect.click()
    await page.getByRole("option", { name: scale, exact: true }).click()
}

test.describe("Score Filter Flows (/vi)", () => {
    test("score 26 / scale 30 keeps NEU ATTT (25.59); score 25 removes it", async ({
        page,
    }) => {
        const input = await openScoreFilter(page)
        await input.fill("26")
        await pickScale(page, "30")

        // Lazy admissions load + full-catalog pool fetch can take a moment
        const result = page.getByTestId("score-filter-result")
        await expect(result).toBeVisible({ timeout: 60000 })
        await expect(result).toContainText("26")

        // Same-scale note is always shown while the filter is active
        await expect(page.getByTestId("score-filter-note")).toBeVisible()

        // NEU ATTT card visible (name is shared with UEH's program, so the
        // card is pinned down by university name too)
        const neuCard = cards(page)
            .filter({ hasText: NEU_ATTT_NAME })
            .filter({ hasText: NEU_NAME })
        await expect(neuCard).toHaveCount(1, { timeout: 30000 })

        // 25 < 25.59 -> NEU ATTT drops out, UEH ATTT (23.8) stays
        await input.fill("25")
        await expect(result).toContainText("25")
        await expect(neuCard).toHaveCount(0, { timeout: 30000 })
        await expect(
            cards(page)
                .filter({ hasText: NEU_ATTT_NAME })
                .filter({ hasText: UEH_NAME })
        ).toHaveCount(1)
    })

    test("school-scope cutoff rows must not make an FPT program pass", async ({ page }) => {
        const input = await openScoreFilter(page)
        // 22/30 would match FPT school-scope rows (21/30, 18.5/30) if scope
        // were ignored — but FPT has ZERO program-scope admission rows.
        await input.fill("22")
        await pickScale(page, "30")

        await expect(page.getByTestId("score-filter-result")).toBeVisible({
            timeout: 60000,
        })
        // Some programs do match at 22/30, but none of them may be FPT's
        await expect(cards(page).first()).toBeVisible({ timeout: 30000 })
        await expect(cards(page).filter({ hasText: FPT_NAME })).toHaveCount(0)
    })

    test("zero-result score shows the scoreFilterEmpty state", async ({ page }) => {
        const input = await openScoreFilter(page)
        await input.fill("1")
        await pickScale(page, "30")

        await expect(page.getByTestId("score-filter-result")).toBeVisible({
            timeout: 60000,
        })
        const empty = page.getByTestId("score-filter-empty")
        await expect(empty).toBeVisible({ timeout: 30000 })
        await expect(empty).toContainText(/khớp điểm|match this score/i)
    })

    test("scale options are discovered from data (150 exists but is school-scope only)", async ({
        page,
    }) => {
        const input = await openScoreFilter(page)
        await input.fill("100")

        const scaleSelect = page.getByRole("combobox", {
            name: /Thang điểm|Scale/i,
        })
        await scaleSelect.click()
        for (const s of ["30", "40", "100", "150", "1200", "1600"]) {
            await expect(
                page.getByRole("option", { name: s, exact: true })
            ).toBeVisible({ timeout: 60000 })
        }

        // Scale 150 only exists on FPT school-scope rows -> zero eligible programs
        await page.getByRole("option", { name: "150", exact: true }).click()
        await expect(page.getByTestId("score-filter-empty")).toBeVisible({
            timeout: 60000,
        })
    })
})
