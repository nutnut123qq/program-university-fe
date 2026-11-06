import { test, expect, Page, Locator } from "@playwright/test"
import { readdirSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.67 — quota by method and knowledge-block shares print honestly (audit 2026-11-05 M1, M14 / A3).
 * (1) A quota's `methodSplit` printed every entry as "key: value%" in the program dialog and in compare: method
 * descriptions, program codes ("ma_nganh: 7540102%"), combo arrays and URLs, nested objects ("[object Object]%"), a whole
 * string split per character ("0: P%"), fractions as percents ("0.05%") and seat counts as percents ("1306%"). Now an
 * entry is printed only when it is a provable share of the quota: the row has two or more numeric entries whose sum is
 * 1 (fractions), 100 (percents) or the row's quota (seat counts); it prints as "<key>: <share>%" in the page locale.
 * (2) The knowledge-block chart divided each block's credits by the program's total credits, which the listed courses can
 * exceed (UIT "Khoa học Máy tính": "Chuyên ngành 161%"), and counted courses without a block as Chuyên ngành. Now the
 * shares are of the credits of the listed courses that record a block (each ≤ 100 %, summing to 100 % ± rounding), the
 * chart states that basis, and courses without a block are counted apart on their own line — with their credit total only
 * when every one of them has known credits (FIX r1: unknown credits are never printed as 0), else the count alone.
 * Programs are chosen at test time from public/mock (one per shape of the data); every expectation is computed here from
 * public/mock and src/messages, never from the code under test; message keys are checked inside the test that uses them.
 * The dialog is opened by its ?program= link; domcontentloaded, not networkidle (AGENTS.md §12).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const memo = new Map<string, unknown>()
const readJson = <T = unknown>(file: string): T => {
    if (!memo.has(file)) memo.set(file, JSON.parse(readFileSync(file, "utf8")))
    return memo.get(file) as T
}
const vi = () => readJson<{ programs: Record<string, unknown> }>(path.join(ROOT, "src", "messages", "vi.json")).programs
/** A `programs` message — asserted to exist (inside the calling test body). */
const msg = (key: string): string => {
    const v = vi()[key]
    expect(typeof v === "string" && v.length > 0, `message programs.${key}`).toBe(true)
    return v as string
}
const NUM = new Intl.NumberFormat("vi", { maximumFractionDigits: 2 })
/** A message with its {placeholders} filled the way ICU prints a plain number argument: String(n), no grouping (intl-messageformat). */
const fill = (s: string, vars: Record<string, number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k]))
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/** A message as a regex whose {placeholders} capture an integer. */
const pattern = (s: string) => new RegExp("^" + escape(s).replace(/\\\{(\w+)\\\}/g, "(\\d+)") + "$")
const int = (s: string) => Number(s)

type Program = { id: string; name: string; universityId: string; credits: number | null }
type Quota = { programId: string | null; scope: string; year: number; quota: number | null; methodSplit: unknown }
type Course = { knowledgeBlock?: string | null; credits: number | null }

const programs = (): Program[] =>
    readdirSync(path.join(MOCK, "programs-by-id")).filter((f) => f.endsWith(".json")).sort()
        .map((f) => readJson<Program>(path.join(MOCK, "programs-by-id", f)))
const uniCode = (p: Program) =>
    readJson<{ id: string; code: string }[]>(path.join(MOCK, "universities.json")).find((u) => u.id === p.universityId)?.code
const quotasOf = (code: string): Quota[] => {
    try {
        return readJson<{ quotas: Quota[] }>(path.join(MOCK, "admissions", `${code}.json`)).quotas ?? []
    } catch {
        return []
    }
}
/** The quota rows the dialog and compare show for a program: its own rows + the context rows (programId null, scope ≠ program). */
const shownQuotas = (p: Program) => {
    const code = uniCode(p)
    return code ? quotasOf(code).filter((q) => q.programId === p.id || (q.programId === null && q.scope !== "program")) : []
}

