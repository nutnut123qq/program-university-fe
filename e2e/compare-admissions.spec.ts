import { test, expect, Page } from "@playwright/test"

// Local runs can point at a dev server on a different port when :3000 is
// already taken by another project — CI/default keeps playwright.config.ts.
if (process.env.E2E_BASE_URL) {
    test.use({ baseURL: process.env.E2E_BASE_URL })
}

/**
 * "Tuyển sinh 2025" admission block inside each card of ProgramComparison
 * (/vi/compare). Demo/mock mode — data comes from the real DB exports at
 * public/mock/admissions/<UNI>.json.
 *
 * Data note: fetchPrograms({pageSize:200}) fills the two <select> boxes with
 * the FIRST 200 programs in chunk order — all of them belong to FPT
 * (universities.code "FPT" → /mock/admissions/FPT.json). FPT publishes only
 * school-scoped (context) score rows across three methods with scales
 * 30 / 150 / 1200, one school-wide quota, and tuitions bound to programs that
 * are NOT in the first 200 — so the tuition block exercises the per-block
 * empty state with real data.
 */

// First two options of the select (page-1.json order), both FPT.
const PROG_A = "00a9c9f1-2c38-449e-b459-5ef28944e10a" // CNTT - An Toàn Thông Tin (FPT)
const PROG_B = "00f42cd2-1ac7-49c0-803c-fc7d83cf4058" // QTKD - Quản trị khách sạn (FPT)

async function gotoCompare(page: Page) {
    await page.goto("/vi/compare", { waitUntil: "networkidle" })
    const selects = page.locator("select")
    await expect(selects.first()).toBeVisible({ timeout: 15000 })
    // Wait until the program options are loaded into both select boxes
    await page.waitForFunction(
        () => (document.querySelectorAll("select")[0]?.options.length ?? 0) > 10,
        { timeout: 20000 }
    )
    return selects
}

test.describe("Compare page — admission block per side", () => {
    test("two selected FPT programs each render the admissions block with real rows", async ({
        page,
    }) => {
        const selects = await gotoCompare(page)
        await selects.nth(0).selectOption(PROG_A)
        await selects.nth(1).selectOption(PROG_B)

        const blocks = page.getByTestId("compare-admissions")
        await expect(blocks).toHaveCount(2)

        for (const block of await blocks.all()) {
            await expect(block.getByText("Tuyển sinh 2025")).toBeVisible()
            // FPT rows are context rows — must be labeled as school/group
            // scope, never as per-program data.
            await expect(
                block.getByText(/theo nhóm ngành \/ trường \/ cơ sở/i)
            ).toBeVisible()
            await expect(block.getByText("Toàn trường:").first()).toBeVisible()
            await expect(block.getByText("Điểm chuẩn").first()).toBeVisible()
            // Quota context row (school-wide total) with scoped note
            await expect(block.getByText("Chỉ tiêu tuyển sinh")).toBeVisible()
            await expect(
                block.getByText(/Chỉ tiêu theo nhóm ngành\/trường/i)
            ).toBeVisible()
            // Per-record provenance: real source domain link
            const sourceLink = block.getByTestId("admissions-source-link").first()
            await expect(sourceLink).toBeVisible()
            await expect(sourceLink).toContainText("daihoc.fpt.edu.vn")
            await expect(sourceLink).toHaveAttribute("rel", /noopener/)
            // Reference-only warning
            await expect(
                block.getByText("Điểm năm trước chỉ mang tính tham khảo, không bảo đảm trúng tuyển.")
            ).toBeVisible()
        }

        // Per-block empty state: none of the first-200 FPT programs has a
        // tuition record bound by programId → tuition block shows its own
        // empty text while scores/quota blocks still render rows.
        const tuitionBlock = page.getByTestId("compare-admissions-tuition").first()
        await expect(tuitionBlock.getByTestId("compare-admissions-block-empty")).toHaveText(
            "Chưa có dữ liệu"
        )
    })

    test("scores with different scales render raw side by side — no normalization", async ({
        page,
    }) => {
        const selects = await gotoCompare(page)
        await selects.nth(0).selectOption(PROG_A)
        await selects.nth(1).selectOption(PROG_B)

        const scores = page.getByTestId("compare-admissions-scores").first()
        await expect(scores).toBeVisible()

        // Real FPT context rows: ĐGNL ĐHQG-HN 78/150, ĐGNL ĐHQG-HCM 653/1200,
        // học bạ & THPT on /30 — each keeps its own scale label verbatim.
        await expect(scores.getByText("/ 150").first()).toBeVisible()
        await expect(scores.getByText("/ 1200").first()).toBeVisible()
        await expect(scores.getByText("/ 30").first()).toBeVisible()
        await expect(scores.getByText("78").first()).toBeVisible()
        await expect(scores.getByText("653").first()).toBeVisible()
        // Method labels preserved on rows
        await expect(scores.getByText(/Đánh giá năng lực ĐHQG-HN/i).first()).toBeVisible()
        await expect(scores.getByText(/Đánh giá năng lực ĐHQG-HCM/i).first()).toBeVisible()
    })

    test("university without an admissions snapshot shows the empty state (not zeros)", async ({
        page,
    }) => {
        // Every program in the select is FPT; simulate the snapshot file being
        // absent — fetchAdmissions resolves null on 404 → empty state.
        await page.route("**/mock/admissions/FPT.json", (route) =>
            route.fulfill({ status: 404, body: "Not found" })
        )
        const selects = await gotoCompare(page)
        await selects.nth(0).selectOption(PROG_A)
        await selects.nth(1).selectOption(PROG_B)

        const empty = page.getByTestId("compare-admissions-empty")
        await expect(empty).toHaveCount(2)
        await expect(empty.first()).toHaveText("Chưa có dữ liệu tuyển sinh")
        // Guard: no accidental "0" score/quota renders inside the blocks
        const blocks = page.getByTestId("compare-admissions")
        for (const block of await blocks.all()) {
            await expect(block.getByText(/^0$/)).toHaveCount(0)
        }
    })
})
