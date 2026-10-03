import { test, expect, Page } from "@playwright/test"

// Local runs can point at a dev server on a different port when :3000 is
// already taken by another project — CI/default keeps playwright.config.ts.
if (process.env.E2E_BASE_URL) {
    test.use({ baseURL: process.env.E2E_BASE_URL })
}

/**
 * "Tuyển sinh <max year>" admission block inside each card of ProgramComparison
 * (/vi/compare). Demo/mock mode — data comes from the real DB exports at
 * public/mock/admissions/<UNI>.json.
 *
 * Data note: fetchPrograms({pageSize:200}) fills the two <select> boxes with
 * the FIRST 200 programs in chunk order. Since Round 13's catalog expansion
 * (CTU/HUTECH/UEL/HCMUTE/PTIT sort first), the first 200 options belong to
 * the new universities — so the pinned programs are CTU/HUTECH, both of
 * which carry program-scope 2026 rows:
 *   - CTU  → /mock/admissions/CTU.json (tuyensinh.ctu.edu.vn)
 *   - HUTECH → /mock/admissions/HUTECH.json (www.hutech.edu.vn)
 */

// Options of the select (inside the first 200, page-1.json order).
const PROG_A = "0c4e1c83-e094-407d-a953-91d1a84be7fa" // Sư phạm Vật lý (CTU)
const PROG_B = "13b1696c-6dc9-4fa0-8456-433c25de24d8" // Kỹ thuật ô tô (CTU)
const PROG_MUSIC = "e93bedcd-943a-448f-ab6a-28ff9fdba569" // Thanh nhạc (HUTECH)

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
    test("two selected CTU programs each render the admissions block with real rows", async ({
        page,
    }) => {
        const selects = await gotoCompare(page)
        await selects.nth(0).selectOption(PROG_A)
        await selects.nth(1).selectOption(PROG_B)

        const blocks = page.getByTestId("compare-admissions")
        await expect(blocks).toHaveCount(2)

        for (const block of await blocks.all()) {
            await expect(block.getByText("Tuyển sinh 2026")).toBeVisible()
            // CTU rows are program-scope — labeled "Theo ngành", never as
            // school/group context.
            await expect(block.getByText("Điểm chuẩn").first()).toBeVisible()
            await expect(
                block.getByText(/Theo ngành/i).first()
            ).toBeVisible()
            await expect(block.getByText("Chỉ tiêu tuyển sinh")).toBeVisible()
            // Per-record provenance: real source domain link
            const sourceLink = block.getByTestId("admissions-source-link").first()
            await expect(sourceLink).toBeVisible()
            await expect(sourceLink).toContainText("tuyensinh.ctu.edu.vn")
            await expect(sourceLink).toHaveAttribute("rel", /noopener/)
            // Reference-only warning
            await expect(
                block.getByText("Điểm năm trước chỉ mang tính tham khảo, không bảo đảm trúng tuyển.")
            ).toBeVisible()
        }

        // Real per-program values from CTU.json (2026):
        //   Sư phạm Vật lý: cutoff 27.62/30, quota 51, tuition 27.380.000đ/năm
        //   Kỹ thuật ô tô:  cutoff 23.2/30,  quota 80, tuition 33.400.000đ/năm
        await expect(blocks.nth(0).getByText("27.62").first()).toBeVisible()
        await expect(blocks.nth(1).getByText("23.2").first()).toBeVisible()
        await expect(
            blocks.nth(0).getByTestId("compare-admissions-quotas").getByText("51").first()
        ).toBeVisible()
        await expect(
            blocks.nth(1).getByTestId("compare-admissions-quotas").getByText("80").first()
        ).toBeVisible()
        const tuitionBlock = page.getByTestId("compare-admissions-tuition").first()
        await expect(tuitionBlock.getByText(/27\.380\.000/).first()).toBeVisible()
        await expect(tuitionBlock.getByText(/2026-2027/).first()).toBeVisible()
    })

    test("scores with different scales render raw side by side — no normalization", async ({
        page,
    }) => {
        const selects = await gotoCompare(page)
        // HUTECH "Thanh nhạc" carries program-scope rows on three scales:
        // ĐGNL ĐHQG-HCM 600/1200, THPT 15/30, học bạ 18/30, V-SAT 225/600.
        await selects.nth(0).selectOption(PROG_MUSIC)
        await selects.nth(1).selectOption(PROG_B)

        const scores = page.getByTestId("compare-admissions-scores").first()
        await expect(scores).toBeVisible()

        // Each scale keeps its own label verbatim — no normalization.
        await expect(scores.getByText("/ 1200").first()).toBeVisible()
        await expect(scores.getByText("/ 600").first()).toBeVisible()
        await expect(scores.getByText("/ 30").first()).toBeVisible()
        await expect(scores.getByText("600").first()).toBeVisible()
        await expect(scores.getByText("225").first()).toBeVisible()
        // Method labels preserved on rows
        await expect(scores.getByText(/Đánh giá năng lực ĐHQG TP\.HCM/i).first()).toBeVisible()
        await expect(scores.getByText(/đánh giá đầu vào đại học V-SAT/i).first()).toBeVisible()
    })

    test("university without an admissions snapshot shows the empty state (not zeros)", async ({
        page,
    }) => {
        // Both pinned programs are CTU; simulate the snapshot file being
        // absent — fetchAdmissions resolves null on 404 → empty state.
        await page.route("**/mock/admissions/CTU.json", (route) =>
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
