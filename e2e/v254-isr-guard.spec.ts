import { test, expect, type APIRequestContext } from "@playwright/test"
import { randomUUID } from "crypto"
import { existsSync, readdirSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.54 — ISR guard + SEO NITs (M1, M2).
 *
 * The program page (`/<locale>/programs/<id>`) is on-demand ISR: whatever path
 * reaches it is rendered once and written to the cache, 404s included (v2.52
 * Someday). proxy.ts lets through only the ids of src/lib/program-ids.json (built
 * from public/mock/programs-by-id by scripts/build-program-ids.mjs) and answers
 * every other `/<locale>/programs/<x>` itself: 404, noindex, `cache-control:
 * no-store`, before routing — so no bad path writes an entry under
 * .next/server/app/<locale>/programs/ (the `next start` file cache; the v2.52 spec
 * reads .next/server/app/vi.html the same way). A snapshot id still renders once
 * and is then a cache HIT.
 *
 * M2: `<html lang>` is the page locale, hreflang has x-default (the default
 * locale), the crawl date and the snapshot date are both shown in
 * Asia/Ho_Chi_Minh, and a null `credits`/`duration` reads "not verified".
 *
 * Fixtures come from public/mock at test time (nothing named is pinned): the
 * middle id of the sorted snapshot ids, the first program (chunk order) with a
 * crawl date, with null / non-null credits and duration. Bad paths get random
 * suffixes. Every check reads the raw HTML, status and headers of `request.get`.
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const APP = path.join(ROOT, ".next", "server", "app")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
type Locale = "vi" | "en"
const LOCALES: Locale[] = ["vi", "en"]
const DEFAULT_LOCALE: Locale = "vi"
const messages = Object.fromEntries(LOCALES.map((l) => [l, readJson(path.join(ROOT, "src", "messages", `${l}.json`))])) as Record<
    Locale,
    Record<string, Record<string, string>>
>

type MockProgram = {
    id: string
    name: string
    universityName: string
    credits: number | null
    duration: string | null
    lastCrawled: string | null
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const index = readJson(path.join(MOCK, "index.json"))
const listed: { id: string }[] = (index.chunks as string[]).flatMap((c) => readJson(path.join(MOCK, "programs", c)))
const program = (id: string): MockProgram => readJson(path.join(MOCK, "programs-by-id", `${id}.json`))
const snapshotIds = readdirSync(path.join(MOCK, "programs-by-id"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort()
const known = new Set(snapshotIds)
const firstWhere = (ok: (p: MockProgram) => boolean) => {
    const hit = listed.find((p) => ok(program(p.id)))
    return hit ? program(hit.id) : null
}

const real = program(snapshotIds[Math.floor(snapshotIds.length / 2)])
const dated = firstWhere((p) => !!p.lastCrawled)
const nullCredits = firstWhere((p) => p.credits == null)
const withCredits = firstWhere((p) => p.credits != null && p.credits > 0)
const nullDuration = firstWhere((p) => !p.duration)
const withDuration = firstWhere((p) => !!p.duration)

// --- bad program paths: every class the guard must answer, random suffixes ---
const rand = () => Math.random().toString(36).slice(2, 10)
const unknownGuid = () => {
    let g = randomUUID()
    while (known.has(g)) g = randomUUID()
    return g
}
const mixedCase = real.id.replace(/[a-f]/, (c) => c.toUpperCase())
const BAD: [kind: string, segment: string][] = [
    ["not a GUID", "zzz"],
    ["not a GUID", `probe-${rand()}`],
    ["not a GUID", rand()],
    ["unknown GUID", unknownGuid()],
    ["unknown GUID", unknownGuid()],
    ["dotted", `${real.id}.json`],
    ["dotted", `${real.id}.html`],
    ["dotted", `${rand()}.json`],
    ["path-like", "..%2F..%2Fpackage.json"],
    ["path-like", `${real.id}%2F..%2F..%2Findex`],
    ["path-like", `${real.id}/${rand()}`],
    ["other letter case", real.id.toUpperCase()],
    ["other letter case", mixedCase],
]

// --- raw-HTML helpers (no JavaScript, no DOM; as in the v2.52 spec) ---
const decode = (s: string) =>
    s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&amp;/g, "&")
const textOf = (html: string) =>
    decode(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim()
const norm = (s: string) => s.replace(/\s+/g, " ").trim()
const attrsOf = (html: string, tag: string) =>
    [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))].map((m) =>
        Object.fromEntries([...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1].toLowerCase(), decode(a[2])]))
    )
