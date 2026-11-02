import { test, expect, type APIRequestContext, type Page } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"

/**
 * v2.60 — program page: admissions, share preview, links (audit V6).
 *
 * `/<locale>/programs/<id>` prints, in the HTML as sent (no JavaScript), the admissions rows the detail dialog
 * shows for the program: scores only in the newest year of each method (method codes compared without a
 * trailing "_<year>"), the program's own rows and the school/group rows apart; every quota and tuition row the
 * dialog lists; each with its source host as a link. It carries a share preview (og/twitter tags from its own
 * title, og:url = canonical) and one JSON-LD block of the facts it prints; other routes get the site defaults.
 * The dialog links to the page and its copy-link writes the page's URL.
 *
 * Fixtures come from public/mock at test time, by rule, in catalog chunk order (DONE.md v2.60 D7):
 * P1 = a program-scope cutoff bound to it, own scores over >= 2 years and >= 2 methods with >= 1 row dropped by
 * the newest-year rule, a bound quota and a tuition row; P2 = no own program-scope score but >= 1 score shown;
 * P3 = nothing shown. Expected rows are derived here from admissions/<UNI>.json with the contract's rules and
 * formatted as the helpers do (Intl, page locale); labels come from src/messages, read inside each test.
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
type Locale = "vi" | "en"
const messages = { vi: readJson(path.join(ROOT, "src", "messages", "vi.json")), en: readJson(path.join(ROOT, "src", "messages", "en.json")) }
/** A message that must exist (a missing key never passes as `undefined === undefined`). */
const msg = (locale: Locale, ns: string, key: string): string => {
    const v = messages[locale]?.[ns]?.[key]
    expect(typeof v === "string" && v.length > 0, `missing message ${locale}.${ns}.${key}`).toBe(true)
    return v as string
}

type Program = { id: string; name: string; universityId: string; universityName: string; code: string | null; degreeType: string | null; credits: number | null }
type Score = { programId: string | null; year: number; method: string | null; methodLabel: string | null; scope: string; scopeLabel: string | null; score: number | null; scale: number | null; kind: string; comboNote: string | null; sourceUrl: string | null; publishedAt: string | null }
type Quota = { programId: string | null; year: number; scope: string; scopeLabel: string | null; quota: number | null; sourceUrl: string | null; publishedAt: string | null }
type Tuition = { programId: string | null; academicYear: string | null; amount: number | null; minAmount: number | null; maxAmount: number | null; currency: string; basis: string; appliesTo: string | null; notes: string | null; sourceUrl: string | null; publishedAt: string | null }
type Admissions = { scores: Score[]; quotas: Quota[]; tuitions: Tuition[] }

const index = readJson(path.join(MOCK, "index.json"))
const listed: { id: string }[] = (index.chunks as string[]).flatMap((c) => readJson(path.join(MOCK, "programs", c)))
const program = (id: string): Program => readJson(path.join(MOCK, "programs-by-id", `${id}.json`))
const codeOf = new Map((readJson(path.join(MOCK, "universities.json")) as { id: string; code: string }[]).map((u) => [u.id, u.code]))
const admissionFiles = new Map<string, Admissions>()
const admissionsOf = (p: Program): Admissions => {
    const code = codeOf.get(p.universityId)!
    if (!admissionFiles.has(code)) admissionFiles.set(code, readJson(path.join(MOCK, "admissions", `${code}.json`)))
    return admissionFiles.get(code)!
}

// --- the contract's rules (DONE.md v2.60 D1) ---
const methodOf = (s: Score) => {
    const m = s.method ?? ""
    return m.endsWith(`_${s.year}`) ? m.slice(0, -`_${s.year}`.length) : m
}
const newestPerMethod = (rows: Score[]) => {
    const newest = new Map<string, number>()
    for (const s of rows) newest.set(methodOf(s), Math.max(newest.get(methodOf(s)) ?? -Infinity, s.year))
    return rows.filter((s) => s.year === newest.get(methodOf(s)))
}
const rowsOf = (p: Program) => {
    const a = admissionsOf(p)
    const ownScores = a.scores.filter((s) => s.programId === p.id)
    const contextScores = a.scores.filter((s) => s.programId === null && s.scope !== "program")
    return {
        ownScores,
        contextScores,
        quotas: [...a.quotas.filter((q) => q.programId === p.id), ...a.quotas.filter((q) => q.programId === null && q.scope !== "program")],
        tuitions: [...a.tuitions.filter((x) => x.programId === p.id), ...a.tuitions.filter((x) => x.programId === null)],
    }
}
const programs = listed.map((l) => program(l.id))
const P1 = programs.find((p) => {
    const r = rowsOf(p)
    return (
        r.ownScores.some((s) => s.scope === "program" && s.kind === "cutoff") &&
        new Set(r.ownScores.map((s) => s.year)).size >= 2 &&
        new Set(newestPerMethod(r.ownScores).map(methodOf)).size >= 2 &&
        newestPerMethod(r.ownScores).length < r.ownScores.length &&
        r.quotas.some((q) => q.programId === p.id) &&
        r.tuitions.length > 0
    )
})
const P2 = programs.find((p) => {
    const r = rowsOf(p)
    return !r.ownScores.some((s) => s.scope === "program") && r.ownScores.length + r.contextScores.length > 0
})
const P3 = programs.find((p) => Object.values(rowsOf(p)).every((rows) => rows.length === 0))

