import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: "http://localhost:3000",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },
    projects: [
        {
            name: "Desktop Chrome",
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "Mobile Chrome (Pixel 7)",
            use: { ...devices["Pixel 7"] },
        },
        {
            name: "Mobile Chrome (iPhone 14 Emulation)",
            use: {
                ...devices["iPhone 14"],
                defaultBrowserType: "chromium",
            },
        },
    ],
    webServer: {
        command: "npm run dev -- -p 3000",
        port: 3000,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },
})
