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