// --- display, as the helpers print it ---
const num = (v: number, locale: Locale) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v)
const host = (url: string) => new URL(url).hostname.replace(/^www\./, "")
/** Only an absolute http(s) URL becomes a link (the v2.58 rule). */
const safeUrl = (u: string | null) => {
    if (!u) return null
    try {
        return ["http:", "https:"].includes(new URL(u).protocol) ? u : null
    } catch {
        return null
    }
}
const VN_DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" })
const isoDate = (v: string | null) => {
    const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!v || !m) return null
    return /(Z|[+-]\d{2}:?\d{2})$/i.test(v) ? VN_DATE.format(new Date(v)) : `${m[3]}/${m[2]}/${m[1]}`
}
const money = (a: number, currency: string) => new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(a)
const scopeText = (l: Locale, scope: string, label: string | null) => {
    const base = msg(l, "programs", scope === "campus" ? "admissionScopeCampus" : scope === "group" ? "admissionScopeGroup" : scope === "school" ? "admissionScopeSchool" : "admissionScopeProgram")
    if (!label) return base
    if (label.trim().toLowerCase() === base.trim().toLowerCase()) return label
    return scope === "campus" ? `${base} ${label}` : `${base}: ${label}`
}
const provenance = (l: Locale, r: { sourceUrl: string | null; publishedAt: string | null }) => [
    safeUrl(r.sourceUrl) ? `${msg(l, "programs", "admissionSourceLabel")}: ${host(r.sourceUrl!)}` : msg(l, "programs", "admissionNoSource"),
    isoDate(r.publishedAt) ? `${msg(l, "programs", "admissionPublishedLabel")}: ${isoDate(r.publishedAt)}` : null,
]
const norm = (s: string) => s.replace(/\s+/g, " ").trim()
const line = (parts: (string | null | undefined)[]) => norm(parts.filter((x) => x).join(" "))
const scoreRow = (l: Locale, s: Score) => [
    line([
        `${s.score == null ? "—" : num(s.score, l)}${s.scale != null ? ` / ${num(s.scale, l)}` : ""}`,
        msg(l, "programs", s.kind === "floor" ? "admissionKindFloor" : s.kind === "converted" ? "admissionKindConverted" : "admissionKindCutoff"),
        String(s.year),
        s.scope !== "program" || s.scopeLabel ? scopeText(l, s.scope, s.scopeLabel) : null,
        s.methodLabel,
        s.comboNote,
        ...provenance(l, s),
    ]),
    safeUrl(s.sourceUrl) ?? "",
]
const quotaRow = (l: Locale, q: Quota) => [
    line([
        q.quota == null ? "—" : num(q.quota, l),
        msg(l, "programs", "admissionQuotaUnit"),
        scopeText(l, q.scope, q.scopeLabel),
        String(q.year),
        q.scope !== "program" ? msg(l, "programs", "admissionQuotaScopedNote") : null,
        ...provenance(l, q),
    ]),
    safeUrl(q.sourceUrl) ?? "",
]
const BASIS: Record<string, string> = { per_credit: "tuitionBasisPerCredit", per_semester: "tuitionBasisPerSemester", per_year: "tuitionBasisPerYear", per_program: "tuitionBasisPerProgram" }
const tuitionRow = (l: Locale, x: Tuition) => {
    const amount =
        x.amount != null
            ? money(x.amount, x.currency)
            : x.minAmount != null && x.maxAmount != null
              ? `${money(x.minAmount, x.currency)} – ${money(x.maxAmount, x.currency)}`
              : x.minAmount != null
                ? `≥ ${money(x.minAmount, x.currency)}`
                : x.maxAmount != null
                  ? `≤ ${money(x.maxAmount, x.currency)}`
                  : null
    return [
        line([
            amount ? (x.basis ? `${amount} ${Object.hasOwn(BASIS, x.basis) ? msg(l, "programs", BASIS[x.basis]) : x.basis}` : amount) : "—",
            x.academicYear ? `${msg(l, "programs", "admissionAcademicYear")}: ${x.academicYear}` : null,
            x.programId === null ? msg(l, "programs", "admissionScopeSchool") : null,
            x.appliesTo ? `${msg(l, "programs", "admissionAppliesTo")}: ${x.appliesTo}` : null,
            x.notes,
            ...provenance(l, x),
        ]),
        safeUrl(x.sourceUrl) ?? "",
    ]
}
const sorted = (rows: string[][]) => [...rows].sort((a, b) => (a.join("\n") < b.join("\n") ? -1 : a.join("\n") > b.join("\n") ? 1 : 0))

