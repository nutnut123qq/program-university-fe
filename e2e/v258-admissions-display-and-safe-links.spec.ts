import { test, expect, type Locator, type Page } from "@playwright/test"
import { existsSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.58 — admissions display consistency + safe source links (audit 2026-10-30 V4, gap G6).
 *
 * - One number format for cutoffs and counts: the page locale's digits, ≤ 2 decimals, no padded zeros
 *   (Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), written here from the contract) — the same cutoff
 *   reads the same in the program dialog, the score-filter threshold block and the card hint, in vi and in en;
 *   the score-filter result/coverage counts too (vi "1.232", en "1,232").
 * - Method codes ending in "_<the row's own year>" (NEU `thpt_2025`/`thpt_2026`) are one method for the block's
 *   "newest year per method" rule.
 * - Group/campus rows bound to a program (programId set) that has no program-scope cutoff at the scale — the
 *   programs the filter cannot test — show in the block with the scope label and the program's name; they never
 *   make a program eligible; only listed programs' rows show.
 * - Only http(s) URLs from the data become links: javascript:, "javascript://host/…", data: and broken strings
 *   ("https.//…") never do; an https one still does (page.route fixtures on the dialog, card, compare, syllabus
 *   modal and materials page; the helper itself on a table).
 *
 * Every expected value is computed here from public/mock with the contract's rules (DONE.md v2.58); messages come
 * from src/messages and must exist. domcontentloaded, not networkidle (AGENTS.md §12).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
type Locale = "vi" | "en"
const messages: Record<Locale, Record<string, Record<string, unknown>>> = {
    vi: readJson(path.join(ROOT, "src", "messages", "vi.json")),
    en: readJson(path.join(ROOT, "src", "messages", "en.json")),
}
/** A message that must exist (a missing key fails instead of comparing undefined with undefined). */
const msg = (locale: Locale, key: string, ns = "programs"): string => {
    const m = messages[locale][ns]?.[key]
    if (typeof m !== "string" || m.length === 0) throw new Error(`missing message ${locale}.${ns}.${key}`)
    return m
}
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

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
    sourceUrl: string | null
}
type Admission = { scores: Score[]; quotas: { programId: string | null; sourceUrl: string | null }[]; tuitions: { programId: string | null; sourceUrl: string | null }[] }
type Program = { id: string; name: string; code?: string | null; universityId: string; universityName: string; sourceUrl?: string | null }
type Uni = { id: string; code: string; name: string }

const index = readJson(path.join(MOCK, "index.json"))
const chunkFiles = index.chunks as string[]
const programs: Program[] = chunkFiles.flatMap((f) => readJson(path.join(MOCK, "programs", f)))
const universities: Uni[] = readJson(path.join(MOCK, "universities.json"))
const uniOf = (p: Program) => universities.find((u) => u.id === p.universityId)!
const admissionPath = (code: string) => path.join(MOCK, "admissions", `${code}.json`)
const admissionCache = new Map<string, Admission | null>()
const admissionOf = (code: string): Admission | null => {
    if (!admissionCache.has(code)) admissionCache.set(code, existsSync(admissionPath(code)) ? readJson(admissionPath(code)) : null)
    return admissionCache.get(code)!
}
const scoresOf = (code: string): Score[] => admissionOf(code)?.scores ?? []

// ---- the contract's rules ----
const fmt = (n: number, locale: Locale) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n)
const normMethod = (s: { method: string | null; year: number }) => (s.method ?? "").replace(new RegExp(`_${s.year}$`), "")
const SCALE = 30

/** The filter's qualifying cutoff per program at a scale: program-scope cutoff rows, newest year, lowest score. */
function qualifying(scale: number) {
    const by = new Map<string, Score[]>()
    for (const u of universities)
        for (const s of scoresOf(u.code)) {
            if (s.scope !== "program" || s.kind !== "cutoff" || !s.programId || typeof s.score !== "number" || s.scale !== scale) continue
            by.set(s.programId, [...(by.get(s.programId) ?? []), s])
        }
    const q = new Map<string, Score>()
    for (const [pid, rows] of by) {
        const newest = Math.max(...rows.map((r) => r.year))
        q.set(pid, rows.filter((r) => r.year === newest).sort((a, b) => a.score - b.score)[0])
    }
    return q
}
const Q = qualifying(SCALE)
const eligibleAt = (score: number) => programs.filter((p) => (Q.get(p.id)?.score ?? Infinity) <= score)
const covered = programs.filter((p) => Q.has(p.id)).length

