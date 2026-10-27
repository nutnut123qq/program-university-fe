/**
 * Local override of ../playwright.config.ts for this machine.
 * Usage: E2E_PORT=3100 node node_modules/@playwright/test/cli.js test -c e2e/playwright.local.config.ts
 * Builds the current tree and serves it with `next start` itself — no server
 * needs to be started first. `next dev` is not used: on this machine Turbopack
 * corrupts .next/dev/prerender-manifest.json mid-run (HTTP 500s, v2.39).
 * A server already on E2E_PORT is never reused (stale build or another app):
 * Playwright stops with "port already used" instead — free the port first.
 * The root config is left on :3000 + `next dev` — :3000 is held by an
 * unrelated app here, so a change there could not be verified.
 */
import { defineConfig } from "@playwright/test"
import base from "../playwright.config"

const port = Number(process.env.E2E_PORT ?? 3100)
const next = "node node_modules/next/dist/bin/next"

export default defineConfig({
    ...base,
    testDir: ".",
    testIgnore: ["**/playwright.local.config.ts"],
    use: { ...base.use, baseURL: `http://localhost:${port}` },
    webServer: {
        command: `${next} build && ${next} start -p ${port}`,
        cwd: "..",
        port,
        reuseExistingServer: false,
        // Covers the production build (~2-3 min here) before the port opens.
        timeout: 600000,
    },
})
