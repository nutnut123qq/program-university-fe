import { test, expect } from "@playwright/test"

/**
 * v1.4 UC-V14-03 — analytics/copy consistency with the current public snapshot.
 *
 * Snapshot ground truth (public/mock/index.json + programs/page-*.json,
 * generatedAt 2026-10-03): 1,901 programs / 105,602 courses / 17 universities.
 *
 * SLM quality metrics (6.76/10, 67.3%, 8.6%, distribution counts) are an
 * evaluated REFERENCE set of 1,840 programs — they may only appear labeled as
 * such, never as current catalog totals.
 */

test.describe("v1.4 — analytics/copy consistency", () => {
    test("vi analytics page shows current snapshot totals, no stale claims", async ({ page }) => {
        await page.goto("/vi/analytics", { waitUntil: "domcontentloaded" })

        const body = page.locator("body")

        // Current snapshot-derived catalog numbers
        await expect(page.getByRole("heading", { name: /17 Trường/i })).toBeVisible({ timeout: 30_000 })
        await expect(body).toContainText("1,901")
        await expect(body).toContainText("105,602")
        await expect(body).toContainText("1.901")

        // Stale catalog claims must be gone
        await expect(body).not.toContainText(/105[.,]408/)
        await expect(body).not.toContainText(/12 Trường/i)

        // 1,840 may only appear as the labeled evaluated reference set,
        // never as a current catalog total
        await expect(body).not.toContainText(/1\.840 (ngành|chương trình đào tạo)/i)
        await expect(body).toContainText(/tập đánh giá/i)
    })

    test("en analytics page shows current snapshot totals, no stale claims", async ({ page }) => {
        await page.goto("/en/analytics", { waitUntil: "domcontentloaded" })

        const body = page.locator("body")

        await expect(page.getByRole("heading", { name: /17 Universities/i })).toBeVisible({ timeout: 30_000 })
        await expect(body).toContainText("1,901")
        await expect(body).toContainText("105,602")

        await expect(body).not.toContainText(/105[.,]408/)
        await expect(body).not.toContainText(/12 Universities/i)
        await expect(body).not.toContainText(/1,840 (academic|training) programs/i)
        await expect(body).toContainText(/evaluated (reference )?set/i)
    })

    test("programs list subtitle matches snapshot catalog count", async ({ page }) => {
        await page.goto("/vi/programs", { waitUntil: "domcontentloaded" })

        const body = page.locator("body")
        await expect(body).toContainText("1.901")
        await expect(body).not.toContainText("1.840")
    })
})