type Entry = { method: string; year: number; kind: string; scope: string; score: number; labels: Map<string | null, Set<string>> }
/** The block's entries of one university at a scale with `listed` program ids in the list (contract v2.58). */
function blockEntries(code: string, scale: number, listed: Set<string>): Entry[] {
    const scores = scoresOf(code)
    const tested = new Set(
        scores.filter((s) => s.scope === "program" && s.kind === "cutoff" && s.programId && typeof s.score === "number" && s.scale === scale).map((s) => s.programId)
    )
    const rows = scores.filter(
        (s) => s.scope !== "program" && typeof s.score === "number" && s.scale === scale && (s.programId == null || (listed.has(s.programId) && !tested.has(s.programId)))
    )
    const newest = new Map<string, number>()
    for (const s of rows) newest.set(normMethod(s), Math.max(newest.get(normMethod(s)) ?? -Infinity, s.year))
    const entries = new Map<string, Entry>()
    for (const s of rows) {
        if (s.year !== newest.get(normMethod(s))) continue
        const key = [s.method ?? "", s.year, s.kind, s.scope, s.score].join("|")
        const e = entries.get(key) ?? { method: s.method ?? "", year: s.year, kind: s.kind, scope: s.scope, score: s.score, labels: new Map() }
        const ids = e.labels.get(s.scopeLabel || null) ?? new Set<string>()
        if (s.programId) ids.add(s.programId)
        e.labels.set(s.scopeLabel || null, ids)
        entries.set(key, e)
    }
    return [...entries.values()]
}
const ALL = new Set(programs.map((p) => p.id))
const entrySel = (e: Pick<Entry, "method" | "year" | "kind" | "scope" | "score">) =>
    `[data-testid="score-threshold-entry"][data-method="${e.method}"][data-year="${e.year}"][data-kind="${e.kind}"][data-scope="${e.scope}"][data-score="${e.score}"]`

// The dialog's default method view: keys `${year}|${method}` of the program's rows and the university's
// programId-null context rows, sorted descending; the first one is shown first.
function dialogDefaultKey(p: Program): string {
    const scores = scoresOf(uniOf(p).code)
    const keys = new Set(
        [...scores.filter((s) => s.programId === p.id), ...scores.filter((s) => s.programId === null && s.scope !== "program")].map((s) => `${s.year}|${s.method}`)
    )
    return [...keys].sort((a, b) => b.localeCompare(a))[0]
}

// Fixture 1 — one cutoff value V with one decimal (the Base dialog padded it: "18.50") that is the card cutoff of
// a program P (its qualifying row is in P's default dialog view, and P is the only card with its name and
// university at score V) and also the score of a block entry at the scale (whole catalog listed).
const sameValue = (() => {
    const blockAt = new Map<number, { code: string; e: Entry }>()
    for (const u of universities) for (const e of blockEntries(u.code, SCALE, ALL)) if (!blockAt.has(e.score)) blockAt.set(e.score, { code: u.code, e })
    const cands = programs
        .filter((p) => {
            const q = Q.get(p.id)
            if (!q || Number.isInteger(q.score) || !Number.isInteger(q.score * 10) || !blockAt.has(q.score)) return false
            if (`${q.year}|${q.method}` !== dialogDefaultKey(p)) return false
            return eligibleAt(q.score).filter((o) => o.name === p.name && o.universityName === p.universityName).length === 1
        })
        .sort((a, b) => Q.get(a.id)!.score - Q.get(b.id)!.score || a.id.localeCompare(b.id))
    if (!cands.length) return null
    const p = cands[0]
    const v = Q.get(p.id)!.score
    return { p, v, block: blockAt.get(v)! }
})()

// Fixture 2 — NEU's school-scope rows at the scale: one entry per normalised method.
const neuSchool = blockEntries("NEU", SCALE, ALL).filter((e) => e.scope === "school")
const neuYearCoded = scoresOf("NEU").filter((s) => s.method && normMethod(s) !== s.method)

