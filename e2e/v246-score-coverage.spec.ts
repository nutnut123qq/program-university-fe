import { test, expect, Page } from "@playwright/test"
import { existsSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.46 — the score filter states its coverage (audit V3, gap G6).
 *
 * The filter can only test programs that have a program-level cutoff; FPT,
 * DTU and others publish only school/group thresholds (`programId: null`
 * rows), so their programs never show up. Now:
 * - a coverage line "N / M ngành có điểm chuẩn theo ngành ở thang S" (M =
 *   programs in the current list the eligibility rule can test) and how many
 *   other programs are not considered;
 * - a block listing the school/group thresholds at the selected scale (newest
 *   year per university × method, equal rows merged), information only;
 * - those thresholds never make a program eligible;
 * - (cold-check r1) a merged entry keeps each combo note under the scope label
 *   it came from, and the method-picked branch of the coverage line is tested.
 *
 * Every expected value is computed from public/mock at test time with the
 * filter's own rule (program-scope cutoff rows with a programId at the scale;
 * a program qualifies on its newest year there at the lowest score of that
 * year). The only named fixture is the audit's acceptance case (FPT 21/30
 * học bạ from daihoc.fpt.edu.vn); the fixtures test asserts it exists first.
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const vi = readJson(path.join(ROOT, "src", "messages", "vi.json"))
const en = readJson(path.join(ROOT, "src", "messages", "en.json"))

type Score = {
    programId: string | null
    year: number
    method: string | null
    methodLabel: string | null
    scope: string
    scopeLabel: string | null
    score: number
    scale: number
    kind: string
    comboNote: string | null
    sourceUrl: string | null
}
type MockProgram = { id: string; name: string; universityId: string; universityName: string }
type Uni = { id: string; code: string; name: string }

const index = readJson(path.join(MOCK, "index.json"))
const programs: MockProgram[] = (index.chunks as string[]).flatMap((f) => readJson(path.join(MOCK, "programs", f)))
const universities: Uni[] = readJson(path.join(MOCK, "universities.json"))
const scoresByUni = new Map<string, Score[]>(
    universities.map((u) => {
        const file = path.join(MOCK, "admissions", `${u.code}.json`)
        return [u.code, existsSync(file) ? (readJson(file).scores ?? []) : []]
    })
)

const SCALE = 30
const SCORE = 25

// Qualifying cutoff per program at a scale (only `method`'s rows when given).
function qualifyingAt(scale: number, method?: string) {
    const byPid = new Map<string, Score[]>()
    for (const rows of scoresByUni.values()) {
        for (const s of rows) {
            if (s.scope !== "program" || s.kind !== "cutoff" || !s.programId) continue
            if (typeof s.score !== "number" || s.scale !== scale) continue
            if (method && s.method !== method) continue
            byPid.set(s.programId, [...(byPid.get(s.programId) ?? []), s])
        }
    }
    const q = new Map<string, number>()
    for (const [pid, rows] of byPid) {
        const newest = Math.max(...rows.map((r) => r.year))
        q.set(pid, Math.min(...rows.filter((r) => r.year === newest).map((r) => r.score)))
    }
    return {
        q,
        covered: programs.filter((p) => q.has(p.id)).length,
        eligible: programs.filter((p) => (q.get(p.id) ?? Infinity) <= SCORE).length,
    }
}
const { q: qualifying, covered, eligible } = qualifyingAt(SCALE)

// A method the UI lists at SCALE that can be picked by name: the option label
// comes from whichever university's file loads first, so only a method whose
// rows all carry one label, used by no other method, is deterministic. Prefer
// one where N < M (sharper check), then the one covering the most programs.
const methodLabels = new Map<string, Set<string>>()
for (const rows of scoresByUni.values()) {
    for (const s of rows) {
        if (s.scope !== "program" || s.kind !== "cutoff" || s.scale !== SCALE || !s.method) continue
        methodLabels.set(s.method, (methodLabels.get(s.method) ?? new Set()).add((s.methodLabel ?? s.method).trim()))
    }
}
const pickedMethod = [...methodLabels]
    .filter(([m, labels]) => labels.size === 1 && [...labels][0] !== "" &&
        ![...methodLabels].some(([o, ol]) => o !== m && ol.has([...labels][0])))
    .map(([m, labels]) => ({ method: m, label: [...labels][0], ...qualifyingAt(SCALE, m) }))
    .sort((a, b) => Number(b.eligible < b.covered) - Number(a.eligible < a.covered) || b.covered - a.covered)[0]

