import { test, expect, type APIRequestContext } from "@playwright/test"
import { existsSync, readdirSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.52 — SEO program pages (audit V9, gap G11).
 *
 * `/<locale>/programs/<id>` is rendered on the server from the snapshot: a
 * plain request (no JavaScript) gets the program name in <title> and in the
 * h1, a meta description, canonical + hreflang, the attribution and the course
 * list — and no raw-document text or long prose. Anything that is not a
 * snapshot id is a 404 with noindex. Every static route has its own title, and
 * the sitemap lists one URL per snapshot program and locale.
 *
 * Every check reads the raw HTML of `request.get`, parsed as text. The page
 * must be in the document as sent: no outlined Suspense segment (`<div hidden
 * id="S:n">` swapped in by a script) — without JavaScript it would stay hidden.
 * Fixtures come from public/mock at test time (nothing named is pinned): the
 * first program of the first chunk, the last of the last chunk, the first one
 * (chunk order) with a course list, the first without one, the first with
 * raw-document text. The site origin is never assumed (the build may set
 * NEXT_PUBLIC_SITE_URL): canonical, hreflang and sitemap URLs must share it.
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
type Locale = "vi" | "en"
const LOCALES: Locale[] = ["vi", "en"]
const messages = Object.fromEntries(LOCALES.map((l) => [l, readJson(path.join(ROOT, "src", "messages", `${l}.json`))])) as Record<
    Locale,
    Record<string, Record<string, string>>
>

type MockProgram = {
    id: string
    name: string
    universityName: string
    code: string | null
    degreeType: string | null
    duration: string | null
    credits: number | null
    courseCount: number
    sourceUrl: string | null
    lastCrawled: string | null
    description: string | null
    goals: string | null
    careerOutlook: string | null
    learningOutcomes: string | null
}
type Course = { courseCode: string | null; courseName: string | null }

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const index = readJson(path.join(MOCK, "index.json"))
const chunks: string[] = index.chunks
const listed: { id: string }[] = chunks.flatMap((c) => readJson(path.join(MOCK, "programs", c)))
const byIdFile = (id: string) => path.join(MOCK, "programs-by-id", `${id}.json`)
const program = (id: string): MockProgram => readJson(byIdFile(id))
const coursesOf = (id: string): Course[] => {
    const f = path.join(MOCK, "curricula", `${id}.json`)
    return existsSync(f) ? readJson(f) : []
}
const rawTextsOf = (id: string): string[] => {
    const f = path.join(MOCK, "raw-documents", `${id}.json`)
    return existsSync(f) ? (readJson(f) as { extractedText?: string | null }[]).flatMap((d) => (d.extractedText ? [d.extractedText] : [])) : []
}
const snapshotIds = readdirSync(path.join(MOCK, "programs-by-id"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))

const firstChunk: { id: string }[] = readJson(path.join(MOCK, "programs", chunks[0]))
const lastChunk: { id: string }[] = readJson(path.join(MOCK, "programs", chunks[chunks.length - 1]))
const first = program(firstChunk[0].id)
const last = program(lastChunk[lastChunk.length - 1].id)
const withCourses = program(listed.find((p) => coursesOf(p.id).length > 0)!.id)
const withoutCourses = program(listed.find((p) => coursesOf(p.id).length === 0)!.id)
const withRawText = program(listed.find((p) => rawTextsOf(p.id).some((t) => t.trim().length >= 200))!.id)
const unknownId = ["00000000-0000-4000-8000-000000000000", "ffffffff-ffff-4fff-bfff-ffffffffffff"].find((id) => !existsSync(byIdFile(id)))!
// Not served as program pages: not a GUID, path-like, a file name, no file. (Other letter case is
// left out: on Windows the ISR file cache is case-insensitive, so the lowercase entry would answer.)
const NOT_PROGRAMS = ["zzz", "..%2F..%2Fpackage.json", `${first.id}.json`, `${first.id}%2F..%2F..%2Findex`, unknownId]
const STATIC_ROUTES: [string, string | null][] = [
    ["", null],
    ["/programs", "programsTitle"],
    ["/analytics", "analyticsTitle"],
    ["/compare", "compareTitle"],
    ["/roadmap", "roadmapTitle"],
    ["/materials", "materialsTitle"],
    ["/chat", "chatTitle"],
]

// --- raw-HTML helpers (no JavaScript, no DOM) ---
const decode = (s: string) =>
    s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&amp;/g, "&")
// React separates adjacent text with <!-- --> (no space); an element boundary counts as a space.
const textOf = (html: string) =>
    decode(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim()
const norm = (s: string) => s.replace(/\s+/g, " ").trim()
const attrsOf = (html: string, tag: string) =>
    [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))].map((m) =>
        Object.fromEntries([...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1].toLowerCase(), decode(a[2])]))
    )