// Fixture 3 — catalog programs whose only rows at the scale are group/campus rows (audit: 15 = FTU 9, NEU 5, UEL 1).
const groupOnly = programs
    .map((p) => ({ p, rows: scoresOf(uniOf(p).code).filter((s) => s.programId === p.id && s.scale === SCALE && typeof s.score === "number") }))
    .filter(({ rows }) => rows.length > 0 && rows.every((s) => s.scope !== "program"))
const groupOnlyUnis = [...new Set(groupOnly.map(({ p }) => uniOf(p).code))].sort()
/** The block entry and scope label that carry program `p` (whole catalog listed). */
const entryOf = (p: Program, listed = ALL) => {
    for (const e of blockEntries(uniOf(p).code, SCALE, listed)) for (const [label, ids] of e.labels) if (ids.has(p.id)) return { e, label }
    return null
}
// Fixture 4 — a group-only program sharing its label with another group-only program; a search for its name lists
// it without the other one (the search's own rule: name, code or university name contains the text).
const sibling = (() => {
    for (const { p } of groupOnly) {
        const at = entryOf(p)
        const others = at ? [...at.e.labels.get(at.label)!].filter((id) => id !== p.id) : []
        const q = p.name.toLowerCase()
        const listed = programs.filter((o) => o.name.toLowerCase().includes(q) || (o.code ?? "").toLowerCase().includes(q) || o.universityName.toLowerCase().includes(q))
        const other = others.find((id) => !listed.some((o) => o.id === id))
        if (at && other) return { p, other: programs.find((o) => o.id === other)!, listed: new Set(listed.map((o) => o.id)) }
    }
    return null
})()

// Link fixtures.
const BAD = ["javascript:alert(1)", "javascript://tedo.test/%0Aalert(1)", "data:text/html,<b>tedo</b>"]
const BROKEN = "https.//hbr.org (Corporate Communication – HBR/ Harvard Business review)"
const badLinks = (scope: Page | Locator) => scope.locator('a[href^="javascript:" i], a[href^="data:" i], a[href^="https." i]')
// A program with a program row whose https source shows in its default dialog view (it keeps it; every other
// admissions URL of its university becomes a bad one), and a second program of another university for compare.
const linkCase = (() => {
    for (const p of [...programs].sort((a, b) => a.id.localeCompare(b.id))) {
        const key = dialogDefaultKey(p)
        const keep = scoresOf(uniOf(p).code).find((s) => s.programId === p.id && `${s.year}|${s.method}` === key && /^https:\/\//.test(s.sourceUrl ?? ""))
        if (!keep) continue
        const other = programs.find((o) => o.universityId !== p.universityId && scoresOf(uniOf(o).code).some((s) => s.programId === o.id))
        if (other) return { p, keep, other }
    }
    return null
})()
/** The university's file with every admissions source URL replaced by a bad one, except `keep` (a row of that file). */
function routedAdmissions(code: string, keep: Score): Admission {
    const a = admissionOf(code)!
    expect(a.scores.includes(keep)).toBe(true)
    let i = 0
    const bad = () => BAD[i++ % BAD.length]
    return {
        ...a,
        scores: a.scores.map((s) => (s === keep ? s : { ...s, sourceUrl: bad() })),
        quotas: a.quotas.map((q) => ({ ...q, sourceUrl: bad() })),
        tuitions: a.tuitions.map((t) => ({ ...t, sourceUrl: bad() })),
    }
}
const firstChunk: Program[] = readJson(path.join(MOCK, "programs", chunkFiles[0]))
const DEFAULT_SYLLABUS = path.join(MOCK, "syllabuses", "FPT", "SWE201c.json") // the /roadmap default (DONE.md v2.53 M2)

// ---- helpers ----
const cards = (page: Page) => page.getByTestId("program-card")
const cardOf = (page: Page, p: Program) =>
    cards(page).filter({ has: page.getByRole("heading", { name: p.name, exact: true }) }).filter({ hasText: p.universityName })

async function applyScoreFilter(page: Page, locale: Locale, score: string) {
    await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("button", { name: msg(locale, "viewDetail") }).first()).toBeVisible({ timeout: 30000 })
    await page.getByTestId("score-filter-input").fill(score)
    await page.getByTestId("score-filter").getByRole("combobox", { name: msg(locale, "scoreFilterScale"), exact: true }).click()
    await page.getByRole("option", { name: String(SCALE), exact: true }).click()
    await expect(page.getByTestId("score-filter-result")).toBeVisible({ timeout: 60000 })
}
const uniBlock = (page: Page, code: string) => page.locator(`[data-testid="score-thresholds-uni"][data-university="${code}"]`)
async function openUni(page: Page, code: string) {
    const u = uniBlock(page, code)
    await expect(u).toHaveCount(1, { timeout: 30000 })
    if ((await u.getAttribute("open")) === null) await u.locator("summary").click()
    return u
}

