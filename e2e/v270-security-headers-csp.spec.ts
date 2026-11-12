import { test, expect, Page, APIResponse } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"

/**
 * v2.70 — security headers and a Content-Security-Policy (audit A6, with the Next.js security update).
 *
 * The contract, stated here (the spec does not import next.config.ts):
 * - every response (pages, program pages, the ISR guard's 404, /mock files, /api/chat, /_next/static, sitemap, robots)
 *   carries X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin and
 *   the CSP below, and no X-Powered-By;
 * - the CSP is static (no nonce, so static HTML and ISR stay static) and enforced: default-src 'self'; script-src and
 *   style-src 'self' 'unsafe-inline'; connect-src 'self' only in a mock build, 'self' + the API base's origin in an
 *   API-mode build (NEXT_PUBLIC_API_URL, else the code's default http://localhost:5100/api); object-src 'none'; base-uri 'self';
 *   form-action 'self'; frame-ancestors 'none'; no 'unsafe-eval' on a production server;
 * - no page, dialog tab, modal, download, chat request or API-mode fetch is refused by it: 0 `securitypolicyviolation`
 *   events and 0 console CSP messages, while a cross-origin image (the probe) IS refused — the policy is in force;
 * - the site cannot be framed.
 *
 * Programs are read from public/mock at run time; messages inside the test bodies. domcontentloaded + a quiet-network
 * wait, not networkidle (AGENTS.md §12). An API-mode build (shell NEXT_PUBLIC_USE_MOCK=false) runs only the last test.
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
type Locale = "vi" | "en"
const LOCALES: Locale[] = ["vi", "en"]
const messages: Record<Locale, Record<string, Record<string, unknown>>> = {
    vi: readJson(path.join(ROOT, "src", "messages", "vi.json")),
    en: readJson(path.join(ROOT, "src", "messages", "en.json")),
}
function msg(locale: Locale, ns: string, key: string): string {
    const v = messages[locale][ns]?.[key]
    expect(typeof v === "string" && v.length > 0, `message ${locale}.${ns}.${key}`).toBe(true)
    return v as string
}

const API_BUILD = process.env.NEXT_PUBLIC_USE_MOCK === "false"
/** The API origin an API-mode build fetches: the client code's rule (NEXT_PUBLIC_API_URL, else its default). */
const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:5100/api").origin

// ---- the contract ----
const HEADERS: Record<string, string> = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
}
const CSP: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "connect-src": ["'self'"], // + plain http(s) origins, checked apart
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
}
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i

function parseCsp(value: string): Record<string, string[]> {
    return Object.fromEntries(
        value
            .split(";")
            .map((d) => d.trim().split(/\s+/))
            .filter((d) => d[0])
            .map(([name, ...sources]) => [name.toLowerCase(), sources])
    )
}

function checkHeaders(label: string, res: APIResponse) {
    const h = res.headers()
    for (const [k, v] of Object.entries(HEADERS)) expect(h[k], `${label}: ${k}`).toBe(v)
    expect(h["x-powered-by"], `${label}: no x-powered-by`).toBeUndefined()
    const raw = h["content-security-policy"]
    expect(raw, `${label}: content-security-policy`).toBeTruthy()
    const csp = parseCsp(raw)
    expect(Object.keys(csp).sort(), `${label}: the CSP's directives`).toEqual(Object.keys(CSP).sort())
    for (const [name, sources] of Object.entries(CSP)) {
        if (name === "connect-src") continue
        expect(csp[name], `${label}: ${name}`).toEqual(sources)
    }
    const [self, ...origins] = csp["connect-src"]
    expect(self, `${label}: connect-src starts with 'self'`).toBe("'self'")
    for (const o of origins) expect(o, `${label}: connect-src ${o} is a plain http(s) origin`).toMatch(ORIGIN)
    // A mock build fetches only its own origin; an API-mode build also the API base.
    if (API_BUILD) expect(origins, `${label}: connect-src allows the API base ${API_ORIGIN}`).toEqual([API_ORIGIN])
    else expect(origins, `${label}: connect-src of a mock build is 'self' only`).toEqual([])
    expect(raw, `${label}: no 'unsafe-eval' on a production server`).not.toContain("unsafe-eval")
}

