import { test, expect } from "@playwright/test"

test.describe("Search, Filtering & Autocomplete Flows E2E Suite", () => {
    test.describe("Roadmap Page Flows (/vi/roadmap)", () => {
        test("Should allow selecting popular subject chips to instantly switch roadmap focus", async ({ page }) => {
            await page.goto("/vi/roadmap", { waitUntil: "networkidle" })

            // Default focus is SWE201c
            await expect(page.getByText("SWE201c").first()).toBeVisible()

            // Click on PRF192 popular chip
            const prfChip = page.getByRole("button", { name: "PRF192" })
            await expect(prfChip).toBeVisible()
            await prfChip.click()

            // Verify focus switched to PRF192
            await expect(page.getByText("PRF192").first()).toBeVisible()
        })

        test("Should support search autocomplete and clearing input via X button", async ({ page }) => {
            await page.goto("/vi/roadmap", { waitUntil: "networkidle" })

            const searchInput = page.getByPlaceholder(/Nhập mã môn học/i)
            await searchInput.fill("CSD")

            // Verify suggestions dropdown appears and click CSD201
            const suggestionItem = page.locator("div.absolute button").filter({ hasText: /CSD201/i }).first()
            await expect(suggestionItem).toBeVisible()
            await suggestionItem.click()

            // Verify roadmap shifted to CSD201
            await expect(page.getByText("CSD201").first()).toBeVisible()

            // Type in search again and clear using X button
            await searchInput.fill("PRO")
            const clearBtn = page.getByRole("button", { name: "Xóa tìm kiếm" })
            await expect(clearBtn).toBeVisible()
            await clearBtn.click()

            await expect(searchInput).toHaveValue("")
        })
    })

    test.describe("Materials Page Flows (/vi/materials)", () => {
        test("Should filter by Coursera and highlight searched keywords", async ({ page }) => {
            await page.goto("/vi/materials", { waitUntil: "networkidle" })

            // 1. Click "Có Coursera" filter tab
            const courseraBtn = page.getByRole("button", { name: /Có Coursera/i })
            await expect(courseraBtn).toBeVisible()
            await courseraBtn.click()

            // Verify Coursera badges appear on material cards
            await expect(page.getByText("Coursera").first()).toBeVisible()

            // 2. Type in search bar and check for <mark> keyword highlighting
            const searchInput = page.getByPlaceholder(/Tìm kiếm theo mã môn/i)
            await searchInput.fill("Software")

            // Verify highlighted mark elements exist
            const markElements = page.locator("mark")
            await expect(markElements.first()).toBeVisible()
            await expect(markElements.first()).toContainText(/Software/i)

            // 3. Clear search via X button
            const clearBtn = page.getByRole("button", { name: "Xóa tìm kiếm" })
            await clearBtn.click()
            await expect(searchInput).toHaveValue("")
        })
    })

    test.describe("Program Catalog Filter Flows (/vi)", () => {
        test("Should search and reset filters cleanly", async ({ page }) => {
            await page.goto("/vi", { waitUntil: "networkidle" })

            const searchInput = page.getByPlaceholder(/Tìm tên ngành, mã ngành/i)
            await searchInput.fill("Công nghệ thông tin")

            // Wait for filtered results
            await page.waitForTimeout(400)
            const resultCounter = page.locator("text=/Hiển thị/i").first()
            await expect(resultCounter).toBeVisible()

            // Reset filters via "Xóa bộ lọc"
            const resetBtn = page.getByRole("button", { name: /Xóa bộ lọc/i })
            if (await resetBtn.isVisible()) {
                await resetBtn.click()
                await expect(searchInput).toHaveValue("")
            }
        })
    })
})