/** The contract: the printed entries of one quota row, "<key>: <share, vi digits, ≤ 2 decimals>%". */
function shares(q: Quota): string[] {
    const ms = q.methodSplit
    if (ms === null || typeof ms !== "object" || Array.isArray(ms)) return []
    const nums = Object.entries(ms as Record<string, unknown>).filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v >= 0) as [string, number][]
    if (nums.length < 2) return []
    const sum = nums.reduce((a, [, v]) => a + v, 0)
    const whole = Math.abs(sum - 1) <= 0.01 ? 1 : Math.abs(sum - 100) <= 1 ? 100 : q.quota && q.quota > 0 && sum === q.quota ? q.quota : null
    return whole === null ? [] : nums.map(([k, v]) => `${k}: ${NUM.format((v / whole) * 100)}%`)
}
const values = (q: Quota) => (q.methodSplit && typeof q.methodSplit === "object" ? Object.values(q.methodSplit as object) : [])
const numericSum = (q: Quota) => values(q).reduce((a: number, v) => (typeof v === "number" ? a + v : a), 0)
/** The shapes measured in public/mock (round102 S2_methodsplit_base.log): nothing printable, or a provable share. */
const BROKEN: Record<string, (q: Quota) => boolean> = {
    "whole string (one entry per character)": (q) => typeof q.methodSplit === "string" && q.methodSplit.length > 0,
    "nested object": (q) => values(q).some((v) => v !== null && typeof v === "object" && !Array.isArray(v)),
    "array (combos, URLs)": (q) => values(q).some((v) => Array.isArray(v)),
    "numeric code string": (q) => values(q).some((v) => typeof v === "string" && /^\d+$/.test(v.trim())),
    "text": (q) => shares(q).length === 0 && values(q).some((v) => typeof v === "string" && !/^\d+$/.test(v.trim())),
    "lone number, not a share": (q) => shares(q).length === 0 && values(q).filter((v) => typeof v === "number").length === 1,
}
const PROVABLE: Record<string, (q: Quota) => boolean> = {
    "seat counts": (q) => shares(q).length > 0 && numericSum(q) === q.quota && q.quota !== 100,
    "fractions": (q) => shares(q).length > 0 && Math.abs(numericSum(q) - 1) <= 0.01,
}
/** The first program (by id) whose shown rows hold each shape; one program may cover several shapes. */
function pick(shapes: Record<string, (q: Quota) => boolean>) {
    const picked = new Map<string, { p: Program; shapes: string[] }>()
    for (const [name, is] of Object.entries(shapes)) {
        const p = programs().find((x) => shownQuotas(x).some(is))
        if (!p) continue
        const e = picked.get(p.id) ?? { p, shapes: [] }
        e.shapes.push(name)
        picked.set(p.id, e)
    }
    return [...picked.values()]
}
const expectedOf = (p: Program) => shownQuotas(p).flatMap(shares).sort()

/** Every "…%" entry printed in a quota section (each split line is one <p>, entries joined by " · "). */
async function printedEntries(section: Locator) {
    const lines = await section.locator("p").allTextContents()
    return lines.filter((l) => l.includes("%")).flatMap((l) => l.split(" · ").map((x) => x.trim())).sort()
}
const dialogNamed = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
async function openDialogTab(page: Page, p: Program, tab: string) {
    await page.goto(`/vi?program=${p.id}`, { waitUntil: "domcontentloaded" })
    const box = dialogNamed(page, p.name)
    await expect(box).toBeVisible({ timeout: 30000 })
    await box.getByRole("tab", { name: tab, exact: true }).click()
    return box
}
async function dialogQuotaEntries(page: Page, p: Program) {
    const box = await openDialogTab(page, p, msg("admissionsTab"))
    const heading = box.getByTestId("admissions-section").getByRole("heading", { name: msg("admissionQuotasTitle"), exact: true })
    await expect(heading).toBeVisible({ timeout: 30000 })
    return printedEntries(heading.locator("xpath=.."))
}

test.describe("v2.67 — quota method splits print only shares of the quota", () => {
    test("dialog: a split with no provable share prints no '…%' entry (whole string, nested object, array, code, text, lone number)", async ({ page }) => {
        // Each dialog's printed entries must be exactly the contract's (the provable shares of its rows, often none).
        test.setTimeout(300000)
        const picked = pick(BROKEN)
        expect(picked.length, "programs showing a split with no provable share").toBeGreaterThan(0)
        const wrong: string[] = []
        for (const { p, shapes } of picked) {
            const expected = expectedOf(p)
            const shown = await dialogQuotaEntries(page, p)
            if (JSON.stringify(shown) !== JSON.stringify(expected))
                wrong.push(`${uniCode(p)} ${p.id.slice(0, 8)} [${shapes.join(", ")}]: shown ${JSON.stringify(shown.slice(0, 4))}${shown.length > 4 ? ` +${shown.length - 4}` : ""}, expected ${JSON.stringify(expected)}`)
        }
        expect(wrong, wrong.join("\n")).toEqual([])
    })

    test("dialog: fractions and seat counts print as shares of the quota", async ({ page }) => {
        test.setTimeout(300000)
        const picked = pick(PROVABLE)
        expect(picked.length, "programs showing a provable split").toBeGreaterThan(0)
        for (const { p, shapes } of picked) {
            const expected = expectedOf(p)
            expect(expected.length, `${p.id} expects shares`).toBeGreaterThan(0)
            const shown = await dialogQuotaEntries(page, p)
            expect(shown, `${uniCode(p)} ${p.id.slice(0, 8)} [${shapes.join(", ")}]`).toEqual(expected)
        }
    })

    test("compare: the same rule in every slot", async ({ page }) => {
        test.setTimeout(300000)
        const slots = [...pick(PROVABLE), ...pick(BROKEN)].map((x) => x.p).filter((p, i, a) => a.findIndex((o) => o.id === p.id) === i).slice(0, 3)
        expect(slots.length, "compare slots").toBeGreaterThan(1)
        const q = slots.map((p, i) => `${"abc"[i]}=${p.id}`).join("&")
        await page.goto(`/vi/compare?${q}`, { waitUntil: "domcontentloaded" })
        const blocks = page.getByTestId("compare-admissions")
        await expect(blocks).toHaveCount(slots.length, { timeout: 30000 })
        for (const [i, p] of slots.entries()) {
            const section = blocks.nth(i).getByTestId("compare-admissions-quotas")
            await expect(section).toBeVisible({ timeout: 30000 })
            expect(await printedEntries(section), `slot ${"abc"[i]} ${uniCode(p)} ${p.id.slice(0, 8)}`).toEqual(expectedOf(p))
        }
    })
})

