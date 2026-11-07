import { test, expect, Page } from "@playwright/test"
import { execFileSync } from "child_process"
import { cohortsOfCode, unknownShapes } from "./cohort-shapes"
import { readdirSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.68 — search without diacritics, /roadmap tone marks, cohort filter (audit A4: M9, M18, M44).
 *
 * - List and compare search: a query typed without diacritics, or with only some, finds every program the fully accented
 *   query finds; a letter typed with a diacritic must match it ("Hóa học" does not list "Khoa học").
 * - /roadmap course search: a query typed with diacritics lists the names containing it as typed before the names that
 *   match only once diacritics are dropped ("kinh tế vi mô" before "Kinh tế vĩ mô"); typed bare, the index order.
 * - Cohort filter: only the cohorts in the data the filter reads, each with its university and program count; a chosen
 *   cohort says how many programs carry no cohort code and are hidden.
 * - The dialog's course search and /materials search fold diacritics too.
 *
 * Every expectation is computed here from public/mock and src/messages at run time, with this spec's own rules — a
 * hand-made Vietnamese letter table, no Unicode decomposition, not the app's search-text.ts. Queries, roadmap cases and
 * programs are picked by shape (first in file order). Messages are read inside the tests. domcontentloaded, not
 * networkidle (AGENTS.md §12).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))

type Row = { id: string; name: string; code: string | null; universityName: string; universityId: string; createdAt: string }
type Uni = { id: string; code: string; name: string }
type Course = { courseName: string | null; courseCode: string | null }
type Material = { subjectCode: string; subjectName: string; subjectEnglish?: string | null; materials: { materialDescription: string; author?: string | null; publisher?: string | null; isbn?: string | null }[] }

// ---- the spec's own text rules ----
const LETTERS: Record<string, string> = {
    a: "aàáảãạăằắẳẵặâầấẩẫậ",
    e: "eèéẻẽẹêềếểễệ",
    i: "iìíỉĩị",
    o: "oòóỏõọôồốổỗộơờớởỡợ",
    u: "uùúủũụưừứửữự",
    y: "yỳýỷỹỵ",
    d: "dđ",
}
const BARE = new Map(Object.entries(LETTERS).flatMap(([b, all]) => [...all].map((c): [string, string] => [c, b])))
/** NFC, lower case, "_" and runs of white space as one space, trimmed. */
const tidy = (s: string | null | undefined) => String(s ?? "").normalize("NFC").toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim()
/** Every letter with a diacritic replaced by its bare letter (table above). */
const bare = (s: string | null | undefined) => [...tidy(s)].map((c) => BARE.get(c) ?? c).join("")
const hasMark = (s: string) => bare(s) !== tidy(s)
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/** The search rule: a letter typed bare matches it with any diacritic, every other character only itself. */
const reMemo = new Map<string, RegExp>()
function found(text: string | null | undefined, query: string) {
    if (!reMemo.has(query)) reMemo.set(query, new RegExp([...tidy(query)].map((c) => (LETTERS[c] ? `[${LETTERS[c]}]` : esc(c))).join("")))
    return reMemo.get(query)!.test(tidy(text))
}
const foldIncludes = (text: string | null | undefined, query: string) => bare(text).includes(bare(query))
const asTyped = (text: string | null | undefined, query: string) => tidy(text).includes(tidy(query))
/** The cohorts a program records: its code read by the specs' own shape table (e2e/cohort-shapes.ts), not the app's regex. */
const cohortsOf = (r: { code: string | null }) => cohortsOfCode(r.code)

// ---- data (read once per worker) ----
const memo = new Map<string, unknown>()
const once = <T>(key: string, read: () => T): T => {
    if (!memo.has(key)) memo.set(key, read())
    return memo.get(key) as T
}
const rows = () =>
    once("rows", () => {
        const { fields, values, rows: raw } = readJson(path.join(MOCK, "search-index.json")) as { fields: string[]; values: Record<string, unknown[]>; rows: unknown[][] }
        return raw.map((r) => Object.fromEntries(fields.map((f, i) => [f, values[f] ? values[f][r[i] as number] : r[i]])) as Row)
    })
