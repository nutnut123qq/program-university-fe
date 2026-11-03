import { test, expect, type Page, type Request } from "@playwright/test"
import { execFileSync } from "child_process"
import { existsSync, readFileSync, statSync } from "fs"
import path from "path"

/**
 * v2.61 — mobile data budget: the score filter and the compare search without every chunk (audit V7).
 *
 * The score filter's first use read every program chunk (programs/page-*.json, 97 more files) for its pool and all
 * 17 admissions files for its rows — ~23.5 MB raw; the compare slot search read every chunk not yet loaded (88
 * files). Now the pool is the search index (search-index.json, v2.50), the rows come from one derived file,
 * score-index.json (scripts/build-score-index.mjs: every score and quota row with only the fields the filter
 * reads), the compare search lists search-index rows and a pick loads only its programs-by-id/<id>.json.
 *
 * Checked: the derived file is what its script builds (drift) and equals a projection recomputed here; the network
 * of the first score-filter use and the first compare search (files + raw bytes, logged — the Base numbers come
 * from the before-change run of this spec); the filter's results equal the Base rule restated here (not imported)
 * over admissions/*.json + the chunks; two compare picks through the search, one outside the first 200 options.
 * Fixtures by rule, derived from public/mock at test time (DONE.md v2.61 D5); messages read inside test bodies.
 * domcontentloaded, not networkidle (AGENTS.md §12).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const SCORE_INDEX = path.join(MOCK, "score-index.json")
const SEARCH_INDEX = path.join(MOCK, "search-index.json")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const vi = readJson(path.join(ROOT, "src", "messages", "vi.json"))
/** A message that must exist (a missing key never passes as `undefined === undefined`). Call inside tests only. */
const msg = (key: string): string => {
    const v = vi.programs?.[key]
    expect(typeof v === "string" && v.length > 0, `missing message vi.programs.${key}`).toBe(true)
    return v as string
}
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k])

const FIRST_USE_BUDGET = 2_000_000 // the audit's target for the score filter's first use, raw bytes
const INDEX_BUDGET = 1_000_000 // per derived index (search-index.json has the same in v250)

type Program = {
    id: string
    name: string
    code: string | null
    universityId: string
    universityName: string
    createdAt: string
    courseCount: number | null
    evaluationScore?: number | null
    dataSufficiency?: string | null
}
type Uni = { id: string; code: string | null; name: string }
type Row = Record<string, unknown>
type Score = { programId: string | null; year: number; method: string | null; methodLabel: string | null; scope: string; score: number | null; scale: number | null; kind: string }

const catalog: Program[] = (readJson(path.join(MOCK, "index.json")).chunks as string[]).flatMap((c) => readJson(path.join(MOCK, "programs", c)))
const universities: Uni[] = readJson(path.join(MOCK, "universities.json"))
const admissionsFile = (code: string) => path.join(MOCK, "admissions", `${code.replace(/[^a-zA-Z0-9_\-]/g, "_")}.json`)
const admissions = universities
    .filter((u): u is Uni & { code: string } => !!u.code && existsSync(admissionsFile(u.code)))
    .map((u) => ({ code: u.code, data: readJson(admissionsFile(u.code)) as { scores: Row[]; quotas: Row[] } }))
const scores = admissions.flatMap((a) => a.data.scores) as Score[]