const hasBlock = (c: Course) => !!(c.knowledgeBlock || "").trim()
const creditsOf = (cs: Course[]) => cs.reduce((a, c) => a + (c.credits ?? 0), 0)
const coursesOf = (id: string): Course[] => readJson<Course[]>(path.join(MOCK, "curricula", `${id}.json`))
const withCurriculum = () => {
    const ids = new Set(readdirSync(path.join(MOCK, "curricula")).map((f) => f.replace(/\.json$/, "")))
    return programs().filter((p) => ids.has(p.id) && coursesOf(p.id).length > 0)
}
/** Selection only: the largest cell of the pre-v2.67 chart (keyword buckets, an empty block as "major", ÷ program credits). */
function oldMaxCell(p: Program) {
    const cells = [0, 0, 0, 0]
    const cs = coursesOf(p.id)
    for (const c of cs) {
        const kb = (c.knowledgeBlock || "").toLowerCase()
        const i = kb.includes("đại cương") ? 0 : kb.includes("cơ sở") ? 1 : kb.includes("tốt nghiệp") || kb.includes("thực tập") || kb.includes("đồ án") ? 3 : 2
        cells[i] += c.credits ?? 0
    }
    const total = p.credits || creditsOf(cs) || 1
    return Math.max(...cells.map((x) => Math.round((x / total) * 100)))
}
async function kbCard(page: Page, p: Program) {
    const box = await openDialogTab(page, p, msg("curriculumTab"))
    const heading = box.getByRole("heading", { name: msg("kbTitle"), exact: true })
    await expect(heading).toBeVisible({ timeout: 30000 })
    return heading.locator("xpath=../../..")
}
/** The chart's cells: label, percent, credits and courses (from the kbCreditsLine text). */
async function cellsOf(card: Locator) {
    const line = pattern(msg("kbCreditsLine"))
    const labels = new Map(["kbBlockGeneral", "kbBlockFoundation", "kbBlockMajor", "kbBlockGraduation"].map((k) => [msg(k), k]))
    const out: { block: string; pct: number; credits: number; courses: number }[] = []
    const cells = card.locator("div.grid > div")
    for (let i = 0; i < (await cells.count()); i++) {
        const [label, pctText] = (await cells.nth(i).locator(":scope > div").nth(0).locator("span").allTextContents()).map((s) => s.trim())
        const creditsText = (await cells.nth(i).locator(":scope > div").nth(2).locator("span").first().textContent())?.trim() ?? ""
        const pct = /^(\d+)%$/.exec(pctText)
        const m = line.exec(creditsText)
        expect(pct, `cell ${label} percent "${pctText}"`).toBeTruthy()
        expect(m, `cell ${label} credits line "${creditsText}"`).toBeTruthy()
        out.push({ block: labels.get(label) ?? label, pct: Number(pct![1]), credits: int(m![1]), courses: int(m![2]) })
    }
    return out
}