// --- raw-HTML helpers (no JavaScript, no DOM), as in v252 ---
const decode = (s: string) =>
    s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&")
const textOf = (html: string) => norm(decode(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ")))
const attrsOf = (html: string, tag: string) =>
    [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))].map((m) =>
        Object.fromEntries([...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1].toLowerCase(), decode(a[2])]))
    )
const titleOf = (html: string) => {
    const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => decode(m[1]))
    expect(titles, "exactly one <title>").toHaveLength(1)
    return titles[0]
}
const metaName = (html: string, name: string) => attrsOf(html, "meta").filter((a) => a.name === name).map((a) => a.content)
const metaProp = (html: string, prop: string) => attrsOf(html, "meta").filter((a) => a.property === prop).map((a) => a.content)
const canonicalOf = (html: string) => attrsOf(html, "link").filter((a) => a.rel === "canonical").map((a) => a.href)
const jsonLdOf = (html: string) =>
    [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
const sectionOf = (html: string) => {
    const m = html.match(/<section\b[^>]*data-testid="program-admissions"[^>]*>([\s\S]*?)<\/section>/)
    expect(m, "the admissions section of the program page").not.toBeNull()
    return m![1]
}
/** [text, href] of every <li> of the list `testId`; [] when the page has no such list. */
const itemsOf = (section: string, testId: string) => {
    const m = section.match(new RegExp(`<ul\\b[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</ul>`))
    if (!m) return []
    return [...m[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((li) => [textOf(li[1]), attrsOf(li[1], "a").map((a) => a.href).join(" ")])
}

async function getHtml(request: APIRequestContext, url: string) {
    const res = await request.get(url, { maxRedirects: 0 })
    expect(res.status(), url).toBe(200)
    return res.text()
}

const dialogNamed = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

test.describe("v2.60 — program page: admissions, share preview, links", () => {
    test.describe.configure({ timeout: 90000 })

    const cases: [string, () => Program | undefined, Locale][] = [
        ["P1 own program-scope cutoffs", () => P1, "vi"],
        ["P1 own program-scope cutoffs", () => P1, "en"],
        ["P2 only school/group thresholds", () => P2, "vi"],
    ]
    for (const [label, pick, l] of cases) {
        test(`${l}: ${label} — the page holds exactly the dialog's rows (newest year per method), formatted, with source links`, async ({ request }) => {
            const p = pick()
            expect(p, label).toBeTruthy()
            const r = rowsOf(p!)
            const own = newestPerMethod(r.ownScores)
            const context = newestPerMethod(r.contextScores)
            if (p === P1) expect(own.length, "P1: the newest-year rule drops a row").toBeLessThan(r.ownScores.length)
            if (p === P2) expect(context.length + own.length).toBeGreaterThan(0)

            const html = await getHtml(request, `/${l}/programs/${p!.id}`)
            const section = sectionOf(html)
            expect(sorted(itemsOf(section, "admission-scores-own")), "own scores").toEqual(sorted(own.map((s) => scoreRow(l, s))))
            expect(sorted(itemsOf(section, "admission-scores-context")), "school/group scores").toEqual(sorted(context.map((s) => scoreRow(l, s))))
            expect(sorted(itemsOf(section, "admission-quotas")), "quotas").toEqual(sorted(r.quotas.map((q) => quotaRow(l, q))))
            expect(sorted(itemsOf(section, "admission-tuition")), "tuition").toEqual(sorted(r.tuitions.map((x) => tuitionRow(l, x))))
            expect(textOf(section)).toContain(msg(l, "programs", "admissionsWarning"))
            if (context.length > 0) expect(textOf(section)).toContain(msg(l, "programs", "admissionContextTitle"))
        })
    }

    test("vi: P3 with no admissions data shows the dialog's empty text and no admissions number", async ({ request }) => {
        expect(P3, "P3").toBeTruthy()
        const section = sectionOf(await getHtml(request, `/vi/programs/${P3!.id}`))
        expect(textOf(section)).toBe(`${msg("vi", "programs", "admissionsTitleNoYear")} ${msg("vi", "programs", "noAdmissions")}`)
        expect(section).not.toMatch(/<li\b/)
        expect(textOf(section)).not.toMatch(/\d/)
    })

    test("share preview + JSON-LD on program pages (vi + en)", async ({ request }) => {
        for (const p of [P1, P2, P3]) {
            expect(p).toBeTruthy()
            for (const l of ["vi", "en"] as Locale[]) {
                const url = `/${l}/programs/${p!.id}`
                const html = await getHtml(request, url)
                const title = titleOf(html)
                const [canonical] = canonicalOf(html)
                expect(canonical, url).toMatch(new RegExp(`/${l}/programs/${p!.id}$`))
                expect(metaProp(html, "og:title"), url).toEqual([title])
                expect(metaProp(html, "og:url"), url).toEqual([canonical])
                expect(metaProp(html, "og:site_name"), url).toEqual(["Tedo"])
                expect(metaProp(html, "og:type"), url).toEqual(["website"])
                expect(metaProp(html, "og:description"), url).toEqual(metaName(html, "description"))
                expect(metaName(html, "twitter:card"), url).toEqual(["summary"])
                expect(metaName(html, "twitter:title"), url).toEqual([title])

                const blocks = jsonLdOf(html)
                expect(blocks, url).toHaveLength(1)
                const ld = blocks[0]
                const printed: Record<string, unknown> = {
                    "@context": "https://schema.org",
                    "@type": "EducationalOccupationalProgram",
                    name: p!.name,
                    url: canonical,
                    provider: { "@type": "CollegeOrUniversity", name: p!.universityName },
                }
                // Only fields the page prints in its facts list.
                if (p!.code) printed.identifier = p!.code
                if (p!.degreeType) printed.educationalCredentialAwarded = p!.degreeType
                if (p!.credits) printed.numberOfCredits = p!.credits
                expect(ld, url).toEqual(printed)
            }
        }
    })

    test("site defaults on other routes: og/twitter from the route's own title, no JSON-LD", async ({ request }) => {
        for (const url of ["/vi", "/en/compare"]) {
            const html = await getHtml(request, url)
            const title = titleOf(html)
            const [canonical] = canonicalOf(html)
            expect(metaProp(html, "og:site_name"), url).toEqual(["Tedo"])
            expect(metaProp(html, "og:type"), url).toEqual(["website"])
            expect(metaProp(html, "og:title"), url).toEqual([title])
            expect(metaProp(html, "og:description"), url).toEqual(metaName(html, "description"))
            expect(metaName(html, "twitter:card"), url).toEqual(["summary"])
            expect(metaName(html, "twitter:title"), url).toEqual([title])
            // og:url only where it can be the page's own canonical.
            expect(metaProp(html, "og:url").filter((u) => u !== canonical), url).toEqual([])
            expect(jsonLdOf(html), url).toEqual([])
        }
    })

    test("dialog: a visible link opens the program's own page", async ({ page }) => {
        const name = msg("vi", "programs", "programPageLink")
        const p = P1!
        await page.goto(`/vi?program=${p.id}`, { waitUntil: "domcontentloaded" })
        const dialog = dialogNamed(page, p.name)
        await expect(dialog).toBeVisible({ timeout: 30000 })
        const link = dialog.getByRole("link", { name, exact: true })
        await expect(link).toBeVisible()
        await expect(link).toHaveAttribute("href", `/vi/programs/${p.id}`)
        // The extra line must not widen the page (Pixel 7).
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
        await link.click()
        await expect(page).toHaveURL(new RegExp(`/vi/programs/${p.id}$`), { timeout: 30000 })
        await expect(page.getByRole("heading", { level: 1, name: p.name, exact: true })).toBeVisible({ timeout: 30000 })
    })

    test("dialog: copy-link writes the program page URL, and that URL serves the page", async ({ page, context }) => {
        const p = P1!
        await context.grantPermissions(["clipboard-read", "clipboard-write"])
        await page.goto(`/vi?program=${p.id}`, { waitUntil: "domcontentloaded" })
        const dialog = dialogNamed(page, p.name)
        await expect(dialog).toBeVisible({ timeout: 30000 })
        // By test id: the button's name changes to the "copied" text after the click.
        const copy = dialog.getByTestId("program-copy-link")
        await expect(copy).toHaveAccessibleName(msg("vi", "programs", "copyLink"))
        await copy.click()
        await expect(copy).toHaveAccessibleName(msg("vi", "programs", "compareShareCopied"))
        const clip = await page.evaluate(() => navigator.clipboard.readText())
        expect(clip).toBe(`${new URL(page.url()).origin}/vi/programs/${p.id}`)
        const res = await page.request.get(clip, { maxRedirects: 0 })
        expect(res.status()).toBe(200)
        expect([...(await res.text()).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => textOf(m[1]))).toEqual([norm(p.name)])
    })
})