// ---- the Base rule, restated (ProgramList.tsx + admissionTrend.ts pickQualifyingCutoff at e0406fb0) ----------------
// A program is tested on its program-scope cutoff rows (with a programId and a numeric score) at the scale — and the
// method, when one is chosen: its newest year there, the lowest score of that year. Eligible when that score ≤ yours.
function qualifying(scale: number, method?: string): Map<string, number> {
    const best = new Map<string, { year: number; score: number }>()
    for (const s of scores) {
        if (s.scope !== "program" || s.kind !== "cutoff" || !s.programId || typeof s.score !== "number" || s.scale !== scale) continue
        if (method && s.method !== method) continue
        const b = best.get(s.programId)
        if (!b || s.year > b.year || (s.year === b.year && s.score < b.score)) best.set(s.programId, { year: s.year, score: s.score })
    }
    return new Map([...best].map(([id, b]) => [id, b.score]))
}
// The pool: the catalog in chunk order (plain list) or, with a university filter, those programs newest first
// (api.ts applyFiltersAndSort, a stable sort on createdAt).
const poolOf = (universityId?: string) =>
    universityId
        ? catalog.filter((p) => p.universityId === universityId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : catalog
type Sig = [string, string, string | null] // name, university, code — as the card shows them
const expectedCards = (c: Case): Sig[] => {
    const q = qualifying(c.scale, c.method)
    return poolOf(c.universityId)
        .filter((p) => q.has(p.id) && q.get(p.id)! <= c.score)
        .map((p) => [p.name, p.universityName, p.code ?? null])
}
const median = (q: Map<string, number>) => [...q.values()].sort((a, b) => a - b)[Math.floor(q.size / 2)]
// Scale options: every scale of every score row; method options at a scale: the methods of its program-scope cutoffs.
const baseScales = [...new Set(scores.map((s) => s.scale).filter((s): s is number => typeof s === "number"))].sort((a, b) => a - b)
const methodsAt = (scale: number) =>
    new Set(scores.filter((s) => s.scope === "program" && s.kind === "cutoff" && s.scale === scale && s.method).map((s) => s.method as string))

// ---- fixtures (DONE.md v2.61 D5) ---------------------------------------------------------------------------------
type Case = { label: string; scale: number; score: number; method?: string; methodLabel?: string; universityId?: string; universityName?: string }
const E1: Case = { label: "E1 scale 30, all methods", scale: 30, score: median(qualifying(30)) }
// E2: the method at 30 with the most qualifying programs among methods whose rows carry one label that no other
// method at 30 shows (the option's label then does not depend on which file Base read first).
const labelsOf = (m: string) => new Set(scores.filter((s) => s.scope === "program" && s.kind === "cutoff" && s.scale === 30 && s.method === m).map((s) => s.methodLabel))
const methodPick = [...methodsAt(30)]
    .filter((m) => labelsOf(m).size === 1 && [...labelsOf(m)][0] && [...methodsAt(30)].every((o) => o === m || !labelsOf(o).has([...labelsOf(m)][0])))
    .map((m): [string, number] => [m, qualifying(30, m).size])
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0]
const E2: Case = {
    label: "E2 scale 30, one method",
    scale: 30,
    method: methodPick,
    methodLabel: methodPick ? ([...labelsOf(methodPick)][0] as string) : undefined,
    score: methodPick ? median(qualifying(30, methodPick)) : NaN,
}
const otherScale = baseScales.filter((s) => s !== 30).sort((a, b) => qualifying(b).size - qualifying(a).size || a - b)[0]
const E3: Case = { label: `E3 scale ${otherScale}, all methods`, scale: otherScale, score: median(qualifying(otherScale)) }
const e4Uni = (() => {
    const n = new Map<string, number>()
    for (const p of poolOf()) if (qualifying(30).get(p.id)! <= E1.score) n.set(p.universityId, (n.get(p.universityId) ?? 0) + 1)
    const id = [...n].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0]
    return universities.find((u) => u.id === id)
})()
const E4: Case = { ...E1, label: "E4 = E1 + university filter", universityId: e4Uni?.id, universityName: e4Uni?.name }

// Compare: two programs with enough data (score-basis.ts hasEnoughData, restated) whose exact name finds ≤ 30 programs
// (compare's search rule: name, code or university name contains the query) — the first inside the first 200 browse
// options (not a default slot), the last in chunk order (outside them).
const enough = (p: Program) => typeof p.evaluationScore === "number" && (p.courseCount ?? 0) > 0 && p.dataSufficiency !== "insufficient"
const matches = (q: string) => catalog.filter((p) => [p.name, p.code ?? "", p.universityName].some((s) => s.toLowerCase().includes(q.toLowerCase())))
const pickable = (p: Program) => enough(p) && matches(p.name).length <= 30
const P_IN = catalog.slice(2, 200).find(pickable)!
const P_OUT = [...catalog.slice(200)].reverse().find(pickable)!

