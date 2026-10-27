import { test, expect } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"

/**
 * v1.4 UC-V14-03 — analytics/copy consistency with the current public snapshot.
 *
 * Snapshot ground truth = public/mock/index.json + programs/page-*.json, read
 * at test time (v2.44: the totals changed when the exporter quarantined 197
 * template course lists, so they are derived here instead of pinned).
 * The SLM quality numbers are checked against the snapshot in
 * e2e/v244-quarantine.spec.ts — labeled as an evaluated set, never merged
 * with catalog totals.
 */
const MOCK = path.join(__dirname, "..", "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))

function snapshotTotals() {
    const index = readJson(path.join(MOCK, "index.json"))
    const programs: { courseCount: number }[] = (index.chunks as string[]).flatMap((f) =>
        readJson(path.join(MOCK, "programs", f))
    )
    return {
        programs: programs.length,
        courses: programs.reduce((sum, p) => sum + p.courseCount, 0),
        noCourses: programs.filter((p) => p.courseCount === 0).length,
    }
}
const group = (n: number, sep: string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep)

test.describe("v1.4 — analytics/copy consistency", () => {
    test("vi analytics page shows current snapshot totals, no stale claims", async ({ page }) => {
        const t = snapshotTotals()
        expect(t.programs).toBe(readJson(path.join(MOCK, "index.json")).totalCount)
        await page.goto("/vi/analytics", { waitUntil: "domcontentloaded" })

        const body = page.locator("body")

        // Current snapshot-derived catalog numbers
        await expect(page.getByRole("heading", { name: /17 Trường/i })).toBeVisible({ timeout: 30_000 })
        await expect(body).toContainText(group(t.programs, ","))
        await expect(body).toContainText(group(t.courses, ","))
        await expect(body).toContainText(group(t.programs, "."))
        await expect(body).toContainText(`${group(t.courses, ".")} môn học`)
        await expect(body).toContainText(`${t.noCourses}/${group(t.programs, ".")} ngành chưa có danh mục môn học`)

        // Stale catalog claims must be gone
        await expect(body).not.toContainText(/105[.,]408/)
        await expect(body).not.toContainText(/105[.,]602/)
        await expect(body).not.toContainText(/105[.,]690/)
        await expect(body).not.toContainText(/12 Trường/i)

        // 1,840 may only appear as the labeled evaluated reference set,
        // never as a current catalog total
        await expect(body).not.toContainText(/1\.840 (ngành|chương trình đào tạo)/i)
        await expect(body).toContainText(/tập đánh giá/i)
    })

    test("en analytics page shows current snapshot totals, no stale claims", async ({ page }) => {
        const t = snapshotTotals()
        await page.goto("/en/analytics", { waitUntil: "domcontentloaded" })

        const body = page.locator("body")

        await expect(page.getByRole("heading", { name: /17 Universities/i })).toBeVisible({ timeout: 30_000 })
        await expect(body).toContainText(group(t.programs, ","))
        await expect(body).toContainText(group(t.courses, ","))
        await expect(body).toContainText(`${t.noCourses} of ${group(t.programs, ",")} programs have no extracted course catalog`)

        await expect(body).not.toContainText(/105[.,]408/)
        await expect(body).not.toContainText(/105[.,]602/)
        await expect(body).not.toContainText(/105[.,]690/)
        await expect(body).not.toContainText(/12 Universities/i)
        await expect(body).not.toContainText(/1,840 (academic|training) programs/i)
        await expect(body).toContainText(/evaluated (reference )?set/i)
    })

    test("programs list subtitle matches snapshot catalog count", async ({ page }) => {
        const t = snapshotTotals()
        await page.goto("/vi/programs", { waitUntil: "domcontentloaded" })

        const body = page.locator("body")
        await expect(body).toContainText(group(t.programs, "."))
        await expect(body).not.toContainText("1.840")
    })
})