test.describe("v2.67 — knowledge-block shares", () => {
    test("no cell above 100 %; the cells are shares of the credits of the courses with a block and sum to 100 %", async ({ page }) => {
        test.setTimeout(300000)
        const p = withCurriculum().reduce((best, x) => (oldMaxCell(x) > oldMaxCell(best) ? x : best))
        expect(oldMaxCell(p), `${p.id}: the pick is a measured > 100 % case`).toBeGreaterThan(100)
        const cs = coursesOf(p.id)
        const blocked = cs.filter(hasBlock)
        const credits = creditsOf(blocked)
        expect(credits, `${p.id} has credits with a block`).toBeGreaterThan(0)
        const card = await kbCard(page, p)
        const cells = await cellsOf(card)
        const where = `${uniCode(p)} ${p.name} (${p.id.slice(0, 8)}; pre-v2.67 largest cell ${oldMaxCell(p)} %)`
        expect(cells.filter((c) => c.pct > 100).map((c) => `${c.block} ${c.pct}%`), `${where}: cells above 100 %`).toEqual([])
        expect(cells.length, where).toBe(4)
        expect(Math.abs(cells.reduce((a, c) => a + c.pct, 0) - 100), `${where}: |sum - 100|`).toBeLessThanOrEqual(2)
        expect(cells.reduce((a, c) => a + c.credits, 0), `${where}: cell credits = credits of the courses with a block`).toBe(credits)
        expect(cells.reduce((a, c) => a + c.courses, 0), `${where}: cell courses = courses with a block`).toBe(blocked.length)
        for (const c of cells) expect(c.pct, `${where}: ${c.block}`).toBe(Math.round((c.credits / credits) * 100))
        await expect(card.getByText(fill(msg("kbBasis"), { credits, count: blocked.length }), { exact: true })).toBeVisible()
        // The unclassified line shows only when a course has no block (none here for FTU 3ea0d971: the line is absent).
        const blankLines = (await card.getByText(pattern(msg("kbUnclassified"))).count()) + (await card.getByText(pattern(msg("kbUnclassifiedCount"))).count())
        expect(blankLines, `${where}: unclassified lines for ${cs.length - blocked.length} courses without a block`).toBe(cs.length > blocked.length ? 1 : 0)
    })

    test("courses without a block are counted apart, not as Chuyên ngành", async ({ page }) => {
        test.setTimeout(300000)
        const all = withCurriculum()
        const mixed = all.find((p) => coursesOf(p.id).some(hasBlock) && !coursesOf(p.id).every(hasBlock))
        const none = all.find((p) => !coursesOf(p.id).some(hasBlock))
        const cases = [mixed, none].filter((p): p is Program => !!p)
        expect(cases.length, "programs with courses without a block").toBeGreaterThan(0)
        for (const p of cases) {
            const cs = coursesOf(p.id)
            const blank = cs.filter((c) => !hasBlock(c))
            const blocked = cs.filter(hasBlock)
            const where = `${uniCode(p)} ${p.name} (${p.id.slice(0, 8)}): ${blank.length} of ${cs.length} courses without a block`
            const card = await kbCard(page, p)
            const cells = await cellsOf(card)
            expect(cells.reduce((a, c) => a + c.courses, 0), `${where}: courses counted in the cells`).toBe(blocked.length)
            expect(cells.reduce((a, c) => a + c.credits, 0), `${where}: credits counted in the cells`).toBe(creditsOf(blocked))
            if (creditsOf(blocked) === 0) expect(cells, `${where}: no shares without credits`).toEqual([])
            // The basis line shows only when courses with a block carry credits (absent for an all-unclassified program).
            expect(await card.getByText(pattern(msg("kbBasis"))).count(), `${where}: basis lines`).toBe(creditsOf(blocked) > 0 ? 1 : 0)
            const line = blank.every((c) => c.credits != null)
                ? fill(msg("kbUnclassified"), { count: blank.length, credits: creditsOf(blank) })
                : fill(msg("kbUnclassifiedCount"), { count: blank.length })
            await expect(card.getByText(line, { exact: true })).toBeVisible()
        }
    })

    test("a course without a block and without credits is never counted as 0 credits", async ({ page }) => {
        test.setTimeout(300000)
        // First program (by id) with a course that has neither a block nor credits (HCMUTE today: every course is so).
        const p = withCurriculum().find((x) => coursesOf(x.id).some((c) => !hasBlock(c) && c.credits == null))
        expect(p, "a program with a course without a block and without credits").toBeTruthy()
        const cs = coursesOf(p!.id)
        const blank = cs.filter((c) => !hasBlock(c))
        const blocked = cs.filter(hasBlock)
        const unknown = blank.filter((c) => c.credits == null).length
        const where = `${uniCode(p!)} ${p!.name} (${p!.id.slice(0, 8)}): ${blank.length} courses without a block, ${unknown} of them without credits`
        const card = await kbCard(page, p!)
        const cells = await cellsOf(card)
        // No cell's credit figure may stand for them (before v2.67 they sat in "Chuyên ngành" as "0 Tín chỉ (N môn)").
        expect(cells.reduce((a, c) => a + c.courses, 0), `${where}: courses in the cells' credit figures — ${cells.map((c) => `${c.block} ${c.credits} credits (${c.courses} courses)`).join(", ")}`).toBe(blocked.length)
        // Nor the unclassified line: no "(<n> tín chỉ)" figure that counts unknown credits as 0, the count alone instead.
        await expect(card, where).not.toContainText(fill(msg("kbUnclassified"), { count: blank.length, credits: creditsOf(blank) }))
        await expect(card.getByText(fill(msg("kbUnclassifiedCount"), { count: blank.length }), { exact: true })).toBeVisible()
    })
})