// ---- helpers ------------------------------------------------------------------------------------------------------
const pathOf = (url: string) => new URL(url).pathname
const isMockJson = (url: string) => /^\/mock\/.*\.json$/.test(pathOf(url))
const isChunk = (p: string) => p.startsWith("/mock/programs/")
const isAdmissions = (p: string) => p.startsWith("/mock/admissions/")
const cards = (page: Page) => page.getByTestId("program-card")
const vnNumber = (n: number) => new Intl.NumberFormat("vi", { maximumFractionDigits: 2 }).format(n)

/** Every /mock/*.json response from now on: path + raw (decoded) body bytes. */
function recorder(page: Page) {
    const seen = new Set<Request>()
    const pending = new Set<Request>()
    const got: { path: string; bytes: number }[] = []
    const reads: Promise<void>[] = []
    page.on("request", (r) => {
        if (!isMockJson(r.url())) return
        seen.add(r)
        pending.add(r)
    })
    page.on("requestfailed", (r) => void pending.delete(r))
    page.on("response", (res) => {
        const r = res.request()
        if (!seen.has(r)) return
        reads.push(
            res
                .body()
                .then(
                    (b) => void got.push({ path: pathOf(r.url()), bytes: b.length }),
                    () => void got.push({ path: pathOf(r.url()), bytes: 0 })
                )
                .finally(() => void pending.delete(r))
        )
    })
    return {
        got,
        /** No pending /mock request and none started for 1.5 s; every body read. */
        async quiet() {
            await expect
                .poll(
                    async () => {
                        const n = seen.size
                        await page.waitForTimeout(1500)
                        return pending.size === 0 && seen.size === n
                    },
                    { timeout: 180000, intervals: [0] }
                )
                .toBe(true)
            await Promise.all(reads)
        },
        summary() {
            const sum = (xs: { bytes: number }[]) => xs.reduce((s, x) => s + x.bytes, 0)
            const chunks = got.filter((x) => isChunk(x.path))
            const adm = got.filter((x) => isAdmissions(x.path))
            const other = got.filter((x) => !isChunk(x.path) && !isAdmissions(x.path))
            return (
                `${got.length} files, ${sum(got)} B raw — programs/page-*.json ${chunks.length} (${sum(chunks)} B), ` +
                `admissions/*.json ${adm.length} (${sum(adm)} B)${other.map((x) => `, ${x.path} ${x.bytes} B`).join("")}`
            )
        },
        bytes: () => got.reduce((s, x) => s + x.bytes, 0),
    }
}

async function openList(page: Page) {
    const unis = page.waitForResponse((r) => pathOf(r.url()) === "/mock/universities.json")
    await page.goto("/vi", { waitUntil: "domcontentloaded" })
    await unis
    // A rendered card = the list is hydrated and its first page loaded.
    await expect(cards(page).first()).toBeVisible({ timeout: 30000 })
}

const scoreInput = (page: Page) => page.getByRole("spinbutton", { name: msg("scoreFilterPlaceholder"), exact: true })

async function pickOption(page: Page, combobox: string, option: string) {
    await page.getByRole("combobox", { name: combobox, exact: true }).click()
    await page.getByRole("listbox").getByRole("option", { name: option, exact: true }).click()
}

/** The option texts of a select, then picks `pick` (which closes it). */
async function optionTexts(page: Page, combobox: string, pick: string): Promise<string[]> {
    await page.getByRole("combobox", { name: combobox, exact: true }).click()
    await expect(page.getByRole("listbox").getByRole("option").first()).toBeVisible()
    const texts = await page.getByRole("listbox").getByRole("option").allTextContents()
    await page.getByRole("listbox").getByRole("option", { name: pick, exact: true }).click()
    await expect(page.getByRole("listbox")).toHaveCount(0)
    return texts.map((t) => t.trim())
}