const universities = () => once("unis", () => readJson(path.join(MOCK, "universities.json")) as Uni[])
const uniCode = (id: string) => universities().find((u) => u.id === id)?.code ?? "?"
const listMatches = (q: string) => rows().filter((p) => found(p.name, q) || found(p.code, q) || found(p.universityName, q))
const idSet = (xs: { id: string }[]) => xs.map((p) => p.id).sort().join(",")

/** A two-word phrase of a program name, with a diacritic: 13–36 programs, the same set typed bare (first by count, text). */
const phrase = () =>
    once("phrase", () => {
        const cands = [...new Set(rows().flatMap((p) => {
            const ws = tidy(p.name).split(" ")
            return ws.slice(1).map((w, i) => `${ws[i]} ${w}`).filter((q) => hasMark(q) && /^[\p{L} ]+$/u.test(q))
        }))]
        const ok = cands
            .map((q): [string, number] => [q, listMatches(q).length])
            .filter(([q, n]) => n >= 13 && n <= 36 && idSet(listMatches(bare(q))) === idSet(listMatches(q)))
            .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
        return ok[0]?.[0] ?? null
    })
/** A word of a program name with a diacritic whose bare form finds more programs (another word once folded): 1–36 typed,
 *  at most 300 bare, the largest gap. */
const preciseWord = () =>
    once("precise", () => {
        const ws = [...new Set(rows().flatMap((p) => tidy(p.name).split(/[^\p{L}]+/u)).filter((w) => w.length >= 3 && hasMark(w)))]
        const ok = ws
            .map((w): [string, number, number] => [w, listMatches(w).length, listMatches(bare(w)).length])
            .filter(([, a, b]) => a >= 1 && a <= 36 && b > a && b <= 300)
            .sort((x, y) => y[2] - y[1] - (x[2] - x[1]) || (x[0] < y[0] ? -1 : 1))
        return ok[0] ?? null
    })

// /roadmap: the names file the page reads (code → name) and the index order.
const ROADMAPS = path.join(MOCK, "roadmaps")
const roadmapUnis = () => readdirSync(ROADMAPS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
const indexOf = (uni: string): string[] => once(`index:${uni}`, () => readJson(path.join(ROADMAPS, uni, "index.json")))
const namesOf = (uni: string): Record<string, string> => once(`names:${uni}`, () => readJson(path.join(MOCK, "roadmap-names", `${uni}.json`)))
const CAP = 8
/** The /roadmap rule: codes containing the query, then — typed with diacritics — names as typed, then the folded-only names. */
function roadmapRule(uni: string, query: string): string[] {
    const q = query.trim().toLowerCase()
    const byCode = indexOf(uni).filter((c) => c.toLowerCase().includes(q))
    const byName = indexOf(uni).filter((c) => !c.toLowerCase().includes(q) && foldIncludes(namesOf(uni)[c], query))
    const ranked = hasMark(query) ? [...byName.filter((c) => asTyped(namesOf(uni)[c], query)), ...byName.filter((c) => !asTyped(namesOf(uni)[c], query))] : byName
    return [...byCode, ...ranked].slice(0, CAP)
}
/** Per university, the first course name (index order) that, typed as is, the index order lists after a folded-only name. */
const roadmapCases = () =>
    once("roadmapCases", () =>
        roadmapUnis().flatMap((uni) => {
            for (const code of indexOf(uni)) {
                const q = tidy(namesOf(uni)[code])
                if (!q || !hasMark(q) || indexOf(uni).some((c) => c.toLowerCase().includes(q))) continue
                const loose = indexOf(uni).filter((c) => foldIncludes(namesOf(uni)[c], q)).slice(0, CAP)
                if (JSON.stringify(loose) !== JSON.stringify(roadmapRule(uni, q))) return [{ uni, q, indexOrder: loose }]
            }
            return []
        })
    )

// Cohorts by the rule over the rows the filter reads.
const cohorts = () =>
    once("cohorts", () => {
        const by = new Map<string, { id: string; programs: number; universities: Set<string> }>()
        let withCohort = 0
        const unis = new Set<string>()
        for (const p of rows()) {
            const cs = cohortsOf(p)
            if (cs.length === 0) continue
            withCohort++
            unis.add(uniCode(p.universityId))
            for (const id of cs) {
                const c = by.get(id) ?? { id, programs: 0, universities: new Set<string>() }
                c.programs++
                c.universities.add(uniCode(p.universityId))
                by.set(id, c)
            }
        }
        return {
            programs: rows().length,
            withCohort,
            universities: [...unis].sort(),
            cohorts: [...by.values()].sort((a, b) => Number(b.id.slice(1)) - Number(a.id.slice(1))).map((c) => ({ id: c.id, programs: c.programs, universities: [...c.universities].sort() })),
        }
    })

// ---- messages: read inside the tests, a missing key fails the test that needs it ----
type Locale = "vi" | "en"
function msg(ns: string, key: string, l: Locale = "vi"): string {
    const v = (readJson(path.join(ROOT, "src", "messages", `${l}.json`)) as Record<string, Record<string, string>>)[ns]?.[key]
    expect(typeof v === "string" && v.length > 0, `message ${l}.${ns}.${key}`).toBe(true)
    return v as string
}
/** ICU as these messages use it: `{k, number}`, `{k, plural, one {…} other {…}}` with `#`, plain `{k}`. */
function icu(s: string, vars: Record<string, string | number>, l: Locale = "vi") {
    const nf = new Intl.NumberFormat(l)
    const rules = new Intl.PluralRules(l)
    return s
        .replace(/\{(\w+), plural, one \{([^{}]*)\} other \{([^{}]*)\}\}/g, (_, k: string, one: string, other: string) =>
            (rules.select(Number(vars[k])) === "one" ? one : other).replace(/#/g, nf.format(Number(vars[k])))
        )
        .replace(/\{(\w+), number\}/g, (_, k: string) => nf.format(Number(vars[k])))
        .replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k]))
}

