import { test, expect, type Download, type Locator, type Page } from "@playwright/test"
import { existsSync, readFileSync } from "fs"
import path from "path"
import { retrieveChatContext } from "../src/lib/chat-retrieval"

/**
 * v2.57 — one enough-data rule for every score + honest analytics labels (audit 2026-10-30 V3).
 *
 * The rule (recomputed here from public/mock, not imported from the code under test): an SLM score is shown only
 * when the program carries one, has a course list (courseCount > 0) and is not dataSufficiency "insufficient" —
 * the analytics basis since v2.47. Every program failing it that still carries a number in the snapshot
 * (C = scored + course-less, B = scored + insufficient) shows, in the detail dialog's evaluation tab and in the
 * compare card, the not-enough-data text and no number (no "/ 10.0", no "/ 5.0" criterion, no radar):
 * C → analytics.statusNoData + programs.evalNoCoursesNote, B → programs.evalInsufficientBadge + evalInsufficientNote.
 * Desktop Chrome checks all of them; Pixel 7 a sample (+ one en dialog). Programs without any score keep their
 * text; an enough-data program still shows its score and radar. The chat context builder (src/lib/chat-retrieval.ts)
 * is called in this test process — no server, no /api/chat, no LLM.
 * Analytics: each score band's count = the basis programs whose score falls inside the band's printed label; the vi
 * page groups numbers the vi way ("1.956", "85,5%"), the en page the en way; no "**", no 🟢, no official-source
 * badge, no seal-like icon (lucide shield-check / award); the downloads are not named "Benchmark".
 * Messages come from src/messages and must exist. domcontentloaded, not networkidle (AGENTS.md §12).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const vi = readJson(path.join(ROOT, "src", "messages", "vi.json"))
const en = readJson(path.join(ROOT, "src", "messages", "en.json"))

type Prog = {
    id: string
    universityId: string
    universityName: string
    name: string
    courseCount: number
    evaluationScore?: number | null
    dataSufficiency?: string | null
}
const programs: Prog[] = (readJson(path.join(MOCK, "index.json")).chunks as string[]).flatMap((f) =>
    readJson(path.join(MOCK, "programs", f))
)
const codeOf = new Map<string, string>(
    readJson(path.join(MOCK, "universities.json")).map((u: { id: string; code: string }) => [u.id, u.code])
)
const scored = (p: Prog) => typeof p.evaluationScore === "number"
const enough = (p: Prog) => scored(p) && p.courseCount > 0 && p.dataSufficiency !== "insufficient"
const insufficient = (p: Prog) => p.dataSufficiency === "insufficient"
const byId = (a: Prog, b: Prog) => (a.id < b.id ? -1 : 1)
const C = programs.filter((p) => scored(p) && !insufficient(p) && !enough(p)).sort(byId)
const B = programs.filter((p) => scored(p) && insufficient(p)).sort(byId)
const HIDDEN = [...C, ...B].sort(byId) // every rule-failing program that carries a number in the snapshot
const B0 = programs.filter((p) => !scored(p) && insufficient(p)).sort(byId)
const NEVER = programs.filter((p) => !scored(p) && !insufficient(p)).sort(byId)
const ENOUGH = programs.filter(enough).sort(byId)
const basis = ENOUGH.map((p) => p.evaluationScore as number)

/** [badge or compare value, note in place of the radar] for a hidden score. */
const texts = (p: Prog, m: typeof vi = vi): [string, string] =>
    insufficient(p) ? [m.programs.evalInsufficientBadge, m.programs.evalInsufficientNote] : [m.analytics.statusNoData, m.programs.evalNoCoursesNote]
const NUMBER = /\/\s*10\.0|\/\s*5\.0|\(\d+(\.\d+)?\)/ // score badge, criterion card, radar axis label
const group = (n: number, sep: string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep)
const pct = (k: number) => `${((100 * k) / basis.length).toFixed(1)}%`
const pctVi = (k: number) => pct(k).replace(".", ",")
const DESKTOP = "Desktop Chrome"
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

/** Show `p` in the detail dialog — the first one by URL, then by rewriting ?program= (the dialog's own link
 *  mechanism: replace the entry, then a popstate the page's link store listens to) — and open its evaluation tab. */
