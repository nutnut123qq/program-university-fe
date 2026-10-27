import { test, expect, Page } from "@playwright/test"
import { existsSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.44 — fabricated content is quarantined from the snapshot.
 *
 * The DB still holds script-generated course lists (3 generator templates),
 * a template "Cơ hội nghề nghiệp" sentence and a filler tuition line; the
 * canonical exporter drops them, so a student sees an honest empty state.
 * HCMUS "Công nghệ giáo dục (7140103)" carried every kind: an 11-row template
 * course list ("Hệ điều hành", "Mạng máy tính"…, codes HCMUS-CSC…), credits =
 * the template total 49, the filler tuition, the template career sentence and
 * an SLM score computed on the fake courses.
 * Expected analytics numbers are computed from public/mock at test time.
 * domcontentloaded, not networkidle: the quarantined program's curricula
 * fetch is a 404, which can keep networkidle pending on `next start` (AGENTS.md §12).
 */
const PID = "24997795-c3e0-4ee1-a009-37918fe39c83"
const NAME = "Công nghệ giáo dục (7140103)"
const UNI = "Khoa học Tự nhiên"
const TUITION_FILLER = "Theo quy định của Nhà nước và Nhà trường"
const CAREER_TEMPLATE =
    /có thể đảm nhận các vị trí chuyên viên, kỹ sư, quản lý tại các doanh nghiệp, tập đoàn trong và ngoài nước, các viện nghiên cứu hoặc cơ sở giáo dục\./
const TEMPLATE_COURSES = ["Hệ điều hành", "Mạng máy tính", "Trí tuệ nhân tạo", "Khóa luận tốt nghiệp cử nhân"]

const MOCK = path.join(__dirname, "..", "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const vi = readJson(path.join(__dirname, "..", "src", "messages", "vi.json"))

type MockProgram = {
    id: string
    universityId: string
    courseCount: number
    credits: number | null
    tuition: string | null
    careerOutlook: string | null
    evaluationScore?: number | null
}

function snapshotPrograms(): MockProgram[] {
    const index = readJson(path.join(MOCK, "index.json"))
    return (index.chunks as string[]).flatMap((f) => readJson(path.join(MOCK, "programs", f)))
}

const group = (n: number, sep: string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep)

async function openDetail(page: Page) {
    await page.goto("/vi", { waitUntil: "domcontentloaded" })
    // Cards rendered = hydrated + first chunk loaded; then search.
    await expect(page.getByRole("button", { name: /Xem chi tiết/i }).first()).toBeVisible({ timeout: 30000 })
    await page.getByPlaceholder(/Tìm tên ngành, mã ngành/i).fill(NAME)
    const card = page.locator("div.group").filter({ hasText: UNI }).filter({ hasText: NAME }).first()
    await expect(card).toBeVisible({ timeout: 20000 })
    return card
}

test.describe("v2.44 — quarantined fabricated content", () => {
    test("snapshot: no filler tuition, no template career sentence, acceptance program has no course list", () => {
        const programs = snapshotPrograms()
        expect(programs.length).toBeGreaterThan(1900)
        expect(programs.filter((p) => (p.tuition ?? "").trim() === TUITION_FILLER)).toHaveLength(0)
        expect(programs.filter((p) => CAREER_TEMPLATE.test(p.careerOutlook ?? ""))).toHaveLength(0)

        const p = readJson(path.join(MOCK, "programs-by-id", `${PID}.json`))
        expect(p.name).toBe(NAME)
        expect(p.courseCount).toBe(0)
        expect(p.credits).toBeNull()
        expect(p.evaluationScore ?? null).toBeNull()
        expect(existsSync(path.join(MOCK, "curricula", `${PID}.json`))).toBe(false)
    })

    test("HCMUS Công nghệ giáo dục: honest empty curriculum, no filler, no SLM score", async ({ page }) => {
        const card = await openDetail(page)
        // Card: no template credits / course count badge
        await expect(card).not.toContainText(vi.programs.credits.replace("{count}", "49"))
        await expect(card).not.toContainText(vi.programs.courses.replace("{count}", "11"))
        await card.getByRole("button", { name: /Xem chi tiết/i }).click()

        const dialog = page.locator("div.fixed.inset-0.z-50").last()
        await expect(dialog.getByRole("heading", { name: NAME })).toBeVisible({ timeout: 15000 })

        // Info tab (default): no filler tuition, no template career sentence
        await expect(dialog.getByText(vi.programs.tuition, { exact: true })).toBeVisible()
        await expect(dialog).not.toContainText(TUITION_FILLER)
        await expect(dialog).not.toContainText(CAREER_TEMPLATE)

        // Curriculum tab: the honest empty state, none of the template courses
        await dialog.getByRole("button", { name: vi.programs.curriculumTab, exact: true }).click()
        await expect(dialog.getByText(vi.programs.noCurriculum)).toBeVisible({ timeout: 15000 })
        for (const course of TEMPLATE_COURSES) await expect(dialog).not.toContainText(course)
        await expect(dialog).not.toContainText("HCMUS-CSC")

        // Evaluation tab: no SLM score (it was computed on the fake course list)
        await dialog.getByRole("button", { name: vi.programs.evalTab, exact: true }).click()
        await expect(dialog.getByText(vi.programs.evalEmpty)).toBeVisible()
        await expect(dialog).not.toContainText(`${vi.programs.slmRefScore}:`)
    })

    test("analytics: SLM numbers are computed on the published (non-quarantined) set", async ({ page }) => {
        const programs = snapshotPrograms()
        const codeOf = new Map<string, string>(
            readJson(path.join(MOCK, "universities.json")).map((u: { id: string; code: string }) => [u.id, u.code])
        )
        const scored = programs.filter((p) => typeof p.evaluationScore === "number")
        const scores = scored.map((p) => p.evaluationScore as number)
        const n = scores.length
        const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
        const pct = (k: number) => `${((100 * k) / n).toFixed(1)}%`
        const gold = scores.filter((s) => s >= 9.0).length
        const pass = scores.filter((s) => s >= 6.0).length
        const bands = [
            scores.filter((s) => s >= 9.0).length,
            scores.filter((s) => s >= 7.5 && s < 9.0).length,
            scores.filter((s) => s >= 6.0 && s < 7.5).length,
            scores.filter((s) => s >= 4.0 && s < 6.0).length,
            scores.filter((s) => s < 4.0).length,
        ]
        // Per-university mean: only scored programs WITH a course list — a
        // program without course data gets 0 for structure/knowledge blocks. A
        // university left with none is "not enough data": unranked, after the ranked rows.
        const byUni = new Map<string, number[]>()
        const allByUni = new Map<string, number[]>()
        for (const p of programs) {
            const code = codeOf.get(p.universityId) as string
            if (!byUni.has(code)) byUni.set(code, [])
            if (typeof p.evaluationScore !== "number") continue
            allByUni.set(code, [...(allByUni.get(code) ?? []), p.evaluationScore])
            if (p.courseCount > 0) byUni.get(code)!.push(p.evaluationScore)
        }
        const ranking = [...byUni.entries()]
            .filter(([, xs]) => xs.length > 0)
            .map(([code, xs]) => ({ code, score: mean(xs) }))
            .sort((a, b) => b.score - a.score)
        const noData = [...byUni.entries()].filter(([, xs]) => xs.length === 0).map(([code]) => code)
        expect(n).toBeLessThan(programs.length) // quarantined programs carry no score
        expect(ranking.length + noData.length).toBe(17)
        // DTU: every program still scored has no course list (its template list is quarantined).
        expect(noData).toContain("DTU")
        expect(allByUni.get("DTU")?.length ?? 0).toBeGreaterThan(0)
        // HUST: its course-less programs no longer pull the mean down.
        const hust = ranking.find((u) => u.code === "HUST")!
        expect(hust.score).toBeGreaterThan(mean(allByUni.get("HUST")!))

        await page.goto("/vi/analytics", { waitUntil: "domcontentloaded" })
        const body = page.locator("body")
        await expect(page.getByRole("heading", { name: /17 Trường/i })).toBeVisible({ timeout: 30000 })

        const avg = mean(scores).toFixed(2)
        await expect(body).toContainText(`${avg}/10.0`)
        await expect(body).toContainText(`${avg} / 10.0`)
        await expect(body).toContainText(`tập đánh giá ${group(n, ".")} CTĐT`)
        await expect(body).toContainText(`${pct(pass)} (${group(pass, ",")} Ngành)`)
        await expect(body).toContainText(`${gold} Ngành (${pct(gold)})`)
        for (const k of bands) await expect(body).toContainText(vi.analytics.distProgramCount.replace("{count}", String(k)))
        for (const k of bands) await expect(body).toContainText(pct(k))

        const rowOf = (code: string) =>
            page.locator("div.space-y-2").filter({ has: page.getByText(code, { exact: true }) })
        for (const [i, u] of ranking.entries()) {
            const row = rowOf(u.code)
            await expect(row).toContainText(`#${i + 1}`)
            await expect(row).toContainText(`${u.score.toFixed(2)} / 10.0`)
            const status = u.score >= 7.5 ? "statusGood" : u.score >= 6.0 ? "statusPass" : "statusNeedsImprovement"
            await expect(row).toContainText(vi.analytics[status])
        }
        await expect(rowOf("HUST")).toContainText(`${hust.score.toFixed(2)} / 10.0`)
        const used = [...byUni.values()].reduce((sum, xs) => sum + xs.length, 0)
        await expect(body).toContainText(`${group(used, ".")} CTĐT có danh mục môn học`)
        for (const code of noData) {
            const row = rowOf(code)
            await expect(row).toContainText(vi.analytics.statusNoData)
            await expect(row).not.toContainText("#")
            await expect(row).not.toContainText("/ 10.0")
            for (const k of ["statusGood", "statusPass", "statusNeedsImprovement"] as const)
                await expect(row).not.toContainText(vi.analytics[k])
        }
        // Unranked rows come after every ranked row.
        const codesInOrder = await page.locator("div.space-y-2 .font-mono").allInnerTexts()
        expect(codesInOrder).toEqual([...ranking.map((u) => u.code), ...codesInOrder.slice(ranking.length)])
        expect([...codesInOrder.slice(ranking.length)].sort()).toEqual([...noData].sort())
    })
})