// ---- data (read once) ----
type Row = { id: string; courseCount: number | null }
let programs: string[] | null = null
/** Two programs with a course list (the dialog's tabs all have content), in search-index order. */
function twoPrograms(): string[] {
    if (!programs) {
        const { fields, values, rows } = readJson(path.join(MOCK, "search-index.json")) as { fields: string[]; values: Record<string, unknown[]>; rows: unknown[][] }
        const all = rows.map((r) => Object.fromEntries(fields.map((f, i) => [f, values[f] ? values[f][r[i] as number] : r[i]])) as Row)
        programs = all.filter((r) => (r.courseCount ?? 0) > 0).slice(0, 2).map((r) => r.id)
    }
    expect(programs.length, "two programs with courses in the snapshot").toBe(2)
    return programs
}

// ---- CSP watcher ----
const PROBE = "http://127.0.0.1:9/v270-csp-probe.png"
type Violation = { dir: string; disp: string; uri: string; sample: string; src: string; line: number }
async function events(page: Page): Promise<Violation[]> {
    return page.evaluate(() => ((window as unknown as { __v270?: Violation[] }).__v270 ?? []).slice())
}
/** Records every securitypolicyviolation of each document from its start, every console CSP message, and the network's quiet. */
async function watch(page: Page) {
    await page.addInitScript(() => {
        const w = window as unknown as { __v270: unknown[] }
        w.__v270 = []
        document.addEventListener(
            "securitypolicyviolation",
            (e) => w.__v270.push({ dir: e.effectiveDirective, disp: e.disposition, uri: e.blockedURI, sample: e.sample, src: e.sourceFile, line: e.lineNumber }),
            true
        )
    })
    const consoleCsp: string[] = []
    page.on("console", (m) => {
        const t = m.text()
        if (/Content.Security.Policy|Refused to/i.test(t) && !t.includes("v270-csp-probe")) consoleCsp.push(t.slice(0, 240))
    })
    let pending = 0
    let last = Date.now()
    const busy = (u: string) => /^\/(mock|_next|api)\//.test(new URL(u).pathname)
    page.on("request", (r) => {
        if (!busy(r.url())) return
        pending++
        last = Date.now()
    })
    // A 404 body may never end on `next start` (AGENTS.md §12): a request is done at its response headers.
    const done = (r: { url(): string }) => {
        if (!busy(r.url())) return
        pending = Math.max(0, pending - 1)
        last = Date.now()
    }
    page.on("response", (r) => done(r))
    page.on("requestfailed", (r) => done(r))
    return {
        /** Waits until no /mock/, /_next/ or /api/ request has been pending for 1 s. */
        quiet: () => expect.poll(() => pending === 0 && Date.now() - last >= 1000, { timeout: 45000, intervals: [200] }).toBe(true),
        /** The policy is enforced on this document: a cross-origin image is refused (a violation, no request). */
        probe: async (label: string) => {
            await page.evaluate(
                (src) =>
                    new Promise<void>((resolve) => {
                        const img = new Image()
                        img.onload = img.onerror = () => resolve()
                        img.src = src
                        setTimeout(resolve, 3000)
                    }),
                PROBE
            )
            const probe = (await events(page)).filter((e) => e.uri.startsWith("http://127.0.0.1:9"))
            // "enforce": a report-only policy would report the probe too, but not refuse it.
            expect(probe.map((e) => `${e.dir} ${e.disp}`), `${label}: CSP in force (a cross-origin image is refused)`).toEqual(["img-src enforce"])
        },
        /** 0 violations other than the probe on this document, 0 console CSP messages so far. */
        none: async (label: string) => {
            const ev = (await events(page)).filter((e) => !e.uri.startsWith("http://127.0.0.1:9"))
            expect(ev, `${label}: CSP violations`).toEqual([])
            expect(consoleCsp, `${label}: console CSP messages`).toEqual([])
        },
    }
}

async function openWidget(page: Page, l: Locale) {
    const chat = page.locator("div.fixed.bottom-6.right-6")
    const box = chat.getByRole("textbox", { name: msg(l, "chat", "inputLabel"), exact: true })
    await expect(async () => {
        if (!(await box.isVisible().catch(() => false))) await chat.getByRole("button", { name: msg(l, "chat", "title"), exact: true }).click()
        await expect(box).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 30000 })
    return { chat, box }
}

