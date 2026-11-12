import { test, expect, type Download, type Page } from "@playwright/test"
import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import path from "path"
import { isOwnLink } from "./source-domains"
import { EDGE_CASES, shownDay, snapshotDay } from "./crawl-date-cases"

/**
 * v2.73 (audit A9 / M36, AGENTS.md §9 "display the source university and crawl date when showing data").
 *
 * The collection ("crawl") date on the program card (list + score filter), the compare page, the analytics page (+ its
 * downloads) and /roadmap. Every expectation is computed here from public/mock + the messages through
 * e2e/crawl-date-cases.ts (FIX r1): `snapshotDay` = the Vietnam day of a snapshot value by UTC + 7 h arithmetic (it
 * accepts only the two shapes the data holds), `EDGE_CASES` = hand-written inputs with literal expectations — never
 * the app's helper, except in test 1, which compares that helper with both. Missing dates must read "not recorded",
 * never empty, "Invalid Date" or 1970. The browser runs in America/Los_Angeles (FIX r1, panel MINOR 4): the data's
 * +07:00 timestamps change day there (a browser-zone day would fail), while the host's own zone is Vietnam's.
 *
 * Coverage (the rendering, per test): the list's whole-catalog path, its first 144 cards (vi, en; the first dated program is
 * the 117th) and the first page at 375 px; the filtered list
 * for every university (vi) + one program per distinct collection day and for "none" (vi, en); the score-filter result
 * cards; compare: one program per university (an undated one where the university has any) + one per (university,
 * day) pair not yet covered, vi and en; analytics: the dataset line (vi, en) + every university in both downloads;
 * /roadmap: the 4 universities with roadmap data (vi), FPT in en, and an FPT course without a syllabus file.
 *
 * Messages are read inside the test bodies after a DOM check (AGENTS §12 v2.59 (d) / v2.68 (f)).
 */

const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (f: string) => JSON.parse(readFileSync(f, "utf8"))
type Locale = "vi" | "en"
type Prog = {
    id: string
    universityId: string
    universityName: string
    name: string
    code: string | null
    sourceUrl: string | null
    lastCrawled: string | null
    createdAt: string
}
type Uni = { id: string; code: string; name: string }
type Syllabus = { info: { lastSeenAt?: string | null } }

const messages: Record<Locale, Record<string, Record<string, unknown>>> = {
    vi: readJson(path.join(ROOT, "src", "messages", "vi.json")),
    en: readJson(path.join(ROOT, "src", "messages", "en.json")),
}
function msg(locale: Locale, ns: string, key: string): string {
    const m = messages[locale][ns]?.[key]
    if (typeof m !== "string" || m.length === 0) throw new Error(`missing message ${locale}.${ns}.${key}`)
    return m
}
const group = (n: number, locale: Locale) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, locale === "vi" ? "." : ",")
/** ICU placeholders as the page fills them: `{x}` as given, `{x, number}` grouped in the page locale. */
const fill = (s: string, vars: Record<string, string | number>, locale: Locale = "vi") =>
    s.replace(/\{(\w+)(?:,\s*number)?\}/g, (_, k) => (typeof vars[k] === "number" ? group(vars[k] as number, locale) : String(vars[k])))

