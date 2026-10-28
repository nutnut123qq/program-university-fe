import { test, expect, Page, Download } from "@playwright/test"
import { existsSync, readdirSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.47 — honest analytics (audit V4, gap G5).
 *
 * The analytics page and its JSON/CSV downloads labelled an automatic SLM score
 * with verdict and accreditation-sounding words ("Xuất sắc AUN-QA Gold",
 * "Phạt gắt thiếu PLO", Tốt / Đạt / Cần cải thiện per university), averaged
 * scores the product hides elsewhere, showed no n, and every number was
 * written by hand. Now every number comes from src/lib/analytics-snapshot.json,
 * built by scripts/build-analytics.mjs from public/mock.
 *
 * "Enough data" = the product's two existing rules together: a program counts
 * when it carries an SLM score, has a course list (courseCount > 0 — without
 * courses structure and knowledge blocks cannot be scored, v2.44) and is not
 * marked dataSufficiency "insufficient" (the dialog hides that score).
 * Every expected value is recomputed here from public/mock at test time,
 * independently of the build script.
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const vi = readJson(path.join(ROOT, "src", "messages", "vi.json"))
const en = readJson(path.join(ROOT, "src", "messages", "en.json"))

type MockProgram = {
    universityId: string
    courseCount: number
    evaluationScore?: number | null
    dataSufficiency?: string | null
}
type Uni = { id: string; code: string; name: string }
type Row = { code: string; name: string; programs: number; n: number; raw: number | null }

// Score bands, high → low: a score belongs to the first band whose minimum it reaches.
const BANDS: [number, string][] = [
    [9, "9.0 - 10.0"],
    [7.5, "7.5 - 8.9"],
    [6, "6.0 - 7.4"],
    [4, "4.0 - 5.9"],
    [-Infinity, "1.0 - 3.9"],
]

function expected() {
    const index = readJson(path.join(MOCK, "index.json"))
    const programs: MockProgram[] = (index.chunks as string[]).flatMap((f) => readJson(path.join(MOCK, "programs", f)))
    const universities: Uni[] = readJson(path.join(MOCK, "universities.json"))
    const enough = (p: MockProgram) =>
        typeof p.evaluationScore === "number" && p.courseCount > 0 && p.dataSufficiency !== "insufficient"
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const r2 = (x: number) => Number(x.toFixed(2))
    const basis = programs.filter(enough).map((p) => p.evaluationScore as number)
    const rows: Row[] = universities
        .map((u) => {
            const mine = programs.filter((p) => p.universityId === u.id)
            const xs = mine.filter(enough).map((p) => p.evaluationScore as number)
            return { code: u.code, name: u.name, programs: mine.length, n: xs.length, raw: xs.length ? mean(xs) : null }
        })
        .filter((u) => u.programs > 0)
    const byCode = (a: Row, b: Row) => (a.code < b.code ? -1 : 1)
    const ranked = rows.filter((u) => u.raw !== null).sort((a, b) => (b.raw as number) - (a.raw as number) || byCode(a, b))
    const noData = rows.filter((u) => u.raw === null).sort(byCode)
    return {
        catalog: {
            programs: programs.length,
            courses: programs.reduce((sum, p) => sum + p.courseCount, 0),
            universities: rows.length,
            programsWithoutCourses: programs.filter((p) => p.courseCount === 0).length,
        },
        scoredPrograms: programs.filter((p) => typeof p.evaluationScore === "number").length,
        basis: { programs: basis.length, mean: r2(mean(basis)), atLeast6: basis.filter((s) => s >= 6).length },
        bands: BANDS.map(([min, range], i) => ({
            range,
            count: basis.filter((s) => s >= min && (i === 0 || s < BANDS[i - 1][0])).length,
        })),
        universities: [...ranked, ...noData].map(({ raw, ...u }) => ({ ...u, mean: raw === null ? null : r2(raw) })),
    }
}

const E = expected()
const pct = (k: number) => `${((100 * k) / E.basis.programs).toFixed(1)}%`
const group = (n: number, sep: string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep)
const FORBIDDEN_VI = /AUN-QA|Gold|Phạt gắt|Xuất sắc|Cần cải thiện|Đạt yêu cầu|Tốt \/ Standard/
const FORBIDDEN_EN = /AUN-QA|Gold|Heavy penalty|Excellent|Meets requirements|Needs improvement|Good \/ Standard/i
const FORBIDDEN_EXPORT = /AUN-QA|Gold|Phạt gắt|Xuất sắc|Cần cải thiện|Đạt yêu cầu|Tốt|Xếp loại|"status|statusKey/

async function open(page: Page, locale: "vi" | "en") {
    await page.goto(`/${locale}/analytics`, { waitUntil: "domcontentloaded" })
    const heading = locale === "vi" ? `${E.catalog.universities} Trường` : `${E.catalog.universities} Universities`
    await expect(page.getByRole("heading", { name: new RegExp(heading) })).toBeVisible({ timeout: 30_000 })
    return page.locator("body")
}

async function noHorizontalScroll(page: Page) {
    const fits = await page.evaluate(
        () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 1
    )
    expect(fits, "analytics page scrolls horizontally").toBe(true)
}

test.describe("v2.47 — honest analytics", () => {
    test("analytics-snapshot.json = recomputation from public/mock (drift guard)", () => {
        // Fixtures the other tests rely on: a university with n = 0 (today DTU)
        // and a basis smaller than the scored set.
        expect(E.universities.some((u) => u.n === 0)).toBe(true)
        expect(E.basis.programs).toBeLessThan(E.scoredPrograms)
        expect(E.basis.programs).toBeGreaterThan(0)
        const file = path.join(ROOT, "src", "lib", "analytics-snapshot.json")
        expect(existsSync(file), "missing — run: node scripts/build-analytics.mjs").toBe(true)
        expect(readJson(file), "stale — run: node scripts/build-analytics.mjs").toEqual(E)
    })

    test("vi page: numbers on the enough-data basis, n per university, no verdict label", async ({ page }) => {
        const body = await open(page, "vi")
        const b = E.basis
        const avg = b.mean.toFixed(2)
        await expect(body).toContainText(`${avg}/10.0`)
        await expect(body).toContainText(`${avg} / 10.0`)
        await expect(body).toContainText(`tập đánh giá ${group(b.programs, ".")} CTĐT đủ dữ liệu`)
        await expect(body).toContainText(`chỉ tính ${group(b.programs, ".")} CTĐT đủ dữ liệu`)
        await expect(body).toContainText(`${pct(b.atLeast6)} (${group(b.atLeast6, ".")} ngành)`)
        const top = E.bands[0].count
        await expect(body).toContainText(`${group(top, ".")} ngành (${pct(top)}) có điểm tham khảo 9.0-10.0`)

        const bands = page.getByTestId("score-band")
        await expect(bands).toHaveCount(E.bands.length)
        for (const [i, band] of E.bands.entries()) {
            const el = bands.nth(i)
            await expect(el).toHaveAttribute("data-range", band.range)
            await expect(el).toContainText(vi.analytics.distProgramCount.replace("{count}", String(band.count)))
            await expect(el).toContainText(pct(band.count))
        }

        const rows = page.getByTestId("uni-row")
        await expect(rows).toHaveCount(E.universities.length)
        expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-code")))).toEqual(
            E.universities.map((u) => u.code)
        )
        for (const [i, u] of E.universities.entries()) {
            const row = rows.nth(i)
            await expect(row).toContainText(`n = ${group(u.n, ".")}/${group(u.programs, ".")} ngành`)
            if (u.mean === null) {
                await expect(row).toContainText(vi.analytics.statusNoData)
                await expect(row).not.toContainText("#")
                await expect(row).not.toContainText("/ 10.0")
            } else {
                await expect(row).toContainText(`#${i + 1}`)
                await expect(row).toContainText(`${u.mean.toFixed(2)} / 10.0`)
            }
            for (const word of ["Tốt", "Đạt", "Cần cải thiện"]) await expect(row).not.toContainText(word)
        }
        await expect(body).not.toContainText(FORBIDDEN_VI)
        await noHorizontalScroll(page)
    })

    test("en page: same basis and n, no verdict label", async ({ page }) => {
        const body = await open(page, "en")
        const b = E.basis
        await expect(body).toContainText(`${b.mean.toFixed(2)} / 10.0`)
        await expect(body).toContainText(`evaluated set of ${group(b.programs, ",")} programs with enough data`)
        await expect(body).toContainText(`${pct(b.atLeast6)} (${group(b.atLeast6, ",")} programs)`)
        const rows = page.getByTestId("uni-row")
        await expect(rows).toHaveCount(E.universities.length)
        for (const [i, u] of E.universities.entries()) {
            const row = rows.nth(i)
            await expect(row).toHaveAttribute("data-code", u.code)
            await expect(row).toContainText(`n = ${group(u.n, ",")} of ${group(u.programs, ",")} programs`)
            if (u.mean === null) await expect(row).toContainText(en.analytics.statusNoData)
            else await expect(row).toContainText(`#${i + 1}`)
            await expect(row).not.toContainText(/\b(Good|Pass|Needs Improvement)\b/)
        }
        await expect(body).not.toContainText(FORBIDDEN_EN)
        await noHorizontalScroll(page)
    })

    test("JSON and CSV downloads carry the derived numbers and no verdict label", async ({ page }) => {
        await open(page, "vi")
        const download = async (name: string) => {
            // The page is prerendered: a click that lands before hydration starts no
            // download (seen once on Pixel 7), so click again until one starts.
            let d: Download | undefined
            await expect(async () => {
                ;[d] = await Promise.all([page.waitForEvent("download", { timeout: 3_000 }), page.getByRole("button", { name }).click()])
            }).toPass({ timeout: 20_000 })
            return { name: d!.suggestedFilename(), text: readFileSync(await d!.path(), "utf8") }
        }
        const file = `Tedo_Analytics_Benchmark_Dataset_${E.catalog.universities}_Universities`

        const json = await download(vi.analytics.exportJson)
        expect(json.name).toBe(`${file}.json`)
        expect(json.text).not.toMatch(FORBIDDEN_EXPORT)
        const j = JSON.parse(json.text)
        expect(j.basisRule).toMatch(/courseCount > 0/)
        expect(j.basisRule).toMatch(/insufficient/)
        expect(j.catalog).toEqual({
            totalPrograms: E.catalog.programs,
            totalCourses: E.catalog.courses,
            totalUniversities: E.catalog.universities,
            programsWithoutCourses: E.catalog.programsWithoutCourses,
        })
        expect(j.slmReference).toEqual({
            scoredPrograms: E.scoredPrograms,
            evaluatedPrograms: E.basis.programs,
            meanScore: E.basis.mean,
            shareAtLeast6: pct(E.basis.atLeast6),
            shareTopBand: pct(E.bands[0].count),
        })
        expect(j.universityRankings).toEqual(
            E.universities.map((u, i) => ({
                rank: u.mean === null ? null : i + 1,
                code: u.code,
                name: u.name,
                programs: u.programs,
                n: u.n,
                meanScore: u.mean,
            }))
        )
        expect(j.scoreDistributions).toEqual(E.bands.map((b) => ({ range: b.range, count: b.count, share: pct(b.count) })))

        const csv = await download(vi.analytics.exportCsv)
        expect(csv.name).toBe(`${file}.csv`)
        expect(csv.text).not.toMatch(FORBIDDEN_EXPORT)
        const lines = csv.text.replace(/^﻿/, "").split("\n")
        expect(lines[0]).toContain("(n)")
        expect(lines.slice(1)).toEqual(
            E.universities.map((u) => [u.code, `"${u.name}"`, u.programs, u.n, u.mean ?? ""].join(","))
        )
    })

    test("messages and sources: no verdict or accreditation label, no hand-written count, same placeholders", () => {
        for (const m of [vi, en]) {
            const a = JSON.stringify(m.analytics)
            expect(a).not.toMatch(/AUN-QA|Gold|Phạt gắt|Heavy penalty|Xuất sắc|Excellent/i)
            // Counts come from analytics-snapshot.json through ICU placeholders.
            expect(a).not.toMatch(/\d{3,}|\d[.,]\d{3}|\b17\b/)
            expect(m.programs.subtitle).not.toMatch(/\d{3,}|\d[.,]\d{3}|\b17\b/)
            for (const k of ["statusGood", "statusPass", "statusNeedsImprovement", "distGold", "distGood", "distPass", "distNeedsImprovement", "distPloPenalty"])
                expect(m.analytics[k], k).toBeUndefined()
            // The automatic score is not an AUN-QA assessment (v2.45 Someday, V4).
            expect(`${m.programs.evalTitle} ${m.programs.compareRadarTitle}`).not.toMatch(/AUN-QA/)
        }
        const args = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((x) => x[1]).sort()
        expect(Object.keys(en.analytics).sort()).toEqual(Object.keys(vi.analytics).sort())
        for (const k of Object.keys(vi.analytics)) expect(args(en.analytics[k]), k).toEqual(args(vi.analytics[k]))
        expect(args(vi.programs.subtitle)).toEqual(["programs", "universities"])
        expect(args(en.programs.subtitle)).toEqual(["programs", "universities"])

        // Nothing under src/ or app/ (UI, exports, chat context, metadata) carries the old labels.
        for (const dir of ["src", "app"]) {
            for (const f of readdirSync(path.join(ROOT, dir), { recursive: true }) as string[]) {
                if (!/\.(tsx?|json)$/.test(f)) continue
                expect(readFileSync(path.join(ROOT, dir, f), "utf8"), `${dir}/${f}`).not.toMatch(/AUN-QA Gold|Phạt gắt|Heavy penalty/)
            }
        }
    })
})