test.describe("v2.70 security headers and CSP", () => {
    test("every route sends the security headers and the CSP, and no X-Powered-By", async ({ request }) => {
        test.skip(API_BUILD, "mock build only (an API-mode build runs the API-mode test)")
        const [p] = twoPrograms()
        const html = await (await request.get("/vi")).text()
        const js = html.match(/\/_next\/static\/[^"]+\.js/)?.[0]
        const css = html.match(/\/_next\/static\/[^"]+\.css/)?.[0]
        expect(js && css, "/vi names a /_next/static script and stylesheet").toBeTruthy()
        const cases: [string, () => Promise<APIResponse>, number][] = [
            ["GET /", () => request.get("/", { maxRedirects: 0 }), 307],
            ...LOCALES.flatMap((l): [string, () => Promise<APIResponse>, number][] => [
                [`GET /${l}`, () => request.get(`/${l}`), 200],
                [`GET /${l}/programs/<id>`, () => request.get(`/${l}/programs/${p}`), 200],
            ]),
            ["GET /vi/roadmap?uni=NEU", () => request.get("/vi/roadmap?uni=NEU"), 200],
            ["GET /vi/compare", () => request.get("/vi/compare"), 200],
            ["GET /vi/analytics", () => request.get("/vi/analytics"), 200],
            ["GET /vi/materials", () => request.get("/vi/materials"), 200],
            ["GET /vi/chat", () => request.get("/vi/chat"), 200],
            ["GET /vi/programs/zzz (ISR guard)", () => request.get("/vi/programs/zzz"), 404],
            ["GET /vi/nope (not found)", () => request.get("/vi/nope"), 404],
            ["GET /mock/index.json", () => request.get("/mock/index.json"), 200],
            ["GET /mock/programs-by-id/<id>.json", () => request.get(`/mock/programs-by-id/${p}.json`), 200],
            ["GET /api/chat", () => request.get("/api/chat"), 405],
            ["OPTIONS /api/chat", () => request.fetch("/api/chat", { method: "OPTIONS" }), 204],
            [`GET ${js}`, () => request.get(js!), 200],
            [`GET ${css}`, () => request.get(css!), 200],
            ["GET /sitemap.xml", () => request.get("/sitemap.xml"), 200],
            ["GET /robots.txt", () => request.get("/robots.txt"), 200],
            ["GET /icon.svg", () => request.get("/icon.svg"), 200],
            ["HEAD /vi", () => request.head("/vi"), 200],
        ]
        for (const [label, get, status] of cases) {
            const res = await get()
            expect(res.status(), `${label}: status`).toBe(status)
            checkHeaders(label, res)
        }
        // The ISR guard's own answer is unchanged (v2.54): a static 404, not cached.
        const guard = await request.get("/vi/programs/zzz")
        expect(guard.headers()["cache-control"], "ISR guard 404: no-store").toBe("no-store")
    })

    test("CSP: the list, the score filter and the chat widget (a question sent) — in force, 0 violations, vi and en", async ({ page }) => {
        test.skip(API_BUILD, "mock build only")
        test.setTimeout(300000)
        const w = await watch(page)
        for (const l of LOCALES) {
            await page.goto(`/${l}`, { waitUntil: "domcontentloaded" })
            await w.quiet()
            await w.probe(`/${l}`)
            await page.getByTestId("score-filter-input").fill("26")
            await page.getByRole("combobox", { name: msg(l, "programs", "scoreFilterScale") }).click()
            await page.getByRole("option", { name: "30", exact: true }).click()
            await expect(page.getByTestId("score-filter-result")).toBeVisible({ timeout: 60000 })
            await w.quiet()
            const { chat, box } = await openWidget(page, l)
            const replies = chat.locator("div.rounded-tl-none > p")
            const before = await replies.count()
            await box.fill("điểm chuẩn ngành an toàn thông tin NEU")
            await chat.getByRole("button", { name: msg(l, "chat", "send"), exact: true }).click()
            await expect(replies).toHaveCount(before + 1, { timeout: 60000 })
            await w.quiet()
            await w.none(`/${l} list + score filter + widget`)
        }
    })

    test("CSP: the detail dialog (every tab, the JSON download) and the program page — in force, 0 violations, vi and en", async ({ page }) => {
        test.skip(API_BUILD, "mock build only")
        test.setTimeout(300000)
        const [p] = twoPrograms()
        const w = await watch(page)
        for (const l of LOCALES) {
            await page.goto(`/${l}?program=${p}`, { waitUntil: "domcontentloaded" })
            const dialog = page.getByRole("dialog")
            await expect(dialog).toBeVisible({ timeout: 30000 })
            await w.quiet()
            await w.probe(`/${l}?program=`)
            const tabs = dialog.getByRole("tab")
            const n = await tabs.count()
            expect(n, "the dialog has tabs").toBeGreaterThan(1)
            for (let i = 0; i < n; i++) {
                await tabs.nth(i).click()
                await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true")
                await w.quiet()
            }
            const download = page.waitForEvent("download")
            await dialog.getByRole("button", { name: msg(l, "programs", "exportJson"), exact: true }).click()
            expect((await download).suggestedFilename(), `/${l} dialog: the JSON export downloads`).toMatch(/\.json$/)
            await w.none(`/${l} dialog`)

            await page.goto(`/${l}/programs/${p}`, { waitUntil: "domcontentloaded" })
            await w.quiet()
            await w.probe(`/${l}/programs/<id>`)
            await w.none(`/${l}/programs/<id>`)
        }
    })

    test("CSP: /roadmap?uni=NEU and the syllabus modal on /roadmap — in force, 0 violations, vi and en", async ({ page }) => {
        test.skip(API_BUILD, "mock build only")
        test.setTimeout(300000)
        const w = await watch(page)
        for (const l of LOCALES) {
            await page.goto(`/${l}/roadmap?uni=NEU`, { waitUntil: "domcontentloaded" })
            await w.quiet()
            await w.probe(`/${l}/roadmap?uni=NEU`)
            await w.none(`/${l}/roadmap?uni=NEU`)

            await page.goto(`/${l}/roadmap`, { waitUntil: "domcontentloaded" })
            await w.quiet()
            await w.probe(`/${l}/roadmap`)
            const opener = page.getByRole("button", { name: msg(l, "roadmap", "viewSyllabus"), exact: true }).filter({ visible: true }).first()
            const modal = page.getByRole("dialog")
            await expect(async () => {
                await opener.click()
                await expect(modal).toBeVisible({ timeout: 2000 })
            }).toPass({ timeout: 30000 })
            const tabs = modal.getByRole("tab")
            await expect(tabs.first()).toBeVisible({ timeout: 20000 })
            for (let i = 0; i < (await tabs.count()); i++) {
                await tabs.nth(i).click()
                await w.quiet()
            }
            await w.none(`/${l}/roadmap syllabus modal`)
        }
    })

    test("CSP: /compare with two programs and /analytics (the JSON download) — in force, 0 violations, vi and en", async ({ page }) => {
        test.skip(API_BUILD, "mock build only")
        test.setTimeout(300000)
        const [a, b] = twoPrograms()
        const w = await watch(page)
        for (const l of LOCALES) {
            await page.goto(`/${l}/compare?a=${a}&b=${b}`, { waitUntil: "domcontentloaded" })
            await w.quiet()
            await w.probe(`/${l}/compare`)
            await w.none(`/${l}/compare`)

            await page.goto(`/${l}/analytics`, { waitUntil: "domcontentloaded" })
            await w.quiet()
            await w.probe(`/${l}/analytics`)
            const download = page.waitForEvent("download")
            await page.getByRole("button", { name: msg(l, "analytics", "exportJson"), exact: true }).click()
            expect((await download).suggestedFilename(), `/${l}/analytics: the JSON export downloads`).toMatch(/\.json$/)
            await w.none(`/${l}/analytics`)
        }
    })

    test("CSP: /materials and /chat (a question sent) — in force, 0 violations, vi and en", async ({ page }) => {
        test.skip(API_BUILD, "mock build only")
        test.setTimeout(300000)
        const w = await watch(page)
        for (const l of LOCALES) {
            await page.goto(`/${l}/materials`, { waitUntil: "domcontentloaded" })
            await w.quiet()
            await w.probe(`/${l}/materials`)
            await w.none(`/${l}/materials`)

            await page.goto(`/${l}/chat`, { waitUntil: "domcontentloaded" })
            await w.quiet()
            await w.probe(`/${l}/chat`)
            const box = page.getByRole("textbox", { name: msg(l, "chat", "inputLabel"), exact: true })
            await expect(box).toBeVisible({ timeout: 20000 })
            await box.fill("điểm chuẩn ngành an toàn thông tin NEU")
            const answered = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/chat" && r.request().method() === "POST")
            await page.getByRole("button", { name: msg(l, "chat", "send"), exact: true }).click()
            expect((await answered).status(), `/${l}/chat: POST /api/chat answered`).toBe(200)
            await w.quiet()
            await w.none(`/${l}/chat`)
        }
    })

    test("the site cannot be framed (frame-ancestors 'none' / X-Frame-Options DENY)", async ({ page, baseURL }) => {
        test.skip(API_BUILD, "mock build only")
        // The parent is a same-origin document of the server: Chromium's Local Network Access checks refuse a localhost
        // frame inside about:blank or another origin whatever the headers (S5_frame_probe.log). A control frame with no
        // headers (answered by page.route) must render in the same parent, so a refusal is the framed page's own headers.
        const CONTROL = `${baseURL}/v270-frame-control`
        await page.route(CONTROL, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>control</title><main>control</main>" }))
        const refused: Record<string, string> = {}
        page.on("requestfailed", (r) => {
            refused[r.url()] = r.failure()?.errorText ?? ""
        })
        async function frame(url: string) {
            // The ISR guard's static 404 page: same origin, HTML, no script.
            await page.goto(`${baseURL}/vi/programs/zzz`)
            await page.setContent(`<iframe src="${url}" width="900" height="600"></iframe>`)
            // The iframe starts on its initial about:blank: wait for the navigation to commit (a refused frame commits the
            // browser's error page), then for that document's load.
            const childFrame = () => page.frames().find((f) => f !== page.mainFrame())
            await expect.poll(() => childFrame()?.url() ?? "", { message: `${url}: the iframe navigates`, timeout: 30000 }).not.toMatch(/^(about:blank)?$/)
            const child = childFrame()!
            await child.waitForLoadState("load")
            return { url: child.url(), main: await child.evaluate(() => document.querySelector("main") !== null) }
        }
        expect(await frame(CONTROL), "control: a same-origin page without headers renders in the frame").toEqual({ url: CONTROL, main: true })
        for (const p of ["/vi", "/en/chat"]) {
            const got = await frame(`${baseURL}${p}`)
            expect(got.main, `${p}: the app's <main> rendered inside a frame (frame url ${got.url})`).toBe(false)
            expect(refused[`${baseURL}${p}`], `${p}: the frame was refused by the response's headers`).toBe("net::ERR_BLOCKED_BY_RESPONSE")
        }
    })

    test("API mode: connect-src allows the API base and the list's API requests go out with 0 violations", async ({ page, request }) => {
        test.skip(!API_BUILD, "API-mode build only (shell NEXT_PUBLIC_USE_MOCK=false, v2.51)")
        const res = await request.get("/vi")
        expect(res.status()).toBe(200)
        checkHeaders("API build GET /vi", res)
        // No API runs: every request to its origin gets an empty stand-in. A request the CSP refused never reaches the route.
        const reached: string[] = []
        await page.route(`${API_ORIGIN}/**`, (route) => {
            const u = new URL(route.request().url())
            reached.push(u.pathname)
            if (u.pathname.endsWith("/programs/degree-types")) return route.fulfill({ json: [] })
            if (/\/(programs|universities|rawdocuments)$/.test(u.pathname)) return route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 } })
            return route.fulfill({ status: 404, json: {} })
        })
        const w = await watch(page)
        await page.goto("/vi", { waitUntil: "domcontentloaded" })
        await w.quiet()
        await w.probe("API build /vi")
        await expect.poll(() => reached.length, { message: `API build /vi: requests to ${API_ORIGIN} reach the network`, timeout: 30000 }).toBeGreaterThan(0)
        await w.none("API build /vi")
    })
})