const chunks: Prog[] = (readJson(path.join(MOCK, "index.json")).chunks as string[]).flatMap((f) => readJson(path.join(MOCK, "programs", f)))
const universities: Uni[] = readJson(path.join(MOCK, "universities.json"))
const uniName = (id: string) => universities.find((u) => u.id === id)!.name
const fileName = (code: string) => code.replace(/[^a-zA-Z0-9_\-]/g, "_")
const roadmapIndex = (uni: string): string[] => readJson(path.join(MOCK, "roadmaps", uni, "index.json"))
const roadmapOf = (uni: string, code: string): { subjectName?: string } => readJson(path.join(MOCK, "roadmaps", uni, `${fileName(code)}.json`))
const syllabusPath = (uni: string, code: string) => path.join(MOCK, "syllabuses", uni, `${fileName(code)}.json`)
const syllabusUnis = readdirSync(path.join(MOCK, "syllabuses"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
const roadmapUnis = readdirSync(path.join(MOCK, "roadmaps"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)

const vnDay = snapshotDay
const shown = shownDay
/** The program-level line (card, compare; FIX r1 panel MINOR 1): "<Thông tin ngành>: thu thập ngày D" / "…: … không ghi nhận". */
const collectedText = (locale: Locale, v: unknown) => {
    const d = vnDay(v)
    const what = msg(locale, "dataSource", "programInfo")
    return d
        ? fill(msg(locale, "dataSource", "collectedFor"), { what, date: shown(locale, d) })
        : fill(msg(locale, "dataSource", "collectedForNotRecorded"), { what })
}
const NOT_A_DATE = /Invalid Date|1970|NaN|undefined|null/

/** The analytics range of some programs, restated: earliest / latest Vietnam day and how many have no date. */
const rangeOf = (ps: Prog[]) => {
    const days = ps.map((p) => vnDay(p.lastCrawled)).filter((d): d is string => d !== null).sort()
    return { from: days[0] ?? null, to: days.at(-1) ?? null, missing: ps.length - days.length }
}

// The card's identity on screen: name | university | code (unique in the snapshot, v250).
const sig = (name: string, uni: string, code: string | null) => [name, uni, code ?? ""].join(" | ")
const bySig = new Map(chunks.map((p) => [sig(p.name, p.universityName, p.code), p]))
const valueKey = (p: Prog) => vnDay(p.lastCrawled) ?? "none"
const VALUES = [...new Set(chunks.map(valueKey))].sort()

type CardRow = { sig: string; date: string | null; hint: boolean; visible: boolean }
const cardRows = (page: Page): Promise<CardRow[]> =>
    page.getByTestId("program-card").evaluateAll((cards) =>
        cards.map((card) => {
            const h3 = card.querySelector("h3")
            const code = h3?.previousElementSibling?.querySelector(":scope > span.bg-muted")?.textContent ?? null
            const line = card.querySelector('[data-testid="program-card-collected"]') as HTMLElement | null
            return {
                sig: [h3?.textContent ?? "", card.querySelector("h3 + div > span")?.textContent ?? "", code ?? ""].join(" | "),
                date: line?.textContent ?? null,
                hint: card.querySelector('[data-testid="score-hint"]') !== null,
                visible: !!line && line.getBoundingClientRect().height > 0,
            }
        })
    )

/** DOM first: every card carries the date line; then each line = this spec's expectation for its program. */
function checkCards(rows: CardRow[], locale: Locale, where: string): Prog[] {
    expect(rows.length, `${where}: cards`).toBeGreaterThan(0)
    expect(rows.filter((r) => r.date === null).length, `${where}: cards without a collection-date line`).toBe(0)
    const progs = rows.map((r) => {
        const p = bySig.get(r.sig)
        expect(p, `${where}: card ${r.sig} is a snapshot program`).toBeTruthy()
        return p!
    })
    const wrong = rows
        .map((r, i) => ({ sig: r.sig, got: r.date!.trim(), want: collectedText(locale, progs[i].lastCrawled) }))
        .filter((x) => x.got !== x.want || NOT_A_DATE.test(x.got))
    expect(wrong, `${where}: card dates`).toEqual([])
    return progs
}

async function openList(page: Page, locale: Locale) {
    await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("program-card").first()).toBeVisible({ timeout: 30000 })
}
async function pickUniversity(page: Page, name: string) {
    // The filter's name is fixed (ProgramFilters aria-label) whatever is picked.
    await page.getByRole("combobox", { name: msg("vi", "programs", "allUniversities"), exact: true }).click()
    await page.getByRole("option", { name, exact: true }).click()
}
async function pickUniversityIn(page: Page, locale: Locale, name: string) {
    await page.getByRole("combobox", { name: msg(locale, "programs", "allUniversities"), exact: true }).click()
    await page.getByRole("option", { name, exact: true }).click()
}

async function download(page: Page, name: string) {
    // The page is prerendered: a click that lands before hydration starts no download, so click until one starts.
    let d: Download | undefined
    await expect(async () => {
        ;[d] = await Promise.all([page.waitForEvent("download", { timeout: 3_000 }), page.getByRole("button", { name }).click()])
    }).toPass({ timeout: 20_000 })
    return readFileSync(await d!.path(), "utf8")
}

test.describe("v2.73 — crawl date on the card, compare, analytics and roadmap", () => {
    // FIX r1 (panel MINOR 4): a browser zone where the data's +07:00 timestamps fall on another day (UTC moves only the 89
    // before 07:00; Los Angeles moves the 13:22 CTU ones of the first list pages and the bare index days too).
    test.use({ timezoneId: "America/Los_Angeles" })

    test("1. the app's date helper = the literal edge table and the snapshot's Vietnam days", async () => {
        const helperFile = path.join(ROOT, "src", "lib", "crawl-date.ts")
        expect(existsSync(helperFile), "src/lib/crawl-date.ts").toBe(true)
        // require (not import()): Playwright transpiles a required .ts file; a missing file fails this test only (as v258).
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { collectedDay, collectedIsoDay } = require(helperFile) as {
            collectedDay: (v: string | null | undefined, locale: string) => string | null
            collectedIsoDay: (v: string | null | undefined) => string | null
        }
        const syllabi = syllabusUnis.flatMap((u) =>
            readdirSync(path.join(MOCK, "syllabuses", u)).map((f) => (readJson(path.join(MOCK, "syllabuses", u, f)) as Syllabus).info?.lastSeenAt ?? null)
        )
        // Hand-written inputs, literal expectations (vi, en; null = none).
        const edgeWrong = EDGE_CASES.filter(([input, vi, en]) => collectedDay(input, "vi") !== vi || collectedDay(input, "en") !== en || collectedIsoDay(input) !== en).map(
            ([input, vi, en, why]) => `${JSON.stringify(input)} (${why}): ${JSON.stringify([collectedDay(input, "vi"), collectedDay(input, "en")])} ≠ ${JSON.stringify([vi, en])}`
        )
        expect(edgeWrong, `${edgeWrong.length} of ${EDGE_CASES.length} edge inputs`).toEqual([])
        // Every value the snapshot holds (snapshotDay throws on a shape it does not know).
        const values: (string | null)[] = [...chunks.map((p) => p.lastCrawled), ...syllabi]
        const wrong: string[] = []
        for (const v of values) {
            const want = vnDay(v)
            if (collectedIsoDay(v) !== want) wrong.push(`iso ${JSON.stringify(v)}: ${collectedIsoDay(v)} ≠ ${want}`)
            for (const l of ["vi", "en"] as Locale[]) {
                const got = collectedDay(v, l)
                if (got !== (want ? shown(l, want) : null)) wrong.push(`${l} ${JSON.stringify(v)}: ${got}`)
            }
        }
        expect(wrong.slice(0, 10), `${wrong.length} of ${values.length} values differ`).toEqual([])
        console.log(`[v273] helper = ${EDGE_CASES.length} literal edge cases + ${values.length} snapshot values (${chunks.length} lastCrawled, ${syllabi.length} lastSeenAt) × 2 locales`)
    })

    test("2. search-index.json: lastCrawled = the Vietnam day of each program's collection timestamp", () => {
        const { fields, values, rows } = readJson(path.join(MOCK, "search-index.json")) as { fields: string[]; values: Record<string, unknown[]>; rows: unknown[][] }
        expect(fields, "the list index carries the card's collection date").toContain("lastCrawled")
        const j = fields.indexOf("lastCrawled")
        expect(rows).toHaveLength(chunks.length)
        const wrong = rows
            .map((r, i) => ({ id: chunks[i].id, got: values.lastCrawled ? values.lastCrawled[r[j] as number] : r[j], want: vnDay(chunks[i].lastCrawled) }))
            .filter((x) => x.got !== x.want)
        expect(wrong.slice(0, 5), `${wrong.length} programs`).toEqual([])
        console.log(`[v273] search-index.json ${statSync(path.join(MOCK, "search-index.json")).size} B, lastCrawled values ${JSON.stringify(values.lastCrawled)}`)
    })

    test("3. analytics-snapshot.json: the collection range of the catalog and of each university = recomputation", () => {
        const snap = readJson(path.join(ROOT, "src", "lib", "analytics-snapshot.json"))
        expect(snap.collected, "the snapshot carries the catalog's collection range").toBeTruthy()
        const asRange = (c: { first: string | null; last: string | null; missing: number }) => ({ from: vnDay(c.first), to: vnDay(c.last), missing: c.missing })
        expect(asRange(snap.collected)).toEqual(rangeOf(chunks))
        // first/last are real timestamps of the catalog (kept as written), the earliest and the latest instant.
        const stamps = chunks.map((p) => p.lastCrawled).filter((v): v is string => typeof v === "string")
        expect(stamps).toContain(snap.collected.first)
        expect(stamps).toContain(snap.collected.last)
        for (const u of snap.universities as { code: string; collected: { first: string | null; last: string | null; missing: number } }[]) {
            const uni = universities.find((x) => x.code === u.code)!
            expect(asRange(u.collected), u.code).toEqual(rangeOf(chunks.filter((p) => p.universityId === uni.id)))
        }
        console.log(`[v273] catalog range ${JSON.stringify(rangeOf(chunks))}`)
    })

    test("4. list card, whole-catalog path (chunk rows, full timestamps): every card of the first 144 (12 loads), vi and en; 375 px fits", async ({ page }) => {
        test.setTimeout(240_000)
        // The first 116 programs in chunk order carry no lastCrawled: load until dated ones are on screen.
        const LOADED = 144
        expect(chunks.slice(0, LOADED).some((p) => vnDay(p.lastCrawled) !== null), "dated programs among the first loads").toBe(true)
        for (const locale of ["vi", "en"] as Locale[]) {
            await openList(page, locale)
            await expect(page.getByTestId("program-card")).toHaveCount(12, { timeout: 20000 })
            await expect(page.getByTestId("program-card").first().getByTestId("program-card-collected")).toHaveCount(1)
            const more = page.getByRole("button", { name: new RegExp(`^${msg(locale, "programs", "loadMore").split(" (")[0]} \\(`) })
            for (let n = 12; n < LOADED; n += 12) {
                await more.click()
                await expect(page.getByTestId("program-card")).toHaveCount(n + 12, { timeout: 20000 })
            }
            const progs = checkCards(await cardRows(page), locale, `${locale} first ${LOADED}`)
            expect(progs.some((p) => vnDay(p.lastCrawled) !== null), `${locale}: a dated program rendered from a full timestamp`).toBe(true)
            console.log(`[v273] ${locale} whole-catalog path: ${progs.length} cards, ${progs.filter((p) => vnDay(p.lastCrawled)).length} dated (${[...new Set(progs.map(valueKey))].join(",")})`)
        }
        await page.setViewportSize({ width: 375, height: 812 })
        await openList(page, "vi")
        await expect(page.getByTestId("program-card")).toHaveCount(12, { timeout: 20000 })
        const rows = await cardRows(page)
        checkCards(rows, "vi", "375 px")
        expect(rows.filter((r) => !r.visible).map((r) => r.sig), "375 px: a date line not laid out").toEqual([])
        const fits = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 1)
        expect(fits, "the list scrolls horizontally at 375 px").toBe(true)
        // One accessible name per card's buttons (v2.62 (c)): the date line adds none.
        const names = await page.getByTestId("program-card").evaluateAll((cards) => cards.map((c) => c.querySelector("button[aria-label]")?.getAttribute("aria-label") ?? ""))
        expect(new Set(names).size).toBe(names.length)
    })

    test("5. list card, search/filter path (search-index rows): every university (vi) and every distinct date incl. none (vi, en)", async ({ page }) => {
        test.setTimeout(300_000)
        await openList(page, "vi")
        const seen = new Set<string>()
        let checked = 0
        for (const u of universities) {
            const mine = chunks.filter((p) => p.universityId === u.id)
            if (mine.length === 0) continue
            await pickUniversity(page, u.name)
            await expect
                .poll(async () => {
                    const r = await cardRows(page)
                    return r.length === Math.min(12, mine.length) && r.every((x) => x.sig.split(" | ")[1] === u.name)
                }, { timeout: 20000, message: `${u.code}: the filtered first page` })
                .toBe(true)
            const progs = checkCards(await cardRows(page), "vi", `vi ${u.code}`)
            progs.forEach((p) => seen.add(valueKey(p)))
            checked += progs.length
        }
        // One program per distinct value, found by its name inside its university (vi + en).
        for (const locale of ["vi", "en"] as Locale[]) {
            await openList(page, locale)
            const wanted = locale === "vi" ? VALUES.filter((v) => !seen.has(v)) : VALUES
            for (const v of wanted) {
                const p = chunks.find((x) => valueKey(x) === v)!
                await pickUniversityIn(page, locale, uniName(p.universityId))
                await page.getByPlaceholder(msg(locale, "programs", "searchPlaceholder"), { exact: true }).fill(p.name)
                await expect
                    .poll(async () => (await cardRows(page)).some((r) => r.sig === sig(p.name, p.universityName, p.code)), { timeout: 20000, message: `${locale} ${v}: ${p.name}` })
                    .toBe(true)
                const row = (await cardRows(page)).find((r) => r.sig === sig(p.name, p.universityName, p.code))!
                checkCards([row], locale, `${locale} ${v}`)
                seen.add(v)
                checked++
            }
        }
        expect([...seen].sort(), "every distinct collection day and 'none' rendered").toEqual(VALUES)
        console.log(`[v273] filtered list: ${checked} cards checked, values ${VALUES.join(",")}`)
    })

    test("6. score-filter result cards carry the program's collection date", async ({ page }) => {
        await openList(page, "vi")
        await page.getByTestId("score-filter-input").fill("24")
        await page.getByRole("combobox", { name: /Thang điểm|Scale/i }).click()
        await page.getByRole("option", { name: "30", exact: true }).click()
        await expect(page.getByTestId("score-filter-result")).toBeVisible({ timeout: 60000 })
        await expect.poll(async () => (await cardRows(page)).filter((r) => r.hint).length, { timeout: 30000 }).toBeGreaterThan(0)
        const rows = (await cardRows(page)).filter((r) => r.hint)
        const progs = checkCards(rows, "vi", "score filter")
        // FIX r1 (panel MINOR 1): the line names what it dates — the program info — and is not part of the cutoff hint.
        const what = msg("vi", "dataSource", "programInfo")
        expect(rows.filter((r) => !r.date!.trim().startsWith(`${what}: `)).map((r) => r.sig), "a result card's date line without its subject").toEqual([])
        const insideHint = await page
            .getByTestId("program-card")
            .evaluateAll((cards) => cards.filter((c) => c.querySelector('[data-testid="score-hint"] [data-testid="program-card-collected"]')).length)
        expect(insideHint, "a date line inside the cutoff hint").toBe(0)
        console.log(`[v273] score filter: ${progs.length} result cards, values ${[...new Set(progs.map(valueKey))].join(",")}`)
    })

    test("7. compare: each column names its source and collection date — one program per university and per (university, day), vi and en", async ({ page }) => {
        test.setTimeout(300_000)
        const picks: Prog[] = []
        for (const u of universities) {
            const mine = chunks.filter((p) => p.universityId === u.id)
            if (mine.length === 0) continue
            picks.push(mine.find((p) => vnDay(p.lastCrawled) === null) ?? mine[0])
            for (const d of new Set(mine.map(valueKey))) if (!picks.some((p) => p.universityId === u.id && valueKey(p) === d)) picks.push(mine.find((p) => valueKey(p) === d)!)
        }
        expect(new Set(picks.map(valueKey)).size).toBe(VALUES.length)
        expect(picks.some((p) => isOwnLink(p)) && picks.some((p) => !isOwnLink(p)), "both source labels covered").toBe(true)
        const groups: Prog[][] = []
        for (let i = 0; i < picks.length; i += 3) groups.push(picks.slice(i, i + 3))
        for (const locale of ["vi", "en"] as Locale[]) {
            for (const [gi, g] of groups.entries()) {
                await page.goto(`/${locale}/compare?${g.map((p, i) => `${"abc"[i]}=${p.id}`).join("&")}`, { waitUntil: "domcontentloaded" })
                for (const [i, p] of g.entries()) {
                    const card = page.getByTestId(`compare-card-${i + 1}`)
                    await expect(card, p.id).toContainText(p.name, { timeout: 30000 })
                    const line = page.getByTestId(`compare-attribution-${i + 1}`)
                    await expect(line, `${locale} group ${gi} column ${i + 1}: the attribution line`).toHaveCount(1)
                    const host = new URL(p.sourceUrl!).hostname.replace(/^www\./, "")
                    const label = msg(locale, "programs", isOwnLink(p) ? "sourceUrl" : "sourceUrlCollected")
                    await expect(line, `${locale} ${p.id}`).toHaveText(`${label}: ${host} · ${collectedText(locale, p.lastCrawled)}`)
                    const link = line.getByRole("link", { name: host, exact: true })
                    await expect(link).toHaveAttribute("href", p.sourceUrl!)
                    // FIX r1 (panel MINOR 2, WCAG 1.4.1 / F73): the link is told apart from the muted text by more than its color.
                    expect(await link.evaluate((a) => getComputedStyle(a).textDecorationLine), `${locale} ${p.id}: link underline`).toContain("underline")
                }
            }
        }
        console.log(`[v273] compare: ${picks.length} programs (${groups.length} pages × 2 locales), values ${[...new Set(picks.map(valueKey))].join(",")}`)
    })

    test("8. analytics page: the catalog's collection range and the programs with no date, vi and en", async ({ page }) => {
        const r = rangeOf(chunks)
        for (const locale of ["vi", "en"] as Locale[]) {
            await page.goto(`/${locale}/analytics`, { waitUntil: "domcontentloaded" })
            const line = page.getByTestId("analytics-collected")
            // A wait shorter than the 30 s test timeout, so a slow run reports this assertion (FIX r1 NIT b).
            await expect(line, `${locale}: the collection line`).toHaveCount(1, { timeout: 20000 })
            await expect(line).toHaveText(
                fill(msg(locale, "analytics", "collectedRange"), { from: shown(locale, r.from!), to: shown(locale, r.to!), missing: r.missing, programs: chunks.length }, locale)
            )
            await expect(line).not.toContainText(NOT_A_DATE)
        }
        console.log(`[v273] analytics range ${r.from}..${r.to}, ${r.missing} of ${chunks.length} without a date`)
    })

    test("9. analytics downloads: the catalog's range in the JSON, every university's range in the JSON and the CSV", async ({ page }) => {
        await page.goto("/vi/analytics", { waitUntil: "domcontentloaded" })
        const j = JSON.parse(await download(page, msg("vi", "analytics", "exportJson")))
        const all = rangeOf(chunks)
        expect(j.dataCollected, "the JSON names when the data was collected").toEqual({ from: all.from, to: all.to, programsWithoutDate: all.missing })
        const want = (code: string) => rangeOf(chunks.filter((p) => p.universityId === universities.find((u) => u.code === code)!.id))
        for (const row of j.universityRankings as Record<string, unknown>[]) {
            const w = want(row.code as string)
            expect({ from: row.collectedFrom, to: row.collectedTo, missing: row.programsWithoutCollectedDate }, row.code as string).toEqual(w)
        }
        const csv = (await download(page, msg("vi", "analytics", "exportCsv"))).replace(/^\uFEFF/, "").split("\n")
        expect(csv[0].split(",")).toHaveLength(8)
        // The 3 new column labels, pinned (FIX r1 NIT c): the collection days, not the export time.
        expect(csv[0].split(",").slice(5)).toEqual(["Thu thập từ ngày", "Thu thập đến ngày", "Số ngành không ghi nhận ngày thu thập"])
        for (const l of csv.slice(1)) {
            const c = l.split(",")
            const w = want(c[0])
            expect(c.slice(5), c[0]).toEqual([w.from ?? "", w.to ?? "", String(w.missing)])
        }
        expect(csv.length - 1).toBe(j.universityRankings.length)
    })

    test("10. /roadmap: one labelled date per file shown — roadmap files none, the focus syllabus its own (4 universities, vi; FPT en; an FPT course without a syllabus)", async ({ page }) => {
        test.setTimeout(240_000)
        const FPT = "FPT"
        const DEFAULT_CODE = "SWE201c"
        const picker = (l: Locale) => page.getByLabel(msg(l, "roadmap", "universityLabel"), { exact: true })
        const banner = (name: string) => page.getByRole("heading", { level: 2, name, exact: true })
        const dateBox = page.getByTestId("data-attribution").getByTestId("data-attribution-date")
        const syllabusAt = (uni: string, code: string) =>
            syllabusUnis.includes(uni) && existsSync(syllabusPath(uni, code)) ? { at: (readJson(syllabusPath(uni, code)) as Syllabus).info?.lastSeenAt ?? null } : null
        const expected = (l: Locale, uni: string, code: string) => {
            const part = (what: string, at: unknown) => {
                const d = vnDay(at)
                return d ? fill(msg(l, "dataSource", "collectedFor"), { what, date: shown(l, d) }) : fill(msg(l, "dataSource", "collectedForNotRecorded"), { what })
            }
            const s = syllabusAt(uni, code)
            return [part(msg(l, "roadmap", "attributionRoadmap"), null), ...(s ? [part(fill(msg(l, "roadmap", "attributionSyllabus"), { code }), s.at)] : [])].join(" · ")
        }
        const open = async (l: Locale) => {
            await page.goto(`/${l}/roadmap`, { waitUntil: "domcontentloaded" })
            await expect(banner(roadmapOf(FPT, DEFAULT_CODE).subjectName!)).toBeVisible({ timeout: 30000 })
        }

        // DOM first (no message): the FPT default course's syllabus records a collection day, and the line shows it.
        const fptDay = vnDay(syllabusAt(FPT, DEFAULT_CODE)!.at)
        expect(fptDay, "the FPT default syllabus has a collection time").toBeTruthy()
        await open("vi")
        await expect(dateBox).toContainText(shown("vi", fptDay!), { timeout: 20000 })
        await expect(dateBox).toHaveText(expected("vi", FPT, DEFAULT_CODE))
        const covered = [`vi ${FPT} ${DEFAULT_CODE}`]
        for (const uni of roadmapUnis.filter((u) => u !== FPT)) {
            const code = roadmapIndex(uni)[0]
            await picker("vi").selectOption(uni)
            await expect(banner(roadmapOf(uni, code).subjectName!)).toBeVisible({ timeout: 20000 })
            await expect(dateBox, `${uni} ${code}`).toHaveText(expected("vi", uni, code), { timeout: 20000 })
            covered.push(`vi ${uni} ${code}${syllabusAt(uni, code) ? " (+syllabus)" : ""}`)
        }
        // An FPT course without a syllabus file: the roadmap part only.
        await open("vi")
        const bare = roadmapIndex(FPT).find((c) => !existsSync(syllabusPath(FPT, c)) && roadmapIndex(FPT).filter((x) => x.toLowerCase().includes(c.toLowerCase())).length <= 8)!
        const ph = msg("vi", "roadmap", "searchPlaceholder")
        await page.getByPlaceholder(ph, { exact: true }).fill(bare)
        await page.getByPlaceholder(ph, { exact: true }).locator("xpath=..").locator("div.absolute button").filter({ has: page.locator("span", { hasText: new RegExp(`^${bare}$`) }) }).click()
        await expect(banner(roadmapOf(FPT, bare).subjectName!)).toBeVisible({ timeout: 20000 })
        await expect(dateBox, `${FPT} ${bare}`).toHaveText(expected("vi", FPT, bare), { timeout: 20000 })
        covered.push(`vi ${FPT} ${bare} (no syllabus)`)
        await open("en")
        await expect(dateBox).toHaveText(expected("en", FPT, DEFAULT_CODE), { timeout: 20000 })
        covered.push(`en ${FPT} ${DEFAULT_CODE}`)
        await expect(dateBox).not.toContainText(NOT_A_DATE)
        console.log(`[v273] roadmap: ${covered.join(" | ")}`)
    })
})