const cardSigs = (page: Page): Promise<Sig[]> =>
    cards(page).evaluateAll((els) =>
        els.map((card): [string, string, string | null] => {
            const h3 = card.querySelector("h3")
            return [
                h3?.textContent ?? "",
                card.querySelector("h3 + div > span")?.textContent ?? "",
                h3?.previousElementSibling?.querySelector(":scope > span.bg-muted")?.textContent ?? null,
            ]
        })
    )

async function expectCase(page: Page, c: Case) {
    const want = expectedCards(c)
    const typed = new Intl.NumberFormat("vi", { maximumFractionDigits: 20 }).format(c.score)
    await expect(page.getByTestId("score-filter-result"), c.label).toHaveText(fill(msg("scoreFilterResult"), { count: vnNumber(want.length), score: typed }), {
        timeout: 120000,
    })
    await expect.poll(() => cardSigs(page), { message: c.label, timeout: 60000 }).toEqual(want)
    return want.length
}

const compareSelect = (page: Page, slot: 1 | 2) => page.getByRole("combobox", { name: msg(`compareProgram${slot}`), exact: true })
const compareSearch = (page: Page, slot: 1 | 2) =>
    page.getByRole("searchbox", { name: fill(msg("compareSearchLabel"), { slot: msg(`compareProgram${slot}`) }), exact: true })

/** The compare page with its browse options loaded and the default slots' own loads finished. */
async function openCompare(page: Page) {
    await page.goto("/vi/compare", { waitUntil: "domcontentloaded" })
    await expect.poll(() => compareSelect(page, 1).locator("option").count(), { timeout: 60000 }).toBeGreaterThan(200)
    await expect(page.getByTestId("compare-card-2")).toBeVisible({ timeout: 30000 })
}

