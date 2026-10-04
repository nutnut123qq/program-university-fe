import { test, expect, Page } from "@playwright/test"

/**
 * Admission data section in ProgramDetailDialog (SPEC-ADMISSION-DATA §4).
 * Demo mode only (NEXT_PUBLIC_USE_MOCK=true) — data comes from the real
 * DB exports at public/mock/admissions/<UNI>.json.
 */

async function openProgramDetail(page: Page, programName: string, universityName: string) {
    await page.goto("/vi", { waitUntil: "networkidle" })

    const searchInput = page.getByPlaceholder(/Tìm tên ngành, mã ngành/i)
    await searchInput.fill(programName)
    // Debounce + full mock chunk load
    await page.waitForTimeout(600)

    const card = page
        .locator("div.group")
        .filter({ hasText: universityName })
        .filter({ hasText: programName })
        .first()
    await expect(card).toBeVisible({ timeout: 15000 })
    await card.getByRole("button", { name: /Xem chi tiết/i }).click()

    // Switch to the "Tuyển sinh" tab inside the dialog
    await page.getByRole("button", { name: /^Tuyển sinh$/ }).click()
    return page.getByTestId("admissions-section")
}

test.describe("Admission Data Section (ProgramDetailDialog)", () => {
    test("UET program renders real scores, quotas, tuition and source links", async ({
        page,
    }) => {
        // Công nghệ thông tin (CN1) — Trường Đại học Công nghệ - ĐHQGHN (UET)
        // Real data: single 'combined' method (cutoff quy đổi thang 30) — no method selector
        const section = await openProgramDetail(
            page,
            "Công nghệ thông tin (CN1)",
            "Trường Đại học Công nghệ"
        )

        await expect(section).toBeVisible()
        await expect(section.getByText("Tuyển sinh 2026")).toBeVisible()

        // Default method view = newest year: real 2026 combined cutoff 25/30
        await expect(section.getByText("Điểm xét tuyển")).toBeVisible()
        await expect(section.getByText(/^25\s*\/\s*30/)).toBeVisible()

        // Year-aware method selector: switching to 2025 shows the real
        // 28.19/30 "quy đổi thang 30" cutoff row
        await section.getByRole("button", { name: /· 2025/ }).click()
        // Scope to the score-row span — the v1.3 trend chart also renders a
        // "28.19" point label, so a bare getByText("28.19") is ambiguous.
        await expect(section.getByText("28.19 /")).toBeVisible()
        await expect(section.getByText(/quy đổi thang 30/i).first()).toBeVisible()

        // Real quotas: program 420 (2025) + 460 (2026) + school-wide 4,020
        // labeled by scope — all years render with year badges
        await expect(section.getByText("Chỉ tiêu tuyển sinh")).toBeVisible()
        // exact match — the trend chart's SVG innerText concatenates axis
        // labels ("…202420252026…") which a bare /420/ regex would also hit
        await expect(section.getByText("420", { exact: true })).toBeVisible()
        await expect(section.getByText("460", { exact: true })).toBeVisible()
        await expect(
            section.getByText(/Chỉ tiêu theo nhóm ngành\/trường/i).first()
        ).toBeVisible()

        // Real tuitions: 40.000.000 đồng/năm 2025-2026, 44.000.000 2026-2027
        await expect(section.getByRole("heading", { name: "Học phí" })).toBeVisible()
        await expect(section.getByText(/40\.000\.000/).first()).toBeVisible()
        await expect(section.getByText(/44\.000\.000/).first()).toBeVisible()
        await expect(section.getByText(/đồng\/năm/i).first()).toBeVisible()
        await expect(section.getByText(/2025-2026/).first()).toBeVisible()
        await expect(section.getByText(/2026-2027/).first()).toBeVisible()

        // Per-record provenance: external source link with real domain
        const sourceLink = section.getByTestId("admissions-source-link").first()
        await expect(sourceLink).toBeVisible()
        await expect(sourceLink).toContainText("vnu.edu.vn")
        await expect(sourceLink).toHaveAttribute("rel", /noopener/)

        // Fixed reference-only warning
        await expect(
            section.getByText("Điểm năm trước chỉ mang tính tham khảo, không bảo đảm trúng tuyển.")
        ).toBeVisible()
    })

    test("UEH program renders campus-scoped rows (KSA/KSV) with scope labels", async ({ page }) => {
        // Ngôn ngữ Anh (Tiếng Anh thương mại) — UEH: KSA 24.5 + KSV 17.0 (real)
        const section = await openProgramDetail(
            page,
            "Ngôn ngữ Anh (Tiếng Anh thương mại)",
            "Trường Đại học Kinh tế TP.HCM"
        )

        await expect(section).toBeVisible()
        // Default method view = newest year: 2026 "tích hợp" rows on thang
        // 100 (KSA 83.40/100) render first
        await expect(section.getByText("83.40")).toBeVisible()
        // Switch to the 2025 method via the year-aware selector: real
        // campus rows KSA 24.5 + KSV 17.0 (scale 30)
        await section.getByRole("button", { name: /· 2025/ }).click()
        await expect(section.getByText("24.5")).toBeVisible()
        // "17" bare also matches provenance dates (Công bố: 17/08/2024) —
        // pin to the score "17 / 30" instead.
        await expect(section.getByText(/^17\s*\/\s*30/)).toBeVisible()
        await expect(section.getByText("Cơ sở KSA").first()).toBeVisible()
        await expect(section.getByText("Cơ sở KSV").first()).toBeVisible()

        // Real tuition rows (per-credit KSA rates)
        await expect(section.getByRole("heading", { name: "Học phí" })).toBeVisible()
        await expect(section.getByText(/đồng\/tín chỉ/i).first()).toBeVisible()
        await expect(section.getByTestId("admissions-source-link").first()).toBeVisible()
    })

    test("Missing admissions snapshot shows the empty state (not zeros)", async ({
        page,
    }) => {
        // All 17 universities ship a snapshot now; simulate the file being
        // absent — fetchAdmissions returns null on 404 → empty state.
        await page.route("**/mock/admissions/UET.json", (route) =>
            route.fulfill({ status: 404, body: "Not found" })
        )
        const section = await openProgramDetail(
            page,
            "Công nghệ thông tin (CN1)",
            "Trường Đại học Công nghệ"
        )

        await expect(section).toBeVisible()
        await expect(section.getByTestId("admissions-empty")).toBeVisible()
        await expect(section.getByText("Chưa có dữ liệu tuyển sinh")).toBeVisible()
        // Guard: no accidental "0 điểm" / "0 chỉ tiêu" renders
        await expect(section.getByText(/^0$/)).toHaveCount(0)
    })
})