async function evalPanel(page: Page, p: Prog, reload: boolean, locale: "vi" | "en" = "vi"): Promise<Locator> {
    if (reload) await page.goto(`/${locale}?program=${p.id}`, { waitUntil: "domcontentloaded" })
    else
        await page.evaluate((id) => {
            window.history.replaceState(null, "", `${window.location.pathname}?program=${id}`)
            window.dispatchEvent(new PopStateEvent("popstate"))
        }, p.id)
    const m = locale === "vi" ? vi : en
    const box = page.getByRole("dialog", { name: p.name, exact: true })
    await expect(box, p.id).toBeVisible({ timeout: 30_000 })
    const tab = box.getByRole("tab", { name: m.programs.evalTab, exact: true })
    if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click()
    const panel = box.getByRole("tabpanel")
    await expect(panel, p.id).toContainText(m.programs.evalTitle)
    return panel
}

async function expectHiddenInDialog(panel: Locator, p: Prog, m: typeof vi = vi) {
    const text = await panel.innerText()
    expect(text, `${p.id}: a number in the evaluation tab`).not.toMatch(NUMBER)
    expect(await panel.locator("#radarGradient").count(), `${p.id}: radar drawn`).toBe(0)
    for (const s of texts(p, m)) expect(text, `${p.id}: not-enough-data text`).toContain(s)
}

/** One page load, then switch program by program (reload again when a name repeats: the old dialog would match). */
async function expectHiddenInDialogs(page: Page, list: Prog[]) {
    let prev = ""
    for (const p of list) {
        await expectHiddenInDialog(await evalPanel(page, p, prev === "" || prev === p.name), p)
        prev = p.name
    }
}

/** The value next to a label (`<span>label</span><span>value</span>`). */
const valueOf = (scope: Locator, label: string) => scope.getByText(label, { exact: true }).locator("xpath=following-sibling::span[1]")

/** Compare up to 3 programs (padded with the first hidden ones) and check each hidden one's card. */
async function expectHiddenInCompare(page: Page, group3: Prog[]) {
    const slots = [...group3, ...HIDDEN].slice(0, 3)
    await page.goto(`/vi/compare?a=${slots[0].id}&b=${slots[1].id}&c=${slots[2].id}`, { waitUntil: "domcontentloaded" })
    for (const [i, p] of slots.entries()) {
        const card = page.getByTestId(`compare-card-${i + 1}`)
        await expect(card, p.id).toContainText(p.name, { timeout: 30_000 })
        const [value, note] = texts(p)
        const cell = valueOf(card, vi.programs.slmRefScore)
        await expect(cell, p.id).toHaveText(value)
        const radar = card.locator("div.border-t").filter({ hasText: vi.programs.compareRadarTitle })
        await expect(radar, p.id).toContainText(note)
        expect(`${await cell.innerText()} ${await radar.innerText()}`, `${p.id}: a number in the compare card`).not.toMatch(NUMBER)
        expect(await card.locator("#radarGradient").count(), `${p.id}: radar drawn`).toBe(0)
    }
}

async function openAnalytics(page: Page, locale: "vi" | "en") {
    await page.goto(`/${locale}/analytics`, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("score-band").first()).toBeVisible({ timeout: 30_000 })
    return page.locator("body")
}