const htmlLang = (html: string) => attrsOf(html, "html")[0]?.lang
const titleOf = (html: string) => {
    const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => decode(m[1]))
    expect(titles, "exactly one <title>").toHaveLength(1)
    return titles[0]
}
const metaContent = (html: string, name: string) => attrsOf(html, "meta").filter((a) => a.name === name).map((a) => a.content)
const canonicalOf = (html: string) => attrsOf(html, "link").filter((a) => a.rel === "canonical").map((a) => a.href)
const hreflangOf = (html: string) =>
    Object.fromEntries(attrsOf(html, "link").filter((a) => a.rel === "alternate" && a.hreflang).map((a) => [a.hreflang, a.href]))
const fieldsOf = (html: string) => {
    const dl = html.match(/<dl\b[^>]*>([\s\S]*?)<\/dl>/)
    expect(dl, "the facts <dl>").not.toBeNull()
    return new Map([...dl![1].matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/g)].map((m) => [textOf(m[1]), textOf(m[2])]))
}
const fmt = (s: string, values: Record<string, string | number>, locale: Locale) =>
    s.replace(/\{(\w+)\}/g, (_, k) => (typeof values[k] === "number" ? new Intl.NumberFormat(locale).format(values[k] as number) : String(values[k])))
// The page's isoDate (src/lib/program-snapshot.ts): DD/MM/YYYY in Asia/Ho_Chi_Minh.
const VN_DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" })
const vnDate = (v: string | null) => {
    const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!v || !m) return "—"
    return /(Z|[+-]\d{2}:?\d{2})$/i.test(v) ? VN_DATE.format(new Date(v)) : `${m[3]}/${m[2]}/${m[1]}`
}

// Cache entries Next writes for a rendered program path (seen under .next/server/app/vi/programs/).
const ENTRY = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(html|meta|rsc|segments)$/
const cacheEntries = (locale: Locale) => {
    const dir = path.join(APP, locale, "programs")
    return existsSync(dir) ? readdirSync(dir) : []
}

async function getHtml(request: APIRequestContext, url: string, status = 200) {
    const res = await request.get(url, { maxRedirects: 0 })
    expect(res.status(), url).toBe(status)
    return res.text()
}