test.describe("v2.58 — admissions display consistency + safe source links", () => {
    test("fixtures from the mock", () => {
        expect(sameValue, "a one-decimal value that is a card cutoff and a block entry at scale 30").toBeTruthy()
        expect(fmt(sameValue!.v, "vi")).not.toBe(sameValue!.v.toFixed(2))
        expect(neuYearCoded.length, "NEU year-coded method rows").toBeGreaterThan(0)
        expect(new Set(neuYearCoded.map(normMethod)).size).toBeLessThan(new Set(neuYearCoded.map((s) => s.method)).size)
        expect(neuSchool.length).toBeGreaterThan(0)
        expect(groupOnly.length, "programs whose only scale-30 rows are group/campus rows").toBeGreaterThan(0)
        for (const { p } of groupOnly) expect(entryOf(p), `${p.id} has a block entry`).toBeTruthy()
        expect(sibling, "a group-only program with a sibling under the same label").toBeTruthy()
        expect(linkCase, "a program with an https source in its default admissions view").toBeTruthy()
        expect(existsSync(DEFAULT_SYLLABUS)).toBe(true)
        // The first 4 programs of the first chunk are on the first list page, each card unique by name + university.
        for (const p of firstChunk.slice(0, 4)) expect(firstChunk.slice(0, 12).filter((o) => o.name === p.name && o.universityName === p.universityName).length).toBe(1)
        expect(firstChunk.slice(0, 4).every((p) => /^https:\/\//.test(p.sourceUrl ?? ""))).toBe(true)
        // Evidence line for the logs: which rows the tests below use.
        console.log(
            `v258 fixtures: value ${sameValue!.v} card ${sameValue!.p.id} block ${sameValue!.block.code} ${entrySel(sameValue!.block.e)}; ` +
                `NEU school entries ${neuSchool.length}, year-coded rows ${neuYearCoded.length}; group-only ${groupOnly.length} ` +
                `(${groupOnlyUnis.map((c) => `${c} ${groupOnly.filter(({ p }) => uniOf(p).code === c).length}`).join(", ")}); ` +
                `sibling ${sibling!.p.id} / ${sibling!.other.id}; links ${linkCase!.p.id} keep ${linkCase!.keep.sourceUrl} other ${linkCase!.other.id}`
        )
    })

    test("messages exist in vi and en with the same placeholders", () => {
        const keys = ["scoreThresholdsPrograms", "scoreThresholdsTitle", "scoreThresholdsNote", "scoreThresholdsCount", "scoreFilterResult", "scoreFilterCoverage", "scoreHintCutoff", "scoreHintDelta", "scoreHintQuota", "admissionsTab", "viewDetail", "scoreFilterScale"]
        const placeholders = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort()
        for (const k of keys) expect(placeholders(msg("en", k))).toEqual(placeholders(msg("vi", k)))
        for (const l of ["vi", "en"] as Locale[]) {
            expect(msg(l, "scoreThresholdsPrograms")).toContain("{names}")
            expect(msg(l, "viewSyllabus", "roadmap").length).toBeGreaterThan(0)
            expect(msg(l, "tabMaterials", "syllabus").length).toBeGreaterThan(0)
        }
    })

    test("helpers: safeHttpUrl/urlHost let only http(s) through; one number format; method codes without their year", () => {
        const urlFile = path.join(ROOT, "src", "lib", "safe-url.ts")
        const fmtFile = path.join(ROOT, "src", "lib", "admissions-display.ts")
        expect(existsSync(urlFile), "src/lib/safe-url.ts").toBe(true)
        expect(existsSync(fmtFile), "src/lib/admissions-display.ts").toBe(true)
        // require (not import()): Playwright transpiles a required .ts file; a missing file fails this test only.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { safeHttpUrl, urlHost } = require(urlFile) as { safeHttpUrl: (u: string | null | undefined) => string | null; urlHost: (u: string | null | undefined) => string | null }
        for (const ok of ["https://www.neu.edu.vn/a b?x=1", "http://daotao.vnu.edu.vn/", "HTTPS://Example.ORG/x"]) expect(safeHttpUrl(ok), ok).toBe(ok)
        for (const no of [...BAD, BROKEN, "JavaScript:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "vbscript:msgbox(1)", "ftp://example.org/x", "file:///c:/x", "/vi/programs", "//evil.test/x", "mailto:a@b.c", "", null, undefined])
            expect(safeHttpUrl(no as string), String(no)).toBeNull()
        expect(urlHost("https://www.tuyensinh.ctu.edu.vn/x")).toBe("tuyensinh.ctu.edu.vn")
        expect(urlHost("javascript://tedo.test/%0Aalert(1)")).toBeNull()

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { formatAdmissionNumber, displayMethod } = require(fmtFile) as {
            formatAdmissionNumber: (n: number, l: string, signed?: boolean) => string
            displayMethod: (s: { method: string | null; year: number }) => string
        }
        const values = new Set<number>()
        for (const u of universities) for (const s of scoresOf(u.code)) { values.add(s.score); values.add(s.scale) }
        for (const l of ["vi", "en"] as Locale[]) {
            const off = [...values].filter((v) => formatAdmissionNumber(v, l) !== fmt(v, l))
            expect(off, `${l}: values formatted off the contract`).toEqual([])
        }
        expect([formatAdmissionNumber(0.5, "vi", true), formatAdmissionNumber(-0.25, "en", true), formatAdmissionNumber(0, "vi", true)]).toEqual(["+0,5", "-0.25", "0"])
        for (const s of neuYearCoded) expect(displayMethod(s)).toBe(normMethod(s))
        expect(displayMethod({ method: "thpt_100", year: 2024 })).toBe("thpt_100")
        expect(displayMethod({ method: null, year: 2026 })).toBe("")
    })

    for (const locale of ["vi", "en"] as Locale[]) {
        test(`${locale}: one cutoff reads the same on the card, in the block and in the dialog; counts in the locale format`, async ({ page }) => {
            test.setTimeout(180_000)
            const { p, v, block } = sameValue!
            const shown = `${fmt(v, locale)}/${fmt(SCALE, locale)}`
            await applyScoreFilter(page, locale, String(v))
            const eligible = eligibleAt(v).length
            await expect(page.getByTestId("score-filter-result")).toHaveText(fill(msg(locale, "scoreFilterResult"), { count: fmt(eligible, locale), score: fmt(v, locale) }), { timeout: 60000 })
            const coverage = page.getByTestId("score-filter-coverage")
            await expect(coverage).toContainText(`${fmt(eligible, locale)} / ${fmt(covered, locale)}`)
            await expect(coverage).toContainText(fmt(programs.length - covered, locale))

            const card = cardOf(page, p)
            await expect(card).toHaveCount(1, { timeout: 30000 })
            await expect(card.getByTestId("score-hint")).toContainText(shown)

            const uni = await openUni(page, block.code)
            const entry = uni.locator(entrySel(block.e))
            await expect(entry).toHaveCount(1)
            await expect(entry).toContainText(shown)

            await card.getByRole("button", { name: msg(locale, "viewDetail") }).click()
            const dialog = page.getByRole("dialog", { name: p.name, exact: true })
            await expect(dialog).toBeVisible({ timeout: 30000 })
            await dialog.getByRole("tab", { name: msg(locale, "admissionsTab"), exact: true }).click()
            const section = dialog.getByTestId("admissions-section")
            await expect(section.getByText(`${fmt(v, locale)} / ${fmt(SCALE, locale)}`, { exact: true }).first()).toBeVisible({ timeout: 30000 })
            await expect(section).not.toContainText(v.toFixed(2))
        })
    }

    test("NEU: year-coded method codes are one method — its school-scope thresholds show the newest year only", async ({ page }) => {
        test.setTimeout(180_000)
        await applyScoreFilter(page, "vi", "25")
        const neu = await openUni(page, "NEU")
        const school = neu.locator('[data-testid="score-threshold-entry"][data-scope="school"]')
        await expect(school).toHaveCount(neuSchool.length)
        for (const e of neuSchool) await expect(neu.locator(entrySel(e))).toHaveCount(1)
        const shown = await school.evaluateAll((els) => els.map((el) => ({ method: el.getAttribute("data-method"), year: Number(el.getAttribute("data-year")) })))
        const years = new Map<string, Set<number>>()
        for (const s of shown) years.set(normMethod(s), (years.get(normMethod(s)) ?? new Set()).add(s.year))
        for (const [m, y] of years) expect([...y], `method ${m}`).toHaveLength(1)
        for (const s of neuYearCoded) {
            const newest = Math.max(...neuYearCoded.filter((o) => normMethod(o) === normMethod(s)).map((o) => o.year))
            if (s.year < newest) await expect(neu.locator(`[data-testid="score-threshold-entry"][data-method="${s.method}"]`)).toHaveCount(0)
        }
    })

    test("group/campus-only programs: their rows show in the block with the program's name; they never pass", async ({ page }) => {
        test.setTimeout(240_000)
        await applyScoreFilter(page, "vi", String(SCALE))
        await expect(cards(page).first()).toBeVisible({ timeout: 30000 })
        for (const code of groupOnlyUnis) {
            const uni = await openUni(page, code)
            await expect(uni.getByTestId("score-threshold-entry")).toHaveCount(blockEntries(code, SCALE, ALL).length)
        }
        for (const { p } of groupOnly) {
            await expect(cardOf(page, p), `${p.name} never passes on a group/campus row`).toHaveCount(0)
            const { e, label } = entryOf(p)!
            const entry = uniBlock(page, uniOf(p).code).locator(entrySel(e))
            await expect(entry).toHaveCount(1)
            const scope = entry.getByTestId("score-threshold-scope").filter({ hasText: label ?? "" })
            await expect(scope.first()).toContainText(msg("vi", e.scope === "campus" ? "admissionScopeCampus" : "admissionScopeGroup"))
            await expect(scope.first().getByTestId("score-threshold-programs")).toContainText(p.name)
        }
    })

    test("only listed programs' group rows show: a name search drops the sibling under the same label", async ({ page }) => {
        test.setTimeout(180_000)
        const { p, other, listed } = sibling!
        await applyScoreFilter(page, "vi", String(SCALE))
        await page.getByPlaceholder(msg("vi", "searchPlaceholder"), { exact: true }).fill(p.name)
        const code = uniOf(p).code
        const expected = blockEntries(code, SCALE, listed)
        const uni = await openUni(page, code)
        await expect(uni.getByTestId("score-threshold-entry")).toHaveCount(expected.length, { timeout: 30000 })
        const { e, label } = entryOf(p, listed)!
        const programsLine = uni.locator(entrySel(e)).getByTestId("score-threshold-scope").filter({ hasText: label ?? "" }).getByTestId("score-threshold-programs")
        await expect(programsLine).toContainText(p.name)
        await expect(programsLine).not.toContainText(other.name)
    })

    test("links: dialog — a javascript:/data: source gives no link, the https one stays", async ({ page }) => {
        test.setTimeout(120_000)
        const { p, keep } = linkCase!
        const code = uniOf(p).code
        const served = routedAdmissions(code, keep)
        await page.route(`**/mock/admissions/${code}.json`, (r) => r.fulfill({ json: served }))
        const detail = readJson(path.join(MOCK, "programs-by-id", `${p.id}.json`))
        await page.route(`**/mock/programs-by-id/${p.id}.json`, (r) => r.fulfill({ json: { ...detail, sourceUrl: BAD[1] } }))
        await page.goto(`/vi?program=${p.id}`, { waitUntil: "domcontentloaded" })
        const dialog = page.getByRole("dialog", { name: p.name, exact: true })
        await expect(dialog).toBeVisible({ timeout: 30000 })
        await expect(dialog.getByRole("tab", { name: msg("vi", "infoTab"), exact: true })).toHaveAttribute("aria-selected", "true")
        await expect(badLinks(dialog)).toHaveCount(0)
        await expect(dialog.getByRole("link", { name: /tedo\.test/ })).toHaveCount(0)
        await dialog.getByRole("tab", { name: msg("vi", "admissionsTab"), exact: true }).click()
        const links = dialog.getByTestId("admissions-source-link")
        await expect(links).toHaveCount(1, { timeout: 30000 })
        await expect(links).toHaveAttribute("href", keep.sourceUrl!)
        await expect(links).toHaveText(new URL(keep.sourceUrl!).hostname.replace(/^www\./, ""))
        await expect(badLinks(dialog)).toHaveCount(0)
    })

    test("links: card — javascript:/data: sources give no link, the https one stays", async ({ page }) => {
        const served = firstChunk.map((p, i) => (i < BAD.length ? { ...p, sourceUrl: BAD[i] } : p))
        await page.route(`**/mock/programs/${chunkFiles[0]}`, (r) => r.fulfill({ json: served }))
        await page.goto("/vi", { waitUntil: "domcontentloaded" })
        for (const [i, p] of firstChunk.slice(0, BAD.length + 1).entries()) {
            const card = cardOf(page, p)
            await expect(card).toHaveCount(1, { timeout: 30000 })
            if (i < BAD.length) await expect(card.locator("a")).toHaveCount(0)
            else await expect(card.locator(`a[href="${p.sourceUrl}"]`)).toHaveCount(1)
        }
        await expect(badLinks(page)).toHaveCount(0)
    })

    test("links: compare — a javascript:/data: admissions source gives no link, the https one stays", async ({ page }) => {
        const { p, keep, other } = linkCase!
        const code = uniOf(p).code
        const served = routedAdmissions(code, keep)
        await page.route(`**/mock/admissions/${code}.json`, (r) => r.fulfill({ json: served }))
        await page.goto(`/vi/compare?a=${p.id}&b=${other.id}`, { waitUntil: "domcontentloaded" })
        const blocks = page.getByTestId("compare-admissions")
        await expect(blocks).toHaveCount(2, { timeout: 30000 })
        const links = blocks.nth(0).getByTestId("admissions-source-link")
        await expect(links).toHaveCount(1, { timeout: 30000 })
        await expect(links).toHaveAttribute("href", keep.sourceUrl!)
        await expect(badLinks(page)).toHaveCount(0)
    })

    test("links: syllabus modal — only http(s) material descriptions are links, the rest stays as text", async ({ page }) => {
        const syl = readJson(DEFAULT_SYLLABUS)
        const original = (syl.materials as { materialDescription: string }[]).map((m) => m.materialDescription)
        const kept = original.filter((d, i) => i >= 4 && /^https?:\/\//.test(d))
        expect(kept.length).toBeGreaterThan(0)
        const descs = [...BAD, BROKEN]
        const served = { ...syl, materials: syl.materials.map((m: object, i: number) => (i < descs.length ? { ...m, materialDescription: descs[i] } : m)) }
        await page.route("**/mock/syllabuses/FPT/SWE201c.json", (r) => r.fulfill({ json: served }))
        await page.goto("/vi/roadmap", { waitUntil: "domcontentloaded" })
        await page.getByRole("button", { name: msg("vi", "viewSyllabus", "roadmap"), exact: true }).click()
        const modal = page.getByRole("dialog")
        await expect(modal.getByRole("heading", { level: 2, name: String(syl.info.syllabusName), exact: true })).toBeVisible({ timeout: 30000 })
        await modal.getByRole("tab", { name: new RegExp(`^${esc(msg("vi", "tabMaterials", "syllabus"))}`) }).click()
        await expect(modal.getByText(BROKEN, { exact: true })).toBeVisible({ timeout: 15000 })
        await expect(modal.getByRole("link", { name: BROKEN })).toHaveCount(0)
        await expect(badLinks(modal)).toHaveCount(0)
        for (const d of kept) await expect(modal.locator(`a[href="${d}"]`).first()).toBeVisible()
    })

    test("links: materials page — only http(s) material descriptions are links", async ({ page }) => {
        const list = readJson(path.join(MOCK, "materials", "FPT.json"))
        const keepUrl = "https://example.org/tedo-book"
        const item = { ...list[0], materials: [BAD[1], keepUrl, BAD[2]].map((d) => ({ ...list[0].materials[0], materialDescription: d, isUrl: true })) }
        await page.route("**/mock/materials/FPT.json", (r) => r.fulfill({ json: [item] }))
        await page.goto("/vi/materials", { waitUntil: "domcontentloaded" })
        await expect(page.locator(`a[href="${keepUrl}"]`)).toHaveCount(1, { timeout: 30000 })
        await expect(page.getByText(BAD[2], { exact: true })).toBeVisible()
        await expect(badLinks(page)).toHaveCount(0)
    })
})
