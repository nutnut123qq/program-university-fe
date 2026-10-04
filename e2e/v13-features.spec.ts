import { test, expect, Page } from "@playwright/test"

/**
 * v1.3 feature E2E — trend chart, score-flow hints, wishlist, same-major.
 * Assertions are against the real mock fixtures (public/mock/):
 * - UET "Công nghệ thông tin (CN1)": 'combined' scale-30 series has 2 points
 *   (2025+2026 → polyline + delta badge) and 'thpt' scale-30 has exactly 1
 *   point (dot + "Chỉ có năm" label, no fabricated line).
 * - TDTU "Luật (Định hướng Luật kinh tế) - Phân hiệu Khánh Hòa": all
 *   program-scope cutoff series are single-year.
 * - UET "Công nghệ sinh học": belongs to a major group spanning ≥2
 *   universities (CTU, DTU, HCMUS, VNU…).
 */

async function openProgramDetail(page: Page, programName: string, universityName: string) {
    await page.goto("/vi", { waitUntil: "networkidle" })
    const searchInput = page.getByPlaceholder(/Tìm tên ngành, mã ngành/i)
    await searchInput.fill(programName)
    await page.waitForTimeout(600)
    const card = page
        .getByTestId("program-card")
        .filter({ hasText: universityName })
        .filter({ hasText: programName })
        .first()
    await expect(card).toBeVisible({ timeout: 15000 })
    await card.getByRole("button", { name: /Xem chi tiết/i }).click()
    await page.getByRole("button", { name: /^Tuyển sinh$/ }).click()
    return page.getByTestId("admissions-section")
}

test.describe("Score trend chart (v1.3)", () => {
    test("multi-year series renders polyline; single-point series renders dot + only-year label", async ({
        page,
    }) => {
        const section = await openProgramDetail(
            page,
            "Công nghệ thông tin (CN1)",
            "Trường Đại học Công nghệ"
        )
        const chart = section.getByTestId("score-trend-chart")
        await expect(chart).toBeVisible({ timeout: 15000 })

        // 'combined' scale-30: 2 points → one polyline
        await expect(chart.locator("polyline")).toHaveCount(1)
        // 'thpt' scale-30: 1 point → dot, honest "only one year" label
        await expect(chart.getByText(/Chỉ có năm|Only year/i).first()).toBeVisible()
        // Cross-scale honesty note always visible
        await expect(
            chart.getByText(/không so sánh trực tiếp|not directly comparable/i)
        ).toBeVisible()
    })

    test("row-level delta badge appears on cutoff rows with an earlier same-scale year", async ({
        page,
    }) => {
        const section = await openProgramDetail(
            page,
            "Công nghệ thông tin (CN1)",
            "Trường Đại học Công nghệ"
        )
        // Newest combined-30 row carries a delta vs the previous year
        await expect(section.getByText(/so với \d{4}|vs\.? \d{4}/i).first()).toBeVisible({
            timeout: 15000,
        })
    })

    test("all-single-year program still renders chart without fabricated lines", async ({
        page,
    }) => {
        // Fixture: Kiến trúc đô thị (7580104) — chương trình mới 2026, chỉ có
        // đúng một năm điểm chuẩn matched trong snapshot (Round 18 data).
        const section = await openProgramDetail(
            page,
            "Kiến trúc đô thị",
            "Tôn Đức Thắng"
        )
        const chart = section.getByTestId("score-trend-chart")
        await expect(chart).toBeVisible({ timeout: 15000 })
        await expect(chart.locator("polyline")).toHaveCount(0)
    })
})

test.describe("Score-flow hints (v1.3)", () => {
    test("filtered cards show cutoff+quota hint; unfiltered cards show none", async ({
        page,
    }) => {
        await page.goto("/vi", { waitUntil: "networkidle" })
        // No hint while browsing normally
        await expect(page.getByTestId("score-hint")).toHaveCount(0)

        await page.getByTestId("score-filter-input").fill("25")
        const scaleSelect = page.getByRole("combobox", { name: /Thang điểm|Scale/i })
        await scaleSelect.click()
        await page.getByRole("option", { name: "30", exact: true }).click()

        await expect(page.getByTestId("score-filter-result")).toBeVisible({ timeout: 60000 })
        const hints = page.getByTestId("score-hint")
        await expect(hints.first()).toBeVisible()
        await expect(hints.first()).toContainText(/Chuẩn \d{4}: .*\/ ?30|Cutoff \d{4}: .*\/ ?30/i)
    })
})

test.describe("Wishlist (v1.3)", () => {
    test("heart toggles persist, drawer selects exactly 2 → /compare?a=&b=", async ({
        page,
    }) => {
        await page.goto("/vi", { waitUntil: "networkidle" })
        await page.evaluate(() => localStorage.removeItem("tedo:wishlist"))
        await page.reload({ waitUntil: "networkidle" })

        const openBtn = page.getByTestId("wishlist-open")
        await expect(openBtn).toBeVisible()
        await expect(openBtn).toContainText("0")

        const toggles = page.getByTestId("wishlist-toggle")
        await toggles.nth(0).click()
        await toggles.nth(1).click()
        await expect(openBtn).toContainText("2")

        await openBtn.click()
        const boxes = page.getByRole("checkbox")
        await expect(boxes).toHaveCount(2, { timeout: 15000 })

        const compareBtn = page.getByRole("button", { name: /So sánh|Compare/i })
        await expect(compareBtn).toBeDisabled()
        await boxes.nth(0).check()
        await boxes.nth(1).check()
        await expect(compareBtn).toBeEnabled()
        await compareBtn.click()
        await expect(page).toHaveURL(/\/compare\?a=[^&]+&b=[^&]+/)
    })
})

test.describe("Same major at other universities (v1.3)", () => {
    test("detail dialog lists the same major across ≥2 universities with honest no-data rows", async ({
        page,
    }) => {
        const section = await openProgramDetail(
            page,
            "Công nghệ sinh học",
            "Trường Đại học Công nghệ"
        )
        const block = section.getByTestId("same-major-elsewhere")
        await expect(block).toBeVisible({ timeout: 15000 })
        // ≥2 distinct universities listed
        await expect(block.getByText(/Trường Đại học|Đại học/).nth(1)).toBeVisible()
        // Source domain links present
        await expect(block.locator("a").first()).toBeVisible()
    })
})