// ---- tests --------------------------------------------------------------------------------------------------------
test.describe("v2.61 — mobile data budget: score filter and compare without every chunk", () => {
    test.describe.configure({ timeout: 300000 })

    test("drift: score-index.json is what scripts/build-score-index.mjs builds — every score and quota row with the filter's fields — ≤ 1,000,000 B", () => {
        let out = ""
        try {
            out = execFileSync(process.execPath, [path.join("scripts", "build-score-index.mjs"), "--check"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" })
        } catch (e) {
            const err = e as { stderr?: string; message: string }
            throw new Error(`build-score-index.mjs --check failed: ${err.stderr || err.message}`)
        }
        expect(out).toContain("matches public/mock")
        // The projection, recomputed here: universities.json order, file order, the fields the filter reads.
        const SCORE_FIELDS = ["university", "programId", "year", "method", "methodLabel", "scope", "scopeLabel", "score", "scale", "kind", "comboNote", "sourceUrl"]
        const QUOTA_FIELDS = ["university", "programId", "year", "scope", "quota"]
        const project = (rows: Row[], code: string, fields: string[]) => rows.map((r) => Object.fromEntries(fields.map((f) => [f, f === "university" ? code : (r[f] ?? null)])))
        const decode = ({ fields, values, rows }: { fields: string[]; values: Record<string, unknown[]>; rows: unknown[][] }) =>
            rows.map((row) => Object.fromEntries(fields.map((f, i) => [f, values[f] ? values[f][row[i] as number] : row[i]])))
        const file = readJson(SCORE_INDEX)
        expect(file.scores.fields).toEqual(SCORE_FIELDS)
        expect(file.quotas.fields).toEqual(QUOTA_FIELDS)
        expect(decode(file.scores)).toEqual(admissions.flatMap((a) => project(a.data.scores, a.code, SCORE_FIELDS)))
        expect(decode(file.quotas)).toEqual(admissions.flatMap((a) => project(a.data.quotas, a.code, QUOTA_FIELDS)))
        const size = statSync(SCORE_INDEX).size
        const search = statSync(SEARCH_INDEX).size
        console.log(
            `[v261] score-index.json ${size} B (${file.scores.rows.length} score rows, ${file.quotas.rows.length} quota rows) — headroom ${INDEX_BUDGET - size} B of ${INDEX_BUDGET}; ` +
                `search-index.json ${search} B — headroom ${INDEX_BUDGET - search} B of ${INDEX_BUDGET}`
        )
        expect(size).toBeLessThanOrEqual(INDEX_BUDGET)
    })

    test("first score-filter use: no programs/page-*.json, no admissions file, ≤ 2,000,000 B raw (measured from the network)", async ({ page }, info) => {
        const before = recorder(page) // from navigation on: the list page's own loads end before the measure
        await openList(page)
        await before.quiet()
        const rec = recorder(page)
        await scoreInput(page).fill(String(E1.score))
        await expect(page.getByTestId("score-filter-result")).toBeVisible({ timeout: 120000 })
        await expect(cards(page).first()).toBeVisible({ timeout: 60000 })
        await rec.quiet()
        const summary = `first score-filter use (score ${E1.score}): ${rec.summary()}`
        console.log(`[v261 ${info.project.name}] ${summary}`)
        info.annotations.push({ type: "first-score-filter-use", description: summary })
        expect(rec.got.filter((x) => isChunk(x.path)).map((x) => x.path), "programs/page-*.json read by the score filter").toEqual([])
        expect(rec.got.filter((x) => isAdmissions(x.path)).map((x) => x.path), "admissions files read by the score filter").toEqual([])
        expect(rec.bytes()).toBeLessThanOrEqual(FIRST_USE_BUDGET)
    })

    test("first compare search: only the search index, no programs/page-*.json (measured from the network)", async ({ page }, info) => {
        const before = recorder(page) // from navigation on: the default slots' curricula/admissions loads end before the measure
        await openCompare(page)
        await before.quiet()
        const rec = recorder(page)
        await compareSearch(page, 2).fill(P_OUT.name)
        await expect(compareSelect(page, 2).locator(`option[value="${P_OUT.id}"]`)).toHaveCount(1, { timeout: 120000 })
        await rec.quiet()
        const summary = `first compare search ("${P_OUT.name}", ${matches(P_OUT.name).length} matches): ${rec.summary()}`
        console.log(`[v261 ${info.project.name}] ${summary}`)
        info.annotations.push({ type: "first-compare-search", description: summary })
        expect(rec.got.filter((x) => isChunk(x.path)).map((x) => x.path), "programs/page-*.json read by the compare search").toEqual([])
        expect(rec.got.map((x) => x.path)).toEqual(["/mock/search-index.json"])
    })

    test("same results as the Base rule (E1–E4: cards in order, counts, scale and method options), read from score-index.json and no admissions file", async ({ page }, info) => {
        const mockPaths: string[] = []
        page.on("request", (r) => {
            if (isMockJson(r.url())) mockPaths.push(pathOf(r.url()))
        })
        const scale = msg("scoreFilterScale")
        const method = msg("scoreFilterMethodAll")
        expect(methodPick, "a method at scale 30 with one unique label").toBeTruthy()
        expect(e4Uni, "a university with eligible programs in E1").toBeTruthy()

        await openList(page)
        await scoreInput(page).fill(String(E1.score))
        await expect(page.getByTestId("score-filter-result")).toBeVisible({ timeout: 120000 })
        expect(await optionTexts(page, scale, "30"), "scale options").toEqual(baseScales.map(String))
        const n1 = await expectCase(page, E1)
        expect(await optionTexts(page, method, method), "method options at 30 (+ all)").toHaveLength(methodsAt(30).size + 1)

        await pickOption(page, method, E2.methodLabel!)
        await scoreInput(page).fill(String(E2.score))
        const n2 = await expectCase(page, E2)

        await pickOption(page, scale, String(E3.scale)) // a scale change resets the method to "all"
        await scoreInput(page).fill(String(E3.score))
        const n3 = await expectCase(page, E3)
        expect(await optionTexts(page, method, method), `method options at ${E3.scale} (+ all)`).toHaveLength(methodsAt(E3.scale).size + 1)

        await pickOption(page, scale, "30")
        await scoreInput(page).fill(String(E4.score))
        await pickOption(page, msg("allUniversities"), E4.universityName!)
        const n4 = await expectCase(page, E4)

        const line =
            `equal to the Base rule: ${E1.label} score ${E1.score} → ${n1}; ${E2.label} ${E2.method} score ${E2.score} → ${n2}; ` +
            `${E3.label} score ${E3.score} → ${n3}; ${E4.label} ${E4.universityName} → ${n4}`
        console.log(`[v261 ${info.project.name}] ${line}`)
        info.annotations.push({ type: "equivalence", description: line })
        // The results above came from the new path: the score index, never an admissions file or a chunk beyond page 1.
        expect(mockPaths.filter((p) => p === "/mock/score-index.json"), "score-index.json read").toHaveLength(1)
        expect(mockPaths.filter(isAdmissions), "admissions files read").toEqual([])
        expect(mockPaths.filter(isChunk).length, "chunks read (the first list page only)").toBeLessThanOrEqual(1)
    })

    test("compare: two programs picked through the slot search (one outside the first 200) open in full, each pick reads only its programs-by-id file; ?a=&b= unchanged", async ({ page }) => {
        expect(P_IN && P_OUT, "fixtures: a pickable program inside and one outside the first 200").toBeTruthy()
        const scoreText = (p: Program) => `${(p.evaluationScore as number).toFixed(1)} / 10.0`
        await openCompare(page)
        const byId: string[] = []
        page.on("request", (r) => {
            if (pathOf(r.url()).startsWith("/mock/programs-by-id/")) byId.push(pathOf(r.url()))
        })
        await expect(compareSelect(page, 2).locator(`option[value="${P_OUT.id}"]`), "P_OUT is not a browse option").toHaveCount(0)

        for (const [slot, p] of [[1, P_IN], [2, P_OUT]] as const) {
            // P_IN is also a browse option: wait until the slot lists the search's own rows (every match + the slot's current
            // program when it does not match), so the pick below is a search row, not the browse option (v2.61 s3 race).
            const current = await compareSelect(page, slot).inputValue()
            const found = matches(p.name)
            await compareSearch(page, slot).fill(p.name)
            await expect(compareSelect(page, slot).locator("option:not([disabled])"), "the slot lists the search results").toHaveCount(
                found.length + (found.some((m) => m.id === current) ? 0 : 1),
                { timeout: 120000 }
            )
            await expect(compareSelect(page, slot).locator(`option[value="${p.id}"]`)).toHaveCount(1)
            await compareSelect(page, slot).selectOption(p.id)
            await expect(compareSelect(page, slot)).toHaveValue(p.id, { timeout: 30000 })
            const card = page.getByTestId(`compare-card-${slot}`)
            await expect(card.getByRole("heading", { name: p.name, exact: true })).toBeVisible({ timeout: 30000 })
            // The SLM score: a field the search index does not carry — the card holds the full program.
            await expect(card).toContainText(scoreText(p))
        }
        await expect(page).toHaveURL(new RegExp(`/vi/compare\\?a=${P_IN.id}&b=${P_OUT.id}$`), { timeout: 15000 })
        expect(byId, "each pick reads exactly its programs-by-id file").toEqual([`/mock/programs-by-id/${P_IN.id}.json`, `/mock/programs-by-id/${P_OUT.id}.json`])

        await page.reload({ waitUntil: "domcontentloaded" })
        await expect(compareSelect(page, 1)).toHaveValue(P_IN.id, { timeout: 60000 })
        await expect(compareSelect(page, 2)).toHaveValue(P_OUT.id)
        await expect(page.getByTestId("compare-card-2").getByRole("heading", { name: P_OUT.name, exact: true })).toBeVisible({ timeout: 30000 })
    })
})
