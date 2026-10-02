import { test, expect } from "@playwright/test"

const TEST_ROUTES = [
    "/vi",
    "/vi/roadmap",
    "/vi/materials",
]

const MOBILE_VIEWPORTS = [
    { name: "Mobile Small (320px)", width: 320, height: 568 },
    { name: "iPhone SE (375px)", width: 375, height: 667 },
    { name: "iPhone 14 / Pixel 7 (390px)", width: 390, height: 844 },
    { name: "Tablet Portrait (768px)", width: 768, height: 1024 },
]

test.describe("Mobile Zero Horizontal Scroll Audit", () => {
    for (const route of TEST_ROUTES) {
        for (const viewport of MOBILE_VIEWPORTS) {
            test(`Should have zero horizontal scroll on ${route} with ${viewport.name}`, async ({ page }) => {
                await page.setViewportSize({ width: viewport.width, height: viewport.height })
                await page.goto(route, { waitUntil: "networkidle" })

                // Allow any initial animations to settle
                await page.waitForTimeout(300)

                // Evaluate whether the document's scrollWidth exceeds window.innerWidth
                const scrollInfo = await page.evaluate(() => {
                    const scrollWidth = Math.max(
                        document.documentElement.scrollWidth,
                        document.body.scrollWidth
                    )
                    const clientWidth = window.innerWidth
                    const isOverflowing = scrollWidth > clientWidth + 1 // 1px tolerance for subpixel rendering
                    return {
                        scrollWidth,
                        clientWidth,
                        isOverflowing,
                    }
                })

                expect(
                    scrollInfo.isOverflowing,
                    `Page ${route} has horizontal overflow at width ${viewport.width}px! (scrollWidth: ${scrollInfo.scrollWidth}, clientWidth: ${scrollInfo.clientWidth})`
                ).toBe(false)
            })
        }
    }
})

test.describe("Mobile navigation drawer", () => {
    test("Hamburger opens drawer at 375px and links navigate", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 })
        await page.goto("/vi", { waitUntil: "networkidle" })

        const toggle = page.getByRole("button", { name: "Menu" })
        await expect(toggle).toBeVisible()
        await toggle.click()

        const drawer = page.locator("#mobile-nav-menu")
        await expect(drawer).toBeVisible()

        // Same section links as desktop must be reachable on mobile
        await drawer.getByRole("link", { name: "Lộ trình" }).click()
        await expect(page).toHaveURL(/\/vi\/roadmap/)
        await expect(page.locator("#mobile-nav-menu")).toHaveCount(0)
    })
})

test.describe("Mobile chat layout", () => {
    test("Sidebar is closed by default and main column stays usable at 375px", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 })
        await page.goto("/vi/chat", { waitUntil: "networkidle" })
        // Allow the sidebar close transition to finish
        await page.waitForTimeout(400)

        const main = page.locator("main.flex-1")
        const mainBox = await main.boundingBox()
        expect(mainBox?.width ?? 0).toBeGreaterThanOrEqual(250)

        // Opening the sidebar turns it into an overlay — the main column must
        // not be crushed when it is open either.
        await page.getByRole("button", { name: "Lịch sử trò chuyện" }).click()
        await page.waitForTimeout(350)
        const openMainBox = await main.boundingBox()
        expect(openMainBox?.width ?? 0).toBeGreaterThanOrEqual(250)
    })
})