// ---- page helpers ----
async function openList(page: Page) {
    await page.goto("/vi", { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("program-card").first()).toBeVisible({ timeout: 30000 })
}
const showingRe = () =>
    new RegExp("^" + esc(msg("programs", "showingCount")).replace(esc("<strong>{shown}</strong>"), "(\\d+)").replace(esc("<strong>{total}</strong>"), "(\\d+)") + "$")
async function listTotal(page: Page): Promise<number | null> {
    const re = showingRe()
    const text = await page.getByText(re).first().textContent({ timeout: 1000 }).catch(() => null)
    const m = text ? re.exec(text.trim()) : null
    return m ? Number(m[2]) : null
}
/** The cards on screen: [name, university, code] (the v250 signature, unique in the snapshot). */
const cardSigs = (page: Page) =>
    page.getByTestId("program-card").evaluateAll((cards) =>
        cards.map((card) => {
            const h3 = card.querySelector("h3")
            return [h3?.textContent ?? "", card.querySelector("h3 + div > span")?.textContent ?? "", h3?.previousElementSibling?.querySelector(":scope > span.bg-muted")?.textContent ?? null].join(" | ")
        })
    )
const sigOf = (p: Row) => [p.name, p.universityName, p.code].join(" | ")
/** Clears the list search (back to the whole catalog, so no earlier result can pass for this one), types `q` and waits
 *  until the list shows `total` programs (or the empty state for 0). */
async function listSearch(page: Page, q: string, total: number) {
    const box = page.getByPlaceholder(msg("programs", "searchPlaceholder"), { exact: true })
    await box.fill("")
    await expect.poll(() => listTotal(page), { message: "the whole catalog before a new query", timeout: 20000 }).toBe(rows().length)
    await box.fill(q)
    if (total === 0) {
        await expect(page.getByRole("heading", { name: msg("programs", "emptyTitle"), exact: true }), `"${q}" finds nothing`).toBeVisible({ timeout: 20000 })
        return
    }
    await expect.poll(() => listTotal(page), { message: `"${q}" → ${total} programs`, timeout: 20000 }).toBe(total)
}
const cohortBox = (page: Page) => page.getByRole("combobox", { name: msg("programs", "cohortAria"), exact: true })

test.describe("v2.68 — search without diacritics, /roadmap tone marks, cohort filter", () => {
    test.describe.configure({ timeout: 180000 })

    test("list: typed bare or partly accented, a query finds what it finds fully accented; a typed diacritic must match", async ({ page }) => {
        const p = phrase()
        const w = preciseWord()
        console.log(`[v268] phrase "${p}" ${p ? listMatches(p).length : 0} programs; precise word ${JSON.stringify(w)}`)
        expect(p, "a two-word phrase with a diacritic, 13–36 programs").not.toBeNull()
        expect(w, "a word whose bare form also finds other words").not.toBeNull()
        const want = listMatches(p!)
        const partly = [tidy(p).split(" ")[0], ...bare(p).split(" ").slice(1)].join(" ")
        expect(hasMark(partly) && partly !== tidy(p) && partly !== bare(p), `"${partly}" is partly accented`).toBe(true)
        expect(idSet(listMatches(partly))).toBe(idSet(want))

        await openList(page)
        await listSearch(page, p!, want.length)
        const firstPage = await cardSigs(page)
        expect(firstPage.length).toBe(Math.min(12, want.length))
        for (const s of firstPage) expect(want.map(sigOf), `card ${s} matches "${p}"`).toContain(s)
        for (const q of [bare(p), partly, bare(p).toUpperCase()]) {
            await listSearch(page, q, want.length)
            await expect.poll(() => cardSigs(page), { message: `"${q}" shows the same first page as "${p}"` }).toEqual(firstPage)
        }
        // The typed diacritic is kept: the accented word finds its own programs only, the bare word also the others.
        const [word, typedCount, bareCount] = w!
        expect(typedCount).toBe(listMatches(word).length)
        await listSearch(page, word, typedCount)
        await listSearch(page, bare(word), bareCount)
    })

    test("compare: a slot search typed bare lists every program the accented query matches", async ({ page }) => {
        const p = phrase()
        expect(p).not.toBeNull()
        const want = listMatches(bare(p!))
        expect(idSet(want)).toBe(idSet(listMatches(p!)))
        const [a, b] = rows().filter((r) => !want.some((x) => x.id === r.id))
        await page.goto(`/vi/compare?a=${a.id}&b=${b.id}`, { waitUntil: "domcontentloaded" })
        const select2 = page.locator("select").nth(1)
        await expect(select2).toHaveValue(b.id, { timeout: 30000 })
        const label = msg("programs", "compareSearchLabel").replace("{slot}", msg("programs", "compareProgram2"))
        await page.getByRole("searchbox", { name: label, exact: true }).fill(bare(p!))
        const options = select2.locator("option:not([disabled])")
        // Every match + the slot's current program, kept.
        await expect(options, `"${bare(p!)}" → ${want.length} matches + the current program`).toHaveCount(want.length + 1, { timeout: 20000 })
        const values = await options.evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).sort())
        expect(values).toEqual([...want.map((x) => x.id), b.id].sort())
        await expect(page.getByTestId("compare-search-empty-2")).toHaveCount(0)
        await expect(select2).toHaveValue(b.id)
    })

    test("/roadmap: typed with diacritics, the names as typed come first; typed bare, the index order", async ({ page }) => {
        const cases = roadmapCases()
        for (const c of cases) console.log(`[v268] /roadmap ${c.uni} "${c.q}": index order ${c.indexOrder.join(" ")} → ${roadmapRule(c.uni, c.q).join(" ")}`)
        expect(cases.length, "a university with a course name listed after a folded-only name in index order").toBeGreaterThanOrEqual(1)
        const placeholder = (uni: string) => msg("roadmap", uni === "FPT" ? "searchPlaceholder" : "searchPlaceholderCode")
        await page.goto("/vi/roadmap", { waitUntil: "domcontentloaded" })
        const picker = page.getByLabel(msg("roadmap", "universityLabel"), { exact: true })
        await expect(picker.locator("option")).toHaveCount(universities().length, { timeout: 30000 })
        for (const c of cases) {
            if ((await picker.inputValue()) !== c.uni) await picker.selectOption(c.uni)
            const box = page.getByPlaceholder(placeholder(c.uni), { exact: true })
            await expect(box).toBeVisible({ timeout: 20000 })
            const rowsOf = () => box.locator("xpath=..").locator("div.absolute button")
            for (const [q, want] of [
                [c.q, roadmapRule(c.uni, c.q)],
                [bare(c.q), c.indexOrder],
            ] as const) {
                await box.fill(q)
                await expect(rowsOf(), `${c.uni} "${q}": ${want.length} suggestions`).toHaveCount(want.length, { timeout: 20000 })
                for (const [i, code] of want.entries())
                    await expect(rowsOf().nth(i).locator("span", { hasText: new RegExp(`^${esc(code)}$`) }), `${c.uni} "${q}" #${i + 1} is ${code}`).toHaveCount(1)
            }
            await box.fill("")
        }
    })

    test("cohort filter: only the cohorts in the data, with university and count; a chosen cohort says what it hides", async ({ page }) => {
        const C = cohorts()
        expect(unknownShapes, "every program code is a known shape").toEqual([])
        // "K" + 2 digits followed by another digit is an admission code (e.g. TDTU K7340101L), never an option.
        const admission = rows().filter((p) => /k\d{3}/i.test(`${p.code ?? ""} ${p.name}`) && cohortsOf(p).length === 0)
        console.log(`[v268] cohorts ${C.cohorts.map((c) => `${c.id} ${c.universities.join("+")} ${c.programs}`).join(", ")}; ${C.withCohort}/${C.programs} programs carry one; admission-code K-prefixes skipped: ${admission.length} (${[...new Set(admission.map((p) => uniCode(p.universityId)))].join(", ")})`)
        expect(C.cohorts.length).toBeGreaterThan(0)
        const all = msg("programs", "cohortAll")
        const badge = msg("programs", "cohortBadge")
        // Messages new in v2.68 are read only after the DOM checks of the cohorts offered and of each one's programs
        // (a tree without them then fails on what it shows, not on a missing key — §12 v2.59 (d)).
        const label = (c: (typeof C.cohorts)[number]) =>
            `${badge.replace("{id}", c.id)} (${icu(msg("programs", "cohortOptionDetail"), { universities: c.universities.join(", "), count: c.programs })})`
        const notice = () =>
            icu(msg("programs", "cohortNotice"), { withCohort: C.withCohort, total: C.programs, without: C.programs - C.withCohort, universities: C.universities.join(", ") })

        await openList(page)
        await cohortBox(page).click()
        const options = page.getByRole("listbox").getByRole("option")
        // The cohorts offered (the K-number of every option after "all") are exactly the data's.
        await expect.poll(async () => (await options.allTextContents()).slice(1).map((t) => /K\d{2}/.exec(t)?.[0] ?? t)).toEqual(C.cohorts.map((c) => c.id))
        await page.keyboard.press("Escape")
        for (const c of C.cohorts) {
            expect(c.programs).toBeGreaterThan(0)
            await cohortBox(page).click()
            await page.getByRole("option", { name: new RegExp(`^${esc(badge.replace("{id}", c.id))} \\(`) }).click()
            // The total and every card on screen are this cohort's (two cohorts can share a total).
            const carries = (sig: string) => cohortsOfCode(sig.split(" | ")[2] || null).includes(c.id)
            await expect
                .poll(async () => ({ total: await listTotal(page), other: (await cardSigs(page)).filter((s) => !carries(s)) }), {
                    message: `${c.id} → ${c.programs} programs, every card carrying ${c.id}`,
                    timeout: 20000,
                })
                .toEqual({ total: c.programs, other: [] })
            await expect(cohortBox(page)).toHaveText(label(c))
            await expect(page.getByTestId("cohort-notice")).toHaveText(notice())
        }
        await cohortBox(page).click()
        await expect(options).toHaveText([all, ...C.cohorts.map(label)])
        await page.getByRole("option", { name: all, exact: true }).click()
        await expect(cohortBox(page)).toHaveText(all)
        await expect(page.getByTestId("cohort-notice")).toHaveCount(0)
        await expect.poll(() => listTotal(page), { timeout: 20000 }).toBe(C.programs)
    })

    test("drift: src/lib/cohort-options.json is what scripts/build-cohort-options.mjs builds, and the cohorts recomputed here", () => {
        let out = ""
        try {
            out = execFileSync(process.execPath, [path.join("scripts", "build-cohort-options.mjs"), "--check"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" })
        } catch (e) {
            const err = e as { stderr?: string; message: string }
            throw new Error(`build-cohort-options.mjs --check failed: ${err.stderr || err.message}`)
        }
        expect(out).toContain("matches public/mock")
        const own = cohorts()
        expect(unknownShapes, "every program code is a known shape").toEqual([])
        expect(readJson(path.join(ROOT, "src", "lib", "cohort-options.json"))).toEqual(own)
    })

    test("dialog course search and /materials: a course name typed bare finds the course", async ({ page }) => {
        // The first program (curricula file order) with a course name with a diacritic that, typed bare, narrows its list.
        let pick: { id: string; name: string; q: string; shown: number; total: number } | null = null
        for (const f of readdirSync(path.join(MOCK, "curricula")).sort()) {
            const id = f.replace(/\.json$/, "")
            const row = rows().find((r) => r.id === id)
            if (!row) continue
            const courses: Course[] = readJson(path.join(MOCK, "curricula", f))
            const c = courses.find((x) => hasMark(x.courseName ?? ""))
            if (!c) continue
            const q = bare(c.courseName)
            const shown = courses.filter((x) => found(x.courseName, q) || found(x.courseCode, q)).length
            if (shown >= 1 && shown < courses.length) {
                pick = { id, name: row.name, q, shown, total: courses.length }
                break
            }
        }
        const materials: Material[] = readJson(path.join(MOCK, "materials", "FPT.json"))
        const matchesMaterial = (m: Material, q: string) =>
            [m.subjectCode, m.subjectName, m.subjectEnglish].some((t) => found(t, q)) ||
            m.materials.some((x) => [x.materialDescription, x.author, x.publisher, x.isbn].some((t) => found(t, q)))
        const subject = materials
            .map((m) => ({ m, q: bare(m.subjectName.split("_").pop()) }))
            .find(({ m, q }) => hasMark(m.subjectName.split("_").pop() ?? "") && materials.filter((x) => matchesMaterial(x, q)).length === 1)
        console.log(`[v268] dialog ${pick?.id} "${pick?.q}" ${pick?.shown}/${pick?.total}; /materials ${subject?.m.subjectCode} "${subject?.q}"`)
        expect(pick).not.toBeNull()
        expect(subject).toBeTruthy()

        await page.goto(`/vi?program=${pick!.id}`, { waitUntil: "domcontentloaded" })
        const dialog = page.getByRole("dialog", { name: pick!.name, exact: true })
        await expect(dialog).toBeVisible({ timeout: 30000 })
        await dialog.getByRole("tab", { name: msg("programs", "curriculumTab"), exact: true }).click()
        await expect(dialog.locator("tbody tr").first()).toBeVisible({ timeout: 20000 })
        await dialog.getByPlaceholder(msg("programs", "courseSearchPlaceholder"), { exact: true }).fill(pick!.q)
        const count = (shown: number) => icu(msg("programs", "coursesCount"), { shown, total: pick!.total })
        // Soft: on a tree without the fix both halves fail, each for its own reason (the before-change log shows both).
        await expect.soft(dialog.getByText(count(pick!.shown), { exact: true }), `dialog "${pick!.q}" → ${pick!.shown} / ${pick!.total}`).toBeVisible({ timeout: 15000 })

        await page.goto("/vi/materials", { waitUntil: "domcontentloaded" })
        const syllabusButton = page.getByRole("button", { name: msg("materials", "syllabus"), exact: true })
        await expect(syllabusButton.first()).toBeVisible({ timeout: 30000 })
        await page.getByPlaceholder(msg("materials", "searchPlaceholder"), { exact: true }).fill(subject!.q)
        await expect.soft(syllabusButton, `/materials "${subject!.q}" → 1 subject`).toHaveCount(1, { timeout: 15000 })
        await expect.soft(page.getByText(subject!.m.subjectCode, { exact: true }), `/materials shows ${subject!.m.subjectCode}`).toBeVisible()
    })
})