const titleOf = (html: string) => {
    const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => decode(m[1]))
    expect(titles, "exactly one <title>").toHaveLength(1)
    return titles[0]
}
const h1sOf = (html: string) => [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => textOf(m[1]))
const metaContent = (html: string, name: string) => attrsOf(html, "meta").filter((a) => a.name === name).map((a) => a.content)
const canonicalOf = (html: string) => attrsOf(html, "link").filter((a) => a.rel === "canonical").map((a) => a.href)
const hreflangOf = (html: string) =>
    Object.fromEntries(attrsOf(html, "link").filter((a) => a.rel === "alternate" && a.hreflang).map((a) => [a.hreflang, a.href]))
const sectionOf = (html: string, attr: string) => {
    const m = html.match(new RegExp(`<section\\b[^>]*${attr}[^>]*>([\\s\\S]*?)</section>`))
    expect(m, `section ${attr}`).not.toBeNull()
    return m![1]
}
const fmt = (s: string, values: Record<string, string | number>, locale: Locale) =>
    s.replace(/\{(\w+)\}/g, (_, k) => (typeof values[k] === "number" ? new Intl.NumberFormat(locale).format(values[k] as number) : String(values[k])))
const isoDate = (v: string | null) => {
    const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"
}

async function getHtml(request: APIRequestContext, url: string, status = 200) {
    const res = await request.get(url, { maxRedirects: 0 })
    expect(res.status(), url).toBe(status)
    return res.text()
}

async function sitemapUrls(request: APIRequestContext) {
    const xml = await getHtml(request, "/sitemap.xml")
    return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => new URL(decode(m[1])))
}