test.describe("v2.54 — ISR guard + SEO NITs", () => {
    test("fixtures: the id list is the snapshot, every bad path class is covered", () => {
        const list: string[] = readJson(path.join(ROOT, "src", "lib", "program-ids.json"))
        expect(list, "src/lib/program-ids.json is stale — run scripts/build-program-ids.mjs").toEqual(snapshotIds)
        for (const id of snapshotIds) {
            expect(id).toMatch(GUID)
            expect(program(id).id, id).toBe(id)
        }
        expect(new Set(listed.map((p) => p.id))).toEqual(known)
        for (const p of [dated, nullCredits, withCredits, nullDuration, withDuration]) expect(p).not.toBeNull()
        expect(mixedCase).not.toBe(real.id)
        expect(real.id.toUpperCase()).not.toBe(real.id)
        expect(new Set(BAD.map(([kind]) => kind)).size).toBe(5)
        expect(BAD.length * LOCALES.length).toBeGreaterThanOrEqual(20)
        for (const [, segment] of BAD) expect(known.has(decodeURIComponent(segment)), segment).toBe(false)
    })

    test("messages: the not-verified text exists in vi and en", () => {
        for (const l of LOCALES) expect(messages[l].programPage?.notVerified, `${l}.programPage.notVerified`).toBeTruthy()
        expect(messages.vi.programPage.notVerified).not.toBe(messages.en.programPage.notVerified)
    })

    test("bad program paths: non-cacheable 404 + noindex from the proxy, no cache entry", async ({ request }) => {
        // The real id first, so on a case-insensitive disk (Windows) its entry exists
        // when the other-letter-case variants are asked for (v2.52 left them out).
        for (const locale of LOCALES) await getHtml(request, `/${locale}/programs/${real.id}`)

        for (const locale of LOCALES) {
            for (const [kind, segment] of BAD) {
                for (const round of [1, 2]) {
                    const url = `/${locale}/programs/${segment}`
                    const label = `${kind}: ${url} (request ${round})`
                    const res = await request.get(url, { maxRedirects: 0 })
                    expect(res.status(), label).toBe(404)
                    const headers = res.headers()
                    expect(headers["x-nextjs-cache"], `${label} never reaches the ISR route`).toBeUndefined()
                    expect(headers["cache-control"] ?? "", label).toContain("no-store")
                    expect(headers["x-robots-tag"] ?? "", label).toContain("noindex")
                    const html = await res.text()
                    expect(metaContent(html, "robots").join(" "), label).toContain("noindex")
                    expect(htmlLang(html), label).toBe(locale)
                    expect(textOf(html), label).not.toContain(norm(real.name))
                }
            }
        }

        // Nothing but snapshot ids in the program cache — whichever spec or worker wrote it.
        for (const locale of LOCALES) {
            const stray = cacheEntries(locale).filter((name) => {
                const m = ENTRY.exec(name)
                return !m || !known.has(m[1])
            })
            expect(stray, `.next/server/app/${locale}/programs/`).toEqual([])
            expect(cacheEntries(locale), `${locale}: the real id is still cached`).toContain(`${real.id}.html`)
        }
    })

    test("a snapshot id renders once and is then served from the cache", async ({ request }) => {
        for (const locale of LOCALES) {
            const url = `/${locale}/programs/${real.id}`
            await getHtml(request, url)
            const again = await request.get(url, { maxRedirects: 0 })
            expect(again.status(), url).toBe(200)
            expect(again.headers()["x-nextjs-cache"], url).toBe("HIT")
            const name = fmt(messages[locale].programPage.title, { name: real.name, university: real.universityName }, locale)
            expect(titleOf(await again.text())).toBe(`${name} · Tedo`)
            await expect.poll(() => cacheEntries(locale), { timeout: 10_000 }).toContain(`${real.id}.html`)
        }
    })

    test("<html lang> is the page locale", async ({ request }) => {
        for (const locale of LOCALES) {
            for (const route of ["", "/roadmap", `/programs/${real.id}`]) {
                const html = await getHtml(request, `/${locale}${route}`)
                expect(htmlLang(html), `/${locale}${route}`).toBe(locale)
            }
            const file = path.join(APP, `${locale}.html`)
            expect(existsSync(file), file).toBe(true)
            expect(htmlLang(readFileSync(file, "utf8")), file).toBe(locale)
        }
    })

    test("hreflang x-default = the default locale's URL", async ({ request }) => {
        for (const locale of LOCALES) {
            for (const route of ["", "/roadmap", `/programs/${real.id}`]) {
                const html = await getHtml(request, `/${locale}${route}`)
                const origin = new URL(canonicalOf(html)[0]).origin
                expect(hreflangOf(html)["x-default"], `/${locale}${route}`).toBe(`${origin}/${DEFAULT_LOCALE}${route}`)
            }
        }
    })

    test("crawl date and snapshot date in one time zone (Asia/Ho_Chi_Minh)", async ({ request }) => {
        for (const locale of LOCALES) {
            const m = messages[locale]
            const html = await getHtml(request, `/${locale}/programs/${dated!.id}`)
            const section = html.match(/<section\b[^>]*data-testid="program-attribution"[^>]*>([\s\S]*?)<\/section>/)
            expect(section).not.toBeNull()
            const said = textOf(section![1])
            expect(said).toContain(`${m.programs.lastCrawled}: ${vnDate(dated!.lastCrawled)}`)
            expect(said).toContain(`${m.programPage.snapshotDate}: ${vnDate(index.generatedAt)}`)
        }
    })

    test("null credits / duration read as not verified, never null, 0 or an empty value", async ({ request }) => {
        for (const locale of LOCALES) {
            const m = messages[locale]
            const cases: [MockProgram, string, string][] = [
                [nullCredits!, m.programs.courseCredits, m.programPage.notVerified],
                [withCredits!, m.programs.courseCredits, String(withCredits!.credits)],
                [nullDuration!, m.programs.duration, m.programPage.notVerified],
                [withDuration!, m.programs.duration, norm(withDuration!.duration ?? "")],
            ]
            for (const [p, label, value] of cases) {
                // A missing message must not let an absent row pass as `undefined === undefined`.
                expect(value, `${locale}: expected text for ${label}`).toBeTruthy()
                const html = await getHtml(request, `/${locale}/programs/${p.id}`)
                const fields = fieldsOf(html)
                expect(fields.get(label), `${locale} ${p.id} ${label}`).toBe(value)
                for (const [k, v] of fields) {
                    expect(v, `${locale} ${p.id} ${k}`).not.toBe("")
                    expect(v, `${locale} ${p.id} ${k}`).not.toMatch(/^(null|undefined|NaN|0)$/)
                }
                expect(metaContent(html, "description").join(" "), p.id).not.toMatch(/\bnull\b|undefined|NaN/)
            }
        }
    })

    test("/vi keeps its static HTML", () => {
        const file = path.join(APP, "vi.html")
        expect(existsSync(file)).toBe(true)
        expect(readFileSync(file, "utf8").match(/BAILOUT_TO_CLIENT_SIDE_RENDERING/g) ?? []).toEqual([])
    })
})