test.describe("v2.57 — one enough-data rule + honest analytics labels", () => {
    test("fixtures: the snapshot has every kind of program the tests below need", () => {
        expect(C.length, "scored course-less programs").toBeGreaterThan(0)
        expect(B.length, "scored insufficient programs").toBeGreaterThan(0)
        expect(B0.length + NEVER.length, "programs without a score").toBeGreaterThan(0)
        expect(ENOUGH.length).toBeGreaterThan(0)
        expect(C.length + B.length + B0.length + NEVER.length + ENOUGH.length).toBe(programs.length)
    })

    test("messages used below exist (vi + en); quality notes carry no markdown or emoji; no official-source badge key", () => {
        for (const m of [vi, en]) {
            for (const k of ["evalNoCoursesNote", "evalInsufficientBadge", "evalInsufficientNote", "evalTab", "evalTitle", "evalEmpty", "slmRefScore", "compareRadarTitle", "compareNoEval"])
                expect(typeof m.programs[k] === "string" && m.programs[k].length > 0, `programs.${k}`).toBe(true)
            for (const k of ["statusNoData", "distProgramCount", "qualityNote1", "qualityNote2", "exportCsv", "exportJson"])
                expect(typeof m.analytics[k] === "string" && m.analytics[k].length > 0, `analytics.${k}`).toBe(true)
            for (const k of ["qualityNote1", "qualityNote2"]) expect(m.analytics[k], k).not.toMatch(/\*\*|🟢/)
            expect(m.analytics.officialDataBadge, "analytics.officialDataBadge").toBeUndefined()
        }
    })

    test("one rule: src/lib/score-basis.ts hasEnoughData = the rule recomputed here, on every program", async () => {
        const file = path.join(ROOT, "src", "lib", "score-basis.ts")
        expect(existsSync(file), "src/lib/score-basis.ts").toBe(true)
        const { hasEnoughData } = (await import(file)) as { hasEnoughData: (p: Prog) => boolean }
        expect(programs.filter((p) => hasEnoughData(p) !== enough(p)).map((p) => p.id)).toEqual([])
        expect(readJson(path.join(ROOT, "src", "lib", "analytics-snapshot.json")).basis.programs).toBe(ENOUGH.length)
    })

    for (const [i, part] of chunks(HIDDEN, 100).entries()) {
        test(`dialog: rule-failing programs ${i * 100 + 1}–${i * 100 + part.length} of ${HIDDEN.length} show the not-enough-data text, no number`, async ({ page }, info) => {
            test.skip(info.project.name !== DESKTOP, "all of them on Desktop Chrome; a sample on this project")
            test.setTimeout(300_000)
            await expectHiddenInDialogs(page, part)
        })
    }

    for (const [i, part] of chunks(HIDDEN, 102).entries()) {
        test(`compare: rule-failing programs ${i * 102 + 1}–${i * 102 + part.length} of ${HIDDEN.length} show the not-enough-data text, no number`, async ({ page }, info) => {
            test.skip(info.project.name !== DESKTOP, "all of them on Desktop Chrome; a sample on this project")
            test.setTimeout(300_000)
            for (const g of chunks(part, 3)) await expectHiddenInCompare(page, g)
        })
    }

    test("sample: dialog (vi + one en) and compare hide the rule-failing scores", async ({ page }) => {
        test.setTimeout(120_000)
        const sample = [C[0], B[0], C[C.length - 1], B[B.length - 1]]
        await expectHiddenInDialogs(page, sample)
        await expectHiddenInDialog(await evalPanel(page, C[0], true, "en"), C[0], en)
        await expectHiddenInCompare(page, [C[0], B[0], C[C.length - 1]])
    })

    test("unchanged: no score → Base text; enough data → score and radar", async ({ page }) => {
        test.setTimeout(120_000)
        for (const p of [B0[0], NEVER[0]].filter(Boolean)) {
            const panel = await evalPanel(page, p, true)
            await expect(panel).toContainText(vi.programs.evalEmpty)
            if (insufficient(p)) await expect(panel).toContainText(vi.programs.evalInsufficientBadge)
            expect(await panel.innerText()).not.toMatch(NUMBER)
        }
        const ok = ENOUGH[0]
        const panel = await evalPanel(page, ok, true)
        await expect(panel).toContainText(`${vi.programs.slmRefScore}: ${(ok.evaluationScore as number).toFixed(1)} / 10.0`)
        await expect(panel.locator("#radarGradient")).toHaveCount(1)
        await page.goto(`/vi/compare?a=${ok.id}&b=${C[0].id}`, { waitUntil: "domcontentloaded" })
        const card = page.getByTestId("compare-card-1")
        await expect(card).toContainText(ok.name, { timeout: 30_000 })
        await expect(valueOf(card, vi.programs.slmRefScore)).toHaveText(`${(ok.evaluationScore as number).toFixed(1)} / 10.0`)
        await expect(card.locator("#radarGradient")).toHaveCount(1)
    })

    test("chat context (built in this process, no request): a course-less program carries no score", async () => {
        expect(existsSync(path.join(process.cwd(), "public", "mock", "index.json")), "run from fe/ (the builder reads ./public/mock)").toBe(true)
        let hit: { p: Prog; context: string } | null = null
        for (const p of C) {
            const r = await retrieveChatContext(`${p.name} ${codeOf.get(p.universityId)}`)
            if (r.matchedProgramIds.includes(p.id)) {
                hit = { p, context: r.context }
                break
            }
        }
        expect(hit, "a course-less scored program retrieved by its own name + university code").not.toBeNull()
        const { p, context } = hit!
        const line = context.split("\n").find((l) => l.startsWith(`- Chương trình "${p.name}" (${p.universityName})`))
        expect(line, p.id).toBeDefined()
        expect(line, p.id).not.toContain("Điểm SLM tham khảo")
        expect(line, p.id).toContain("chưa đủ dữ liệu")
        expect(context).not.toContain(`chưa hiệu chuẩn chuyên gia): ${p.evaluationScore}`)
        // Control: an enough-data program keeps its score in the context.
        for (const q of ENOUGH) {
            const r = await retrieveChatContext(`${q.name} ${codeOf.get(q.universityId)}`)
            if (!r.matchedProgramIds.includes(q.id)) continue
            expect(r.context).toContain(`chưa hiệu chuẩn chuyên gia): ${q.evaluationScore}`)
            return
        }
        throw new Error("no enough-data program retrieved by its own name + university code")
    })

    test("bands: each count = the basis programs whose score falls inside its printed label (snapshot + vi page)", async ({ page }) => {
        const inLabel = (label: string) => {
            const [lo, hi] = label.split(" - ").map(Number)
            expect(Number.isFinite(lo) && Number.isFinite(hi), `label "${label}"`).toBe(true)
            return basis.filter((s) => s >= lo && s <= hi).length
        }
        const snap = readJson(path.join(ROOT, "src", "lib", "analytics-snapshot.json")) as { bands: { range: string; count: number }[] }
        for (const b of snap.bands) expect(b.count, `snapshot band "${b.range}"`).toBe(inLabel(b.range))
        expect(snap.bands.reduce((s, b) => s + b.count, 0)).toBe(basis.length)

        await openAnalytics(page, "vi")
        const bands = page.getByTestId("score-band")
        await expect(bands).toHaveCount(snap.bands.length)
        for (let i = 0; i < snap.bands.length; i++) {
            const label = (await bands.nth(i).locator("p").first().innerText()).trim()
            await expect(bands.nth(i), label).toContainText(vi.analytics.distProgramCount.replace("{count}", String(inLabel(label))))
        }
    })

    test("vi analytics: vi grouping and decimals only, no markdown, no official badge, no seal icon", async ({ page }) => {
        const snap = readJson(path.join(ROOT, "src", "lib", "analytics-snapshot.json"))
        const body = await openAnalytics(page, "vi")
        const text = await body.innerText()
        expect(text.match(/\d,\d{3}(?!\d)/g), "en-US grouping on the vi page").toBeNull()
        expect(text.match(/\d\.\d%/g), "en decimal in a vi percentage").toBeNull()
        await expect(page.getByText(group(snap.catalog.programs, "."), { exact: true })).toBeVisible()
        await expect(page.getByText(group(snap.catalog.courses, "."), { exact: true })).toBeVisible()
        const pass = basis.filter((s) => s >= 6).length
        expect(text).toContain(`${pctVi(pass)} (${group(pass, ".")} ngành)`)
        for (const s of ["**", "🟢"]) expect(text).not.toContain(s)
        for (const k of ["qualityNote1", "qualityNote2"]) expect(text).toContain(vi.analytics[k])
        expect(text).not.toMatch(/nguồn công bố chính thức/i)
        await expect(page.locator("svg.lucide-shield-check, svg.lucide-award")).toHaveCount(0)
    })

    test("en analytics: en grouping and decimals, no markdown, no official badge, no seal icon", async ({ page }) => {
        const snap = readJson(path.join(ROOT, "src", "lib", "analytics-snapshot.json"))
        const body = await openAnalytics(page, "en")
        const text = await body.innerText()
        await expect(page.getByText(group(snap.catalog.programs, ","), { exact: true })).toBeVisible()
        const pass = basis.filter((s) => s >= 6).length
        expect(text).toContain(`${pct(pass)} (${group(pass, ",")} programs)`)
        for (const s of ["**", "🟢"]) expect(text).not.toContain(s)
        expect(text).not.toMatch(/official published sources/i)
        await expect(page.locator("svg.lucide-shield-check, svg.lucide-award")).toHaveCount(0)
    })

    test("downloads: CSV and JSON are not named 'Benchmark'", async ({ page }) => {
        const snap = readJson(path.join(ROOT, "src", "lib", "analytics-snapshot.json"))
        await openAnalytics(page, "vi")
        const download = async (name: string) => {
            // The page is prerendered: a click before hydration starts no download, so click until one starts.
            let d: Download | undefined
            await expect(async () => {
                ;[d] = await Promise.all([page.waitForEvent("download", { timeout: 3_000 }), page.getByRole("button", { name }).click()])
            }).toPass({ timeout: 20_000 })
            return d!.suggestedFilename()
        }
        const file = `Tedo_Analytics_Dataset_${snap.catalog.universities}_Universities`
        expect(await download(vi.analytics.exportCsv)).toBe(`${file}.csv`)
        expect(await download(vi.analytics.exportJson)).toBe(`${file}.json`)
    })
})