test.describe("v2.52 — SEO program pages", () => {
    test("fixtures exist in the snapshot", () => {
        expect(chunks.length).toBeGreaterThan(1)
        expect(new Set(listed.map((p) => p.id))).toEqual(new Set(snapshotIds))
        for (const p of [first, last, withCourses, withoutCourses, withRawText]) {
            expect(p.id).toMatch(GUID)
            expect(p.name).toBeTruthy()
            expect(p.universityName).toBeTruthy()
        }
        expect(first.id).not.toBe(last.id)
        expect(coursesOf(withCourses.id).length).toBeGreaterThan(0)
        expect(withoutCourses.courseCount).toBe(0)
        expect(unknownId).toBeTruthy()
        expect(NOT_PROGRAMS.filter((v) => snapshotIds.includes(decodeURIComponent(v)))).toEqual([])
    })

    test("messages: the new titles and page copy exist in vi and en", () => {
        for (const l of LOCALES) {
            for (const [, key] of STATIC_ROUTES) if (key) expect(messages[l].metadata[key], `${l}.metadata.${key}`).toBeTruthy()
            for (const key of ["title", "snapshotDate", "openInList"]) expect(messages[l].programPage?.[key], `${l}.programPage.${key}`).toBeTruthy()
        }
    })

    for (const locale of LOCALES) {
        test(`${locale}: plain-request HTML of the first and the last program`, async ({ request }) => {
            const m = messages[locale]
            const origin = (await sitemapUrls(request))[0].origin
            for (const p of [first, last]) {
                const pathname = `/${locale}/programs/${p.id}`
                const html = await getHtml(request, pathname)
                const name = fmt(m.programPage.title, { name: p.name, university: p.universityName }, locale)
                expect(titleOf(html)).toBe(`${name} · Tedo`)
                expect(h1sOf(html)).toEqual([norm(p.name)])
                expect(html).not.toMatch(/<div hidden id="S:\d+">/)
                const facts = [
                    p.degreeType,
                    p.duration,
                    p.credits ? fmt(m.programs.credits, { count: p.credits }, locale) : null,
                    p.courseCount > 0 ? fmt(m.programs.courses, { count: p.courseCount }, locale) : null,
                ]
                expect(metaContent(html, "description")).toEqual([[name, ...facts].filter(Boolean).join(" · ")])
                expect(canonicalOf(html)).toEqual([`${origin}${pathname}`])
                expect(hreflangOf(html)).toEqual({ vi: `${origin}/vi/programs/${p.id}`, en: `${origin}/en/programs/${p.id}` })
                expect(metaContent(html, "robots")).toEqual([])

                // Attribution: source university, official source, crawl date, snapshot date.
                const attribution = sectionOf(html, 'data-testid="program-attribution"')
                const said = textOf(attribution)
                expect(said).toContain(`${m.programs.sourceLabel} ${p.universityName}`)
                expect(said).toContain(`${m.programs.lastCrawled}: ${isoDate(p.lastCrawled)}`)
                expect(said).toContain(`${m.programPage.snapshotDate}: ${isoDate(index.generatedAt)}`)
                if (p.sourceUrl) {
                    expect(attrsOf(attribution, "a").map((a) => a.href)).toEqual([p.sourceUrl])
                    expect(said).toContain(`${m.programs.sourceUrl}: ${p.sourceUrl}`)
                }
                // The full detail (admissions, reference score, documents) is the v2.48 dialog.
                const toDialog = attrsOf(html, "a").filter((a) => a.href === `/${locale}?program=${p.id}`)
                expect(toDialog).toHaveLength(1)
                expect(textOf(html)).toContain(m.programPage.openInList)
            }
        })
    }

    test("course list: every snapshot course row, or the empty-curriculum text", async ({ request }) => {
        const m = messages.vi
        for (const p of [first, last, withCourses, withoutCourses]) {
            const html = await getHtml(request, `/vi/programs/${p.id}`)
            const section = sectionOf(html, 'aria-labelledby="program-courses"')
            expect(textOf(section)).toContain(m.programs.curriculumTitle)
            const courses = coursesOf(p.id)
            const rows = [...section.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/g)].flatMap((b) => [...b[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)])
            expect(rows, p.id).toHaveLength(courses.length)
            if (courses.length === 0) {
                expect(textOf(section)).toContain(m.programs.noCurriculum)
                continue
            }
            rows.forEach((r, i) => {
                const cells = [...r[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((c) => textOf(c[1]))
                expect(cells[0]).toBe(norm(courses[i].courseCode ?? "—"))
                expect(cells[1]).toBe(norm(courses[i].courseName || "—"))
            })
        }
    })

    test("no raw-document text and no long prose in the page", async ({ request }) => {
        for (const p of [first, last, withRawText]) {
            const text = textOf(await getHtml(request, `/vi/programs/${p.id}`))
            for (const raw of rawTextsOf(p.id)) {
                const head = norm(raw).slice(0, 120)
                if (head.length >= 60) expect(text, `raw text of ${p.id}`).not.toContain(head)
            }
            for (const prose of [p.description, p.goals, p.careerOutlook, p.learningOutcomes]) {
                const head = norm(prose ?? "").slice(0, 80)
                if (head.length >= 60) expect(text, `prose of ${p.id}`).not.toContain(head)
            }
        }
        expect(rawTextsOf(withRawText.id).length).toBeGreaterThan(0)
    })

    test("404 + noindex for anything that is not a snapshot program id", async ({ request }) => {
        for (const locale of LOCALES) {
            for (const id of NOT_PROGRAMS) {
                const html = await getHtml(request, `/${locale}/programs/${id}`, 404)
                expect(metaContent(html, "robots").join(" "), id).toContain("noindex")
                expect(h1sOf(html), id).not.toContain(norm(first.name))
            }
        }
    })

    test("sitemap: the static URLs + one URL per snapshot program and locale", async ({ request }) => {
        const urls = await sitemapUrls(request)
        const origins = new Set(urls.map((u) => u.origin))
        expect(origins.size).toBe(1)
        const paths = urls.map((u) => u.pathname + u.search)
        expect(new Set(paths).size, "no duplicate URL").toBe(paths.length)
        const staticPaths = LOCALES.flatMap((l) => STATIC_ROUTES.map(([p]) => `/${l}${p}`))
        const programPaths = paths.filter((p) => !staticPaths.includes(p))
        expect(paths.filter((p) => staticPaths.includes(p)).sort()).toEqual([...staticPaths].sort())
        expect(paths.length).toBe(staticPaths.length + LOCALES.length * snapshotIds.length)
        expect(paths.length).toBeGreaterThan(3900)
        const known = new Set(snapshotIds)
        for (const p of programPaths) {
            const m = p.match(/^\/(vi|en)\/programs\/([^/]+)$/)
            expect(m, p).not.toBeNull()
            expect(m![2]).toMatch(GUID)
            expect(known.has(m![2]), p).toBe(true)
        }
        for (const l of LOCALES) expect(programPaths.filter((p) => p.startsWith(`/${l}/`)).length).toBe(snapshotIds.length)
    })

    test("every static route has its own title, canonical and hreflang (vi + en)", async ({ request }) => {
        const origin = (await sitemapUrls(request))[0].origin
        const seen: string[] = []
        for (const locale of LOCALES) {
            const meta = messages[locale].metadata
            for (const [route, key] of STATIC_ROUTES) {
                const html = await getHtml(request, `/${locale}${route}`)
                const title = titleOf(html)
                expect(title, `/${locale}${route}`).toBe(key ? `${meta[key]} · Tedo` : meta.title)
                expect(canonicalOf(html), `/${locale}${route}`).toEqual([`${origin}/${locale}${route}`])
                expect(hreflangOf(html), `/${locale}${route}`).toEqual({ vi: `${origin}/vi${route}`, en: `${origin}/en${route}` })
                seen.push(title)
            }
        }
        expect(new Set(seen).size).toBe(seen.length)
    })

    test("/vi keeps its static HTML", () => {
        const file = path.join(ROOT, ".next", "server", "app", "vi.html")
        expect(existsSync(file)).toBe(true)
        const html = readFileSync(file, "utf8")
        expect(html.match(/BAILOUT_TO_CLIENT_SIDE_RENDERING/g) ?? []).toEqual([])
        expect(h1sOf(html)).toContain(messages.vi.programs.title)
    })
})