// School/group threshold entries of one university at a scale: newest year
// per method code, rows equal in (method, year, kind, scope, score) merged;
// each scope label keeps only the combo notes of its own rows.
type Scope = { label: string | null; notes: string[] }
type Entry = { method: string; year: number; kind: string; scope: string; score: number; scopes: Scope[]; sources: string[]; methodLabel: string | null }
function thresholdsOf(code: string, scale: number): Entry[] {
    const rows = (scoresByUni.get(code) ?? []).filter(
        (s) => s.programId == null && s.scope !== "program" && typeof s.score === "number" && s.scale === scale
    )
    const newest = new Map<string, number>()
    for (const s of rows) newest.set(s.method ?? "", Math.max(newest.get(s.method ?? "") ?? -Infinity, s.year))
    const entries = new Map<string, Entry>()
    for (const s of rows) {
        const method = s.method ?? ""
        if (s.year !== newest.get(method)) continue
        const key = [method, s.year, s.kind, s.scope, s.score].join("|")
        const e = entries.get(key) ?? { method, year: s.year, kind: s.kind, scope: s.scope, score: s.score, scopes: [], sources: [], methodLabel: s.methodLabel }
        const label = s.scopeLabel || null
        const sc = e.scopes.find((x) => x.label === label) ?? (e.scopes.push({ label, notes: [] }), e.scopes[e.scopes.length - 1])
        if (s.comboNote && !sc.notes.includes(s.comboNote)) sc.notes.push(s.comboNote)
        if (s.sourceUrl && !e.sources.includes(s.sourceUrl)) e.sources.push(s.sourceUrl)
        entries.set(key, e)
    }
    return [...entries.values()]
}
// Notes of the entry's other scope labels that must not show under `sc`
// (skipping any that are already part of sc's own label or notes).
const foreignNotes = (e: Entry, sc: Scope) => {
    const own = [sc.label ?? "", ...sc.notes].join("\n")
    return e.scopes.flatMap((o) => (o === sc ? [] : o.notes)).filter((n) => !own.includes(n))
}
const inCatalog = (u: Uni) => programs.filter((p) => p.universityId === u.id)
const thresholdUnis = universities.filter((u) => thresholdsOf(u.code, SCALE).length > 0 && inCatalog(u).length > 0)
// Universities whose programs could only "pass" through a school/group
// threshold: thresholds <= SCORE at SCALE, no program-level cutoff there.
const thresholdOnly = thresholdUnis.filter(
    (u) =>
        !inCatalog(u).some((p) => qualifying.has(p.id)) &&
        thresholdsOf(u.code, SCALE).some((e) => e.score <= SCORE)
)
const FPT = universities.find((u) => u.code === "FPT")!
const fptHocba = FPT && thresholdsOf("FPT", SCALE).find((e) => e.score === 21 && /học bạ/i.test(e.methodLabel ?? ""))
// Merged entries whose scope labels carry different combo notes.
const noteConflicts = thresholdUnis.flatMap((u) =>
    thresholdsOf(u.code, SCALE).flatMap((e) => e.scopes.flatMap((sc) => foreignNotes(e, sc).map((note) => ({ uni: u.code, label: sc.label, note }))))
)
const entrySelector = (e: Entry) =>
    `[data-testid="score-threshold-entry"][data-method="${e.method}"][data-year="${e.year}"][data-kind="${e.kind}"][data-score="${e.score}"][data-scope="${e.scope}"]`

const cards = (page: Page) => page.getByTestId("program-card")

async function applyScoreFilter(page: Page, score: string) {
    await page.goto("/vi", { waitUntil: "domcontentloaded" })
    // Cards rendered = hydrated + first chunk loaded.
    await expect(page.getByRole("button", { name: /Xem chi tiết/i }).first()).toBeVisible({ timeout: 30000 })
    await page.getByTestId("score-filter-input").fill(score)
    const filter = page.getByTestId("score-filter")
    await filter.getByRole("combobox", { name: /Thang điểm|Scale/i }).click()
    await page.getByRole("option", { name: String(SCALE), exact: true }).click()
    await expect(page.getByTestId("score-filter-result")).toBeVisible({ timeout: 60000 })
}

const resultText = (count: number, score: string) =>
    vi.programs.scoreFilterResult.replace("{count}", String(count)).replace("{score}", score)

