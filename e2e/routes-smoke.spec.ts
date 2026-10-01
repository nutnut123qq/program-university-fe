import { test, expect, type Page, type Locator } from "@playwright/test"

/**
 * Route smoke tests: every top-level route must load with an OK HTTP status,
 * raise no uncaught page errors / unexpected console errors, and render a key element.
 *
 * NOTE: /vi/chat only asserts the input renders. Never send a message here —
 * it would hit a paid LLM API.
 */

type RouteCase = {
    path: string
    name: string
    keyElement: (page: Page) => Locator
}

const ROUTES: RouteCase[] = [
    {
        path: "/vi",
        name: "home (program list)",
        keyElement: (page) => page.getByRole("heading", { level: 1, name: /Tra cứu Chương trình Đào tạo/i }),
    },
    {
        path: "/vi/programs",
        name: "programs",
        keyElement: (page) => page.getByRole("heading", { level: 1, name: /Tra cứu Chương trình Đào tạo/i }),
    },
    {
        path: "/vi/analytics",
        name: "analytics",
        keyElement: (page) => page.getByRole("heading", { level: 1, name: /Dashboard Phân tích/i }),
    },
    {
        path: "/vi/compare",
        name: "compare",
        keyElement: (page) => page.getByRole("heading", { level: 1, name: /So sánh/i }),
    },
    {
        path: "/vi/roadmap",
        name: "roadmap",
        keyElement: (page) => page.getByRole("heading", { level: 1, name: /Lộ trình Môn học/i }),
    },
    {
        path: "/vi/materials",
        name: "materials",
        keyElement: (page) => page.getByRole("heading", { level: 1, name: /Thư viện Giáo trình/i }),
    },
    {
        path: "/vi/chat",
        name: "chat (input only)",
        keyElement: (page) => page.getByPlaceholder(/Nhập câu hỏi/i),
    },
]

/** Console errors that are environmental noise rather than app bugs. */
const BENIGN_CONSOLE_PATTERNS: RegExp[] = [
    /Download the React DevTools/i,
    /\[Fast Refresh\]/i,
    /\[HMR\]/i,
    /favicon\.ico/i,
    // Next dev overlay / HMR websocket hiccups
    /webpack-hmr|_next\/webpack-hmr|turbopack-hmr/i,
    /WebSocket connection to .* failed/i,
]

const isBenign = (text: string) => BENIGN_CONSOLE_PATTERNS.some((re) => re.test(text))

test.describe("Route smoke tests", () => {
    for (const route of ROUTES) {
        test(`${route.path} — ${route.name} loads cleanly`, async ({ page }) => {
            const pageErrors: string[] = []
            const consoleErrors: string[] = []

            page.on("pageerror", (err) => pageErrors.push(`${err.name}: ${err.message}`))
            page.on("console", (msg) => {
                if (msg.type() !== "error") return
                const text = msg.text()
                if (!isBenign(text)) consoleErrors.push(text)
            })

            const response = await page.goto(route.path, { waitUntil: "domcontentloaded" })
            expect(response, `no response for ${route.path}`).not.toBeNull()
            expect(response!.ok(), `HTTP ${response!.status()} for ${route.path}`).toBeTruthy()

            await expect(route.keyElement(page).first()).toBeVisible({ timeout: 30_000 })

            // Let client-side data fetching / hydration settle so late errors surface.
            await page.waitForLoadState("networkidle").catch(() => {})

            expect(pageErrors, `uncaught page errors on ${route.path}`).toEqual([])
            expect(consoleErrors, `console errors on ${route.path}`).toEqual([])
        })
    }
})
