import { test, expect } from "@playwright/test"

test.describe("Bottom Sheet & Interactive Modals E2E Suite", () => {
    test.beforeEach(async ({ page }) => {
        // Set mobile viewport for bottom sheet verification
        await page.setViewportSize({ width: 375, height: 667 })
    })

    test("SyllabusDetailModal should behave as a responsive Bottom Sheet with assessment progress bars and threshold warnings", async ({ page }) => {
        await page.goto("/vi/roadmap", { waitUntil: "networkidle" })

        // 1. Open Syllabus modal for the active subject
        const openModalBtn = page.getByRole("button", { name: /Xem Đề cương chi tiết|Bảng Điểm & Lịch Trình/i }).first()
        await expect(openModalBtn).toBeVisible()
        await openModalBtn.click()

        // 2. Verify modal container presence and bottom-sheet structure
        const modalContainer = page.locator("div.fixed.inset-0.z-50").last()
        await expect(modalContainer).toBeVisible()

        // Verify title inside modal header
        await expect(modalContainer.getByText(/SWE201c|Nhập môn Kỹ thuật Phần mềm/i).first()).toBeVisible()

        // 3. Verify Assessments tab (Cấu trúc điểm thi) is loaded by default
        const assessmentsTab = modalContainer.getByRole("button", { name: /Cấu trúc điểm thi/i })
        await expect(assessmentsTab).toBeVisible()

        // Verify progress bars are present
        const progressBars = modalContainer.locator("div[role='progressbar']")
        await expect(progressBars.first()).toBeVisible()

        // 4. Verify Passing Criteria & Strict Threshold Warning Badge
        const thresholdWarning = modalContainer.getByText(/Điểm qua môn|chống liệt/i).first()
        await expect(thresholdWarning).toBeVisible()

        // 5. Switch to Sessions / Schedule tab
        const scheduleTab = modalContainer.getByRole("button", { name: /Kế hoạch bài giảng/i })
        if (await scheduleTab.isVisible()) {
            await scheduleTab.click()
            await page.waitForTimeout(200)
        }

        // 6. Close Modal
        const closeBtn = modalContainer.getByRole("button", { name: /Đóng/i }).first()
        await closeBtn.click()
        await expect(modalContainer).not.toBeVisible()
    })

    test("ProgramDetailDialog should render bottom-sheet layout with scrollable curriculum table", async ({ page }) => {
        await page.goto("/vi/", { waitUntil: "networkidle" })

        // 1. Click "Xem chi tiết" on the first program card
        const viewDetailBtn = page.getByRole("button", { name: /Xem chi tiết/i }).first()
        await expect(viewDetailBtn).toBeVisible()
        await viewDetailBtn.click()

        // 2. Verify Program Detail modal container
        const detailModal = page.locator("div.fixed.inset-0.z-50").last()
        await expect(detailModal).toBeVisible()

        // 3. Navigate to Curriculum (Khung chương trình) tab
        const curriculumTab = detailModal.getByRole("button", { name: /Khung chương trình/i })
        await curriculumTab.click()

        // 4. Verify curriculum table exists and is inside an overflow-x-auto container
        const tableWrapper = detailModal.locator("div.overflow-x-auto")
        await expect(tableWrapper.first()).toBeVisible()

        // 5. Verify no horizontal overflow in modal viewport
        const modalScrollWidth = await page.evaluate(() => {
            return document.documentElement.scrollWidth <= window.innerWidth + 1
        })
        expect(modalScrollWidth).toBe(true)

        // 6. Close Program Detail modal
        const closeIconBtn = detailModal.locator("button:has(svg.lucide-x)").first()
        await closeIconBtn.click()
        await expect(detailModal).not.toBeVisible()
    })
})