test.describe("v2.46 — score filter states its coverage (/vi)", () => {
    test("fixtures from the mock", () => {
        expect(covered).toBeGreaterThan(0)
        expect(covered).toBeLessThan(programs.length)
        expect(eligible).toBeGreaterThan(0)
        expect(eligible).toBeLessThanOrEqual(covered)
        // The audit's acceptance fixture exists in the snapshot.
        expect(fptHocba, "FPT 21/30 học bạ row missing from the mock").toBeTruthy()
        expect(fptHocba!.sources.some((u) => new URL(u).hostname === "daihoc.fpt.edu.vn")).toBe(true)
        expect(fptHocba!.scopes.length).toBeGreaterThan(1)
        expect(thresholdUnis.map((u) => u.code)).toContain("FPT")
        expect(thresholdOnly.length).toBeGreaterThan(0)
        // At least one merged entry mixes scope labels with different notes.
        expect(noteConflicts.length).toBeGreaterThan(0)
        // A pickable method that covers fewer programs than "all methods".
        expect(pickedMethod, "no method with a unique label at the scale").toBeTruthy()
        expect(pickedMethod.covered).toBeGreaterThan(0)
        expect(pickedMethod.covered).toBeLessThan(covered)
        expect(pickedMethod.eligible).toBeLessThanOrEqual(pickedMethod.covered)
    })

    test(`${SCORE}/${SCALE}: result line unchanged, coverage line states N / M at the scale`, async ({ page }) => {
        await applyScoreFilter(page, String(SCORE))
        await expect(page.getByTestId("score-filter-result")).toHaveText(resultText(eligible, String(SCORE)))
        const coverage = page.getByTestId("score-filter-coverage")
        await expect(coverage).toBeVisible({ timeout: 30000 })
        await expect(coverage).toContainText(`${eligible} / ${covered} ngành có điểm chuẩn theo ngành ở thang ${SCALE}`)
        await expect(coverage).toContainText(`${programs.length - covered} ngành khác`)
    })

    test(`${SCORE}/${SCALE} with a method picked: coverage counts that method only`, async ({ page }) => {
        await applyScoreFilter(page, String(SCORE))
        await page.getByTestId("score-filter").getByRole("combobox", { name: /Tất cả phương thức|All methods/i }).click()
        await page.getByRole("option", { name: pickedMethod.label, exact: true }).click()
        await expect(page.getByTestId("score-filter-result")).toHaveText(
            resultText(pickedMethod.eligible, String(SCORE)),
            { timeout: 30000 }
        )
        const coverage = page.getByTestId("score-filter-coverage")
        await expect(coverage).toContainText(
            `${pickedMethod.eligible} / ${pickedMethod.covered} ngành có điểm chuẩn theo ngành ở thang ${SCALE} theo phương thức đã chọn`
        )
        await expect(coverage).toContainText(`${programs.length - pickedMethod.covered} ngành khác`)
    })

    test("school/group thresholds: listed per university, FPT shows 21/30 học bạ with its source", async ({ page }) => {
        await applyScoreFilter(page, String(SCORE))
        const block = page.getByTestId("score-thresholds")
        await expect(block).toBeVisible({ timeout: 30000 })
        await expect(block).toContainText(`thang ${SCALE}`)
        const unis = block.getByTestId("score-thresholds-uni")
        await expect(unis).toHaveCount(thresholdUnis.length)
        for (const u of thresholdUnis) {
            const item = block.locator(`[data-testid="score-thresholds-uni"][data-university="${u.code}"]`)
            await expect(item).toHaveCount(1)
            await expect(item.locator("summary")).toContainText(u.name)
            await expect(item.getByTestId("score-threshold-entry")).toHaveCount(thresholdsOf(u.code, SCALE).length)
        }

        const fpt = block.locator('[data-testid="score-thresholds-uni"][data-university="FPT"]')
        await fpt.locator("summary").click()
        const entry = fpt.locator(
            `[data-testid="score-threshold-entry"][data-method="${fptHocba!.method}"][data-year="${fptHocba!.year}"][data-score="21"][data-kind="${fptHocba!.kind}"]`
        )
        await expect(entry).toHaveCount(1)
        await expect(entry).toBeVisible()
        await expect(entry).toContainText(`21/${SCALE}`)
        await expect(entry).toContainText(String(fptHocba!.year))
        await expect(entry).toContainText(/học bạ/i)
        await expect(entry.getByTestId("score-threshold-kind")).toHaveText(vi.programs.admissionKindCutoff)
        // Equal rows are one entry carrying every scope label.
        await expect(entry.getByTestId("score-threshold-scope")).toHaveCount(fptHocba!.scopes.length)
        for (const sc of fptHocba!.scopes) if (sc.label) await expect(entry).toContainText(sc.label)
        const link = entry.getByRole("link", { name: /daihoc\.fpt\.edu\.vn/ })
        await expect(link.first()).toHaveAttribute("href", /^https:\/\/daihoc\.fpt\.edu\.vn\//)
        await expect(link.first()).toHaveAttribute("target", "_blank")
        await expect(link.first()).toHaveAttribute("rel", /noopener/)
        await expect(link.first()).toHaveAttribute("rel", /noreferrer/)

        // A floor is labelled as a floor, never as a cutoff.
        const floors = fpt.locator('[data-testid="score-threshold-entry"][data-kind="floor"]')
        await expect(floors).toHaveCount(thresholdsOf("FPT", SCALE).filter((e) => e.kind === "floor").length)
        for (const kind of await floors.getByTestId("score-threshold-kind").allTextContents()) {
            expect(kind).toBe(vi.programs.admissionKindFloor)
        }

        // Every university open at once: still no horizontal page scroll
        // (Pixel 7 project = phone width).
        for (const u of thresholdUnis.filter((x) => x.code !== "FPT")) {
            await block.locator(`[data-testid="score-thresholds-uni"][data-university="${u.code}"] summary`).click()
        }
        await expect(block.getByTestId("score-threshold-entry").last()).toBeVisible()
        const overflow = await page.evaluate(
            () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth
        )
        expect(overflow).toBeLessThanOrEqual(0)
    })

    test("combo notes stay with the scope label they came from", async ({ page }) => {
        await applyScoreFilter(page, String(SCORE))
        const block = page.getByTestId("score-thresholds")
        await expect(block).toBeVisible({ timeout: 30000 })
        let foreignChecked = 0
        for (const u of thresholdUnis) {
            const uni = block.locator(`[data-testid="score-thresholds-uni"][data-university="${u.code}"]`)
            await uni.locator("summary").click()
            for (const e of thresholdsOf(u.code, SCALE)) {
                const entry = uni.locator(entrySelector(e))
                await expect(entry).toHaveCount(1)
                const scopes = entry.getByTestId("score-threshold-scope")
                await expect(scopes).toHaveCount(e.scopes.length)
                for (const [i, sc] of e.scopes.entries()) {
                    if (sc.label) await expect(scopes.nth(i)).toContainText(sc.label)
                    for (const n of sc.notes) await expect(scopes.nth(i)).toContainText(n)
                    for (const n of foreignNotes(e, sc)) {
                        await expect(scopes.nth(i)).not.toContainText(n)
                        foreignChecked++
                    }
                }
            }
        }
        expect(foreignChecked).toBe(noteConflicts.length)
    })

    test("thresholds never make a program eligible", async ({ page }) => {
        await applyScoreFilter(page, String(SCORE))
        await expect(cards(page)).toHaveCount(eligible, { timeout: 30000 })
        for (const u of thresholdOnly) await expect(cards(page).filter({ hasText: u.name })).toHaveCount(0)

        // Catalog limited to one threshold-only university, highest score:
        // nothing passes and the coverage line says 0 / 0.
        for (const u of thresholdOnly) {
            await page.getByRole("combobox", { name: vi.programs.allUniversities }).click()
            await page.getByRole("option", { name: u.name, exact: true }).click()
            await page.getByTestId("score-filter-input").fill(String(SCALE))
            await expect(page.getByTestId("score-filter-result")).toHaveText(resultText(0, String(SCALE)), { timeout: 60000 })
            await expect(page.getByTestId("score-filter-empty")).toBeVisible({ timeout: 30000 })
            await expect(cards(page)).toHaveCount(0)
            await expect(page.getByTestId("score-filter-coverage")).toContainText(
                `0 / 0 ngành có điểm chuẩn theo ngành ở thang ${SCALE}`
            )
            await expect(page.getByTestId("score-filter-coverage")).toContainText(`${inCatalog(u).length} ngành khác`)
            const unis = page.getByTestId("score-thresholds-uni")
            await expect(unis).toHaveCount(1)
            await expect(unis).toHaveAttribute("data-university", u.code)
        }
    })

    test("no admissions data: no coverage line, no threshold block, no crash", async ({ page }) => {
        await page.route("**/mock/admissions/*.json", (route) => route.fulfill({ status: 404, body: "" }))
        await page.goto("/vi", { waitUntil: "domcontentloaded" })
        await expect(page.getByRole("button", { name: /Xem chi tiết/i }).first()).toBeVisible({ timeout: 30000 })
        await page.getByTestId("score-filter-input").fill(String(SCORE))
        await expect(page.getByTestId("score-filter-no-data")).toBeVisible({ timeout: 20000 })
        await expect(page.getByTestId("score-filter-coverage")).toHaveCount(0)
        await expect(page.getByTestId("score-thresholds")).toHaveCount(0)
        await expect(cards(page).first()).toBeVisible()
    })

    test("messages: vi + en carry the coverage and threshold copy with the same placeholders", () => {
        const keys = ["scoreFilterCoverage", "scoreThresholdsTitle", "scoreThresholdsNote", "scoreThresholdsCount"]
        const placeholders = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort()
        for (const k of keys) {
            expect(typeof vi.programs[k], `vi.programs.${k}`).toBe("string")
            expect(typeof en.programs[k], `en.programs.${k}`).toBe("string")
            expect(placeholders(en.programs[k])).toEqual(placeholders(vi.programs[k]))
        }
        // Nothing in the copy tells the student they pass.
        for (const m of [vi, en]) {
            expect(`${m.programs.scoreFilterCoverage} ${m.programs.scoreThresholdsNote}`).not.toMatch(/bạn đỗ|đủ điều kiện|you pass|eligible/i)
        }
    })
})
