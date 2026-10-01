/**
 * Local override of ../playwright.config.ts for when port 3000 is taken.
 * Usage: E2E_PORT=3100 node node_modules/@playwright/test/cli.js test -c e2e/playwright.local.config.ts
 * Expects a dev server already running on E2E_PORT (reuseExistingServer).
 */
import { defineConfig } from "@playwright/test"
import base from "../playwright.config"

const port = Number(process.env.E2E_PORT ?? 3100)

export default defineConfig({
    ...base,
    testDir: ".",
    testIgnore: ["**/playwright.local.config.ts"],
    use: { ...base.use, baseURL: `http://localhost:${port}` },
    webServer: {
        command: `node node_modules/next/dist/bin/next dev -p ${port}`,
        cwd: "..",
        port,
        reuseExistingServer: true,
        timeout: 120000,
    },
})
