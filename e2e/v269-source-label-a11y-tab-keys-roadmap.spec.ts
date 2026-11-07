import { test, expect, Page, Locator } from "@playwright/test"
import { existsSync, readFileSync } from "fs"
import path from "path"
import { hostOf, isOwnLink } from "./source-domains"

/**
 * v2.69 — honest source label, no dead login button, chat and heading a11y, tab keys leave browser shortcuts alone,
 * /roadmap fetches only the chosen university (audit A5: M11, M12, M17, M19, Someday v2.62 (b) and v2.63).
 *
 * - A program's link is labelled the official source only when its host is on the program's own university's domain;
 *   any other link keeps its link under the "data collected from" label (program page, dialog, card tooltip).
 * - The navbar has no login button.
 * - /chat and the chat widget: a heading (in the page's language), a labelled text box, named buttons; no heading-level
 *   jump on any scanned route, detail-dialog tab or syllabus-modal tab; the same element's aria-label/title differs
 *   between /vi and /en (localised); every control has an accessible name (Playwright's), also at 375 px.
 * - The tab key handler (detail dialog, syllabus modal) and the custom Select do nothing with Alt, Ctrl or Meta held
 *   (fix r1: except the Select's own Alt+ArrowDown / Alt+ArrowUp, the WAI-ARIA combobox keys).
 * - /roadmap?uni=X reads only X's roadmap files and never shows another university's course or picker value — also when
 *   /roadmap is reached through the navbar from another page (fix r1); without JavaScript its static HTML shows as at Base.
 *
 * Expectations come from public/mock and src/messages at run time, with the specs' own rules: a university's domain by
 * e2e/source-domains.ts (string operations on the universities.json website, not the app's table); the roadmap file set from the
 * roadmap indexes and the syllabus folders. Messages are read inside the tests, after the DOM checks that fail on Base.
 * domcontentloaded, not networkidle (AGENTS.md §12).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
type Locale = "vi" | "en"
type Messages = Record<string, Record<string, unknown>>
const messages: Record<Locale, Messages> = {
    vi: readJson(path.join(ROOT, "src", "messages", "vi.json")),
    en: readJson(path.join(ROOT, "src", "messages", "en.json")),
}
/** A message string; asserts the key exists (called inside test bodies, AGENTS.md §12 v2.54/v2.59 (d)). */
function msg(locale: Locale, ns: string, key: string): string {
    const v = messages[locale][ns]?.[key]
    expect(typeof v === "string" && v.length > 0, `message ${locale}.${ns}.${key}`).toBe(true)
    return v as string
}
const tidy = (s: string | null | undefined) => String(s ?? "").normalize("NFC").toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim()

// ---- data (read once per worker) ----
type Row = { id: string; name: string; code: string | null; universityName: string; universityId: string; sourceUrl: string | null }
type Uni = { id: string; code: string; name: string }
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

const isOwn = (r: Row) => isOwnLink(r)
/** Per university: the first program (search-index order) whose link is on its own domain, and the first whose link is not. */
const sourceCases = () =>
    once("sourceCases", () =>
        universities().map((u) => {
            const mine = rows().filter((r) => r.universityId === u.id && hostOf(r.sourceUrl))
            return { uni: u, own: mine.find((r) => isOwn(r)) ?? null, other: mine.find((r) => !isOwn(r)) ?? null }
        })
    )
/** What to type in the list search so that only this program is listed: its code, else its name, when no other row's name, code or university contains it; null when neither does. */
const searchTerm = (r: Row) => {
    for (const term of [r.code, r.name]) {
        const c = tidy(term)
        if (c.length >= 4 && rows().every((o) => o.id === r.id || ![o.name, o.code, o.universityName].some((t) => tidy(t).includes(c)))) return term!
    }
    return null
}

// ---- roadmap data ----
const ROADMAP_UNIS = ["FPT", "NEU", "TDTU", "UIT"]
const DEFAULT_UNI = "FPT"
const DEFAULT_CODE = "SWE201c"
const safe = (s: string) => s.replace(/[^a-zA-Z0-9_\-]/g, "_")
const indexOf = (uni: string) => once(`index:${uni}`, () => readJson(path.join(MOCK, "roadmaps", uni, "index.json")) as string[])
const hasSyllabi = (uni: string) => existsSync(path.join(MOCK, "syllabuses", uni))
/** What the page reads for a university's default course: its index, the course file, its syllabus where it has syllabi. */
const roadmapSet = (uni: string) => {
    if (!ROADMAP_UNIS.includes(uni)) return []
    const code = uni === DEFAULT_UNI ? DEFAULT_CODE : indexOf(uni)[0]
    return [`/mock/roadmaps/${uni}/index.json`, `/mock/roadmaps/${uni}/${safe(code)}.json`, ...(hasSyllabi(uni) ? [`/mock/syllabuses/${uni}/${safe(code)}.json`] : [])].sort()
}

// ---- page helpers ----
function recorder(page: Page) {
    const got: string[] = []
    let pending = 0
    let last = Date.now()
    const isMock = (u: string) => new URL(u).pathname.startsWith("/mock/")
    page.on("request", (r) => {
        if (!isMock(r.url())) return
        got.push(decodeURIComponent(new URL(r.url()).pathname))
        pending++
        last = Date.now()
    })
    // Done at the response headers: a 404 body from `next start` may never end (AGENTS.md §12).
    const done = (r: { url(): string }) => {
        if (!isMock(r.url())) return
        pending = Math.max(0, pending - 1)
        last = Date.now()
    }
    page.on("response", done)
    page.on("requestfailed", done)
    return {
        data: () => [...new Set(got.filter((p) => /^\/mock\/(roadmaps|roadmap-names|syllabuses)\//.test(p)))].sort(),
        quiet: async (ms = 1000) => {
            await expect.poll(() => pending === 0 && Date.now() - last >= ms, { timeout: 30000, intervals: [100] }).toBe(true)
        },
    }
}
const dialogNamed = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
async function openDetail(page: Page, p: Row, locale: Locale = "vi") {
    await page.goto(`/${locale}?program=${p.id}`, { waitUntil: "domcontentloaded" })
    const detail = dialogNamed(page, p.name.replace(/\s+/g, " ").trim())
    await expect(detail).toBeVisible({ timeout: 30000 })
    return detail
}
/** The keydown events as they reach window (after React's root listener): key, modifiers, defaultPrevented. */
async function recordKeys(page: Page) {
    await page.evaluate(() => {
        const w = window as unknown as { __v269keys: { key: string; prevented: boolean }[] }
        w.__v269keys = []
        window.addEventListener("keydown", (e) => w.__v269keys.push({ key: `${e.altKey ? "Alt+" : ""}${e.ctrlKey ? "Control+" : ""}${e.metaKey ? "Meta+" : ""}${e.shiftKey ? "Shift+" : ""}${e.key}`, prevented: e.defaultPrevented }))
    })
}
const lastKey = (page: Page) => page.evaluate(() => (window as unknown as { __v269keys: { key: string; prevented: boolean }[] }).__v269keys.at(-1) ?? null)
const SHORTCUTS = ["Alt+ArrowLeft", "Alt+ArrowRight", "Control+ArrowRight", "Control+Home", "Control+End", "Meta+ArrowLeft", "Meta+ArrowRight", "Alt+End"]
/** On a focused tab of `box`: every browser shortcut leaves the tab, the focus and the event alone; Shift+ArrowRight moves as ArrowRight. */
async function checkTabKeys(page: Page, box: Locator, label: string) {
    const selected = box.getByRole("tab", { selected: true })
    await selected.focus()
    const start = (await selected.textContent())!.trim()
    const startIndex = await box.getByRole("tab").evaluateAll((ts) => ts.findIndex((t) => t.getAttribute("aria-selected") === "true"))
    await recordKeys(page)
    const url = page.url()
    for (const key of SHORTCUTS) {
        await page.keyboard.press(key)
        expect.soft((await box.getByRole("tab", { selected: true }).textContent())!.trim(), `${label} ${key}: the selected tab stays`).toBe(start)
        expect.soft(await lastKey(page), `${label} ${key}: not prevented (the browser's shortcut)`).toEqual({ key, prevented: false })
    }
    expect(page.url(), `${label}: still on the page`).toBe(url)
    // From the starting tab again (a soft failure above may have moved it): Shift+ArrowRight moves as ArrowRight.
    await box.getByRole("tab").nth(startIndex).click()
    await box.getByRole("tab", { selected: true }).focus()
    await page.keyboard.press("Shift+ArrowRight")
    await expect(box.getByRole("tab", { selected: true }), `${label}: Shift+ArrowRight moves as ArrowRight`).not.toHaveText(start)
    expect(await lastKey(page)).toEqual({ key: "Shift+ArrowRight", prevented: true })
    await page.keyboard.press("ArrowLeft")
    await expect(box.getByRole("tab", { selected: true })).toHaveText(start)
}
async function openRoadmapSyllabus(page: Page, l: Locale = "vi") {
    const opener = page.getByRole("button", { name: msg(l, "roadmap", "viewSyllabus"), exact: true }).filter({ visible: true }).first()
    await expect(opener).toBeVisible({ timeout: 30000 })
    const modal = page.getByRole("dialog")
    await expect(async () => {
        await opener.click()
        await expect(modal).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 30000 })
    await expect(modal.getByRole("tab").first()).toBeVisible({ timeout: 20000 })
    return modal
}
/** The navbar link (through the mobile menu below md), a client navigation. */
async function clickNavLink(page: Page, key: string, l: Locale = "vi") {
    const menu = page.getByRole("button", { name: msg(l, "navbar", "menu"), exact: true })
    if (await menu.isVisible()) await menu.click()
    await page.getByRole("link", { name: msg(l, "navbar", key), exact: true }).click()
}

/**
 * Every distinct state of the visible text (outside <select>) and of the picker, with its time: from document start
 * (addInitScript) or from now in the current document (evaluate). Self-contained: Playwright ships its source.
 */
const installSampler = () => {
    const w = window as unknown as { __v269: { t: number; picker: string | null; texts: string[] }[] }
    w.__v269 = []
    let lastKey = ""
    const snap = () => {
        if (!document.body) return
        const texts: string[] = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const e = n.parentElement
            if (!e || e.closest("select,script,style,template,noscript")) continue
            const v = (n.nodeValue ?? "").trim()
            if (v && e.checkVisibility({ visibilityProperty: true })) texts.push(v)
        }
        // The roadmap picker: the page's select, only while the URL is /roadmap (the compare page has selects of its own).
        const sel = /\/roadmap\/?$/.test(location.pathname) ? (document.querySelector("main select") as HTMLSelectElement | null) : null
        const picker = sel && sel.checkVisibility({ visibilityProperty: true }) ? sel.value : null
        const key = `${picker}|${texts.join("\u0001")}`
        if (key === lastKey) return
        lastKey = key
        w.__v269.push({ t: Math.round(performance.now()), picker, texts })
    }
    new MutationObserver(snap).observe(document, { subtree: true, childList: true, characterData: true, attributes: true })
    document.addEventListener("DOMContentLoaded", snap)
    snap()
}
const samplesOf = (page: Page) => page.evaluate(() => (window as unknown as { __v269: { t: number; picker: string | null; texts: string[] }[] }).__v269)
/** Another roadmap university's course code shown, or the picker shown on another university, in the samples. */
async function paintedOther(page: Page, uni: string) {
    const samples = await samplesOf(page)
    const own = new Set(ROADMAP_UNIS.includes(uni) ? indexOf(uni) : [])
    const foreign = new Set(ROADMAP_UNIS.filter((u) => u !== uni).flatMap((u) => indexOf(u)).filter((x) => !own.has(x)))
    return {
        samples,
        courses: samples.flatMap((s) => s.texts.filter((x) => foreign.has(x)).map((x) => `${s.t} ms ${x}`)).slice(0, 8),
        pickers: samples.filter((s) => s.picker !== null && s.picker !== uni).map((s) => `${s.t} ms ${s.picker}`).slice(0, 8),
    }
}

/**
 * The a11y facts of the page (or of `scope`): visible headings in DOM order with their level; every visible
 * aria-label/title with the element's DOM path. On a whole page, an open dialog and the chat widget are left out.
 */
function a11yFacts(page: Page, scope: string | null) {
    return page.evaluate((sel) => {
        const root: Element = sel ? document.querySelector(sel)! : document.body
        const visible = (e: Element) => (e as HTMLElement).checkVisibility({ visibilityProperty: true })
        const outside = (e: Element) => !sel && !!e.closest('[role="dialog"], div.fixed.bottom-6.right-6')
        const pathOf = (e: Element) => {
            const parts: string[] = []
            for (let x: Element | null = e; x && x !== document.documentElement; x = x.parentElement) {
                let i = 1
                for (let s = x.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === x.tagName) i++
                parts.unshift(`${x.tagName.toLowerCase()}:${i}`)
            }
            return parts.join(">")
        }
        const headings = [...root.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]")]
            .filter((e) => visible(e) && !outside(e))
            .map((e) => ({ level: Number(e.getAttribute("aria-level") ?? e.tagName.slice(1)), text: (e.textContent ?? "").trim().slice(0, 60) }))
        const attr = (e: Element, k: string) => (e.getAttribute(k) ?? "").trim()
        const labels: { path: string; attr: string; value: string }[] = []
        for (const e of root.querySelectorAll("[aria-label],[title]")) {
            if (e.closest("svg") || !visible(e) || outside(e)) continue
            for (const k of ["aria-label", "title"]) if (attr(e, k)) labels.push({ path: pathOf(e), attr: k, value: attr(e, k) })
        }
        return { headings, labels }
    }, scope)
}
/**
 * Visible controls whose accessible name is empty, as Playwright computes it (fix r1: the textContent rule counted a
 * display:none text as a name). On a whole page, an open dialog and the chat widget are left out.
 */
const NAMED_ROLES = ["button", "link", "textbox", "searchbox", "combobox", "checkbox", "radio", "tab", "switch", "slider", "spinbutton", "menuitem"] as const
async function unnamedControls(page: Page, scope: string | null) {
    const root = scope ? page.locator(scope).first() : page.locator("body")
    const out: string[] = []
    for (const role of NAMED_ROLES) {
        for (const el of await root.getByRole(role, { name: /^\s*$/ }).all()) {
            const d = await el.evaluate(
                (e, whole) =>
                    whole && e.closest('[role="dialog"], div.fixed.bottom-6.right-6')
                        ? null
                        : `${e.tagName.toLowerCase()} ${[...e.querySelectorAll("svg")].map((s) => s.getAttribute("class") ?? "").join(" ").slice(0, 50)}`,
                !scope
            )
            if (d && (await el.isVisible())) out.push(`${role} ${d}`)
        }
    }
    return out
}
/** Level jumps: a heading more than one level below the previous one; on a whole page also a first heading other than h1. */
function jumps(levels: { level: number; text: string }[], page: boolean) {
    const out: string[] = []
    let prev = 0
    for (const h of levels) {
        if (prev === 0 ? page && h.level !== 1 : h.level > prev + 1) out.push(`h${prev || "-"} → h${h.level} "${h.text}"`)
        prev = h.level
    }
    return out
}

test.describe("v2.69 source label, login button, a11y, tab keys, roadmap fetch", () => {
    // Many pages per test on a shared machine (AGENTS.md §12): 30 s is too tight.
    test.describe.configure({ timeout: 240000 })

    test("program page (server HTML): the official-source label only on a link of the program's own university; another link under the collected label", async ({ request }) => {
        const cases = sourceCases()
        expect(cases.filter((c) => c.own).length, "every university has a program with its own link").toBe(universities().length)
        expect(cases.filter((c) => c.other).length, "programs with another host exist").toBeGreaterThan(0)
        const html = async (l: Locale, r: Row) => {
            const res = await request.get(`/${l}/programs/${r.id}`)
            expect(res.status(), `${l} ${r.id}`).toBe(200)
            // React separates adjacent text nodes with <!-- --> in server HTML.
            const page = (await res.text()).replace(/<!-- -->/g, "")
            const m = /data-testid="program-attribution"[\s\S]*?<\/section>/.exec(page)
            expect(m, `${l} ${r.id}: attribution section`).not.toBeNull()
            return m![0]
        }
        const linkOf = (r: Row) => `href="${r.sourceUrl!.replace(/&/g, "&amp;")}"`
        for (const l of ["vi", "en"] as Locale[]) {
            for (const c of cases) {
                if (c.other) {
                    const a = await html(l, c.other)
                    expect.soft(a, `${l} ${c.uni.code} ${c.other.id} (${hostOf(c.other.sourceUrl)}): the link stays`).toContain(linkOf(c.other))
                    expect.soft(a, `${l} ${c.uni.code} ${c.other.id} (${hostOf(c.other.sourceUrl)}): no official-source label`).not.toContain(`${msg(l, "programs", "sourceUrl")}:`)
                }
                if (c.own) {
                    const a = await html(l, c.own)
                    expect.soft(a, `${l} ${c.uni.code} ${c.own.id} (${hostOf(c.own.sourceUrl)}): the official-source label`).toContain(`${msg(l, "programs", "sourceUrl")}:`)
                    expect.soft(a, `${l} ${c.uni.code} ${c.own.id}: the link`).toContain(linkOf(c.own))
                }
            }
            for (const c of cases.filter((x) => x.other)) {
                expect.soft(await html(l, c.other!), `${l} ${c.uni.code} ${c.other!.id}: the collected label`).toContain(`${msg(l, "programs", "sourceUrlCollected")}:`)
            }
        }
        console.log(`[v269] program pages checked: ${cases.filter((c) => c.own).length} own-domain, ${cases.filter((c) => c.other).length} other-host (${cases.filter((c) => c.other).map((c) => `${c.uni.code} ${hostOf(c.other!.sourceUrl)}`).join(", ")}) × 2 locales`)
    })

    test("detail dialog and card: an FPT syllabase link is not labelled official, an FPT daihoc.fpt.edu.vn link is; the card tooltip says the same", async ({ page }) => {
        const fpt = universities().find((u) => u.code === "FPT")!
        const fptRows = rows().filter((r) => r.universityId === fpt.id && hostOf(r.sourceUrl))
        const other = fptRows.find((r) => !isOwn(r) && searchTerm(r))
        const own = fptRows.find((r) => isOwn(r) && searchTerm(r))
        expect(other && own, "an FPT program of each kind that a search lists alone").toBeTruthy()
        // Dialog Overview (the default tab): the section title above the link.
        let detail = await openDetail(page, other!)
        await expect(detail.locator(`a[href="${other!.sourceUrl}"]`).first()).toBeVisible({ timeout: 20000 })
        await expect(detail.getByText(msg("vi", "programs", "sourceUrl"), { exact: true }), `${other!.id} (${hostOf(other!.sourceUrl)})`).toHaveCount(0)
        await expect(detail.getByText(msg("vi", "programs", "sourceUrlCollected"), { exact: true })).toBeVisible()
        detail = await openDetail(page, own!)
        await expect(detail.getByText(msg("vi", "programs", "sourceUrl"), { exact: true }), `${own!.id} (${hostOf(own!.sourceUrl)})`).toBeVisible({ timeout: 20000 })
        // Card: its source link's tooltip, for each program alone in the list.
        await page.goto("/vi", { waitUntil: "domcontentloaded" })
        const box = page.getByPlaceholder(msg("vi", "programs", "searchPlaceholder"), { exact: true })
        for (const [r, key] of [[other!, "sourceLinkTitleCollected"], [own!, "sourceLinkTitle"]] as const) {
            await expect(async () => {
                await box.fill(searchTerm(r)!)
                await expect(page.getByTestId("program-card")).toHaveCount(1, { timeout: 3000 })
            }).toPass({ timeout: 30000 })
            await expect(page.getByTestId("program-card").locator("a[title]"), `${r.id} card tooltip`).toHaveAttribute("title", msg("vi", "programs", key))
        }
    })

    test("navbar: no login button on any page, desktop or mobile; the bar fits the viewport", async ({ page }) => {
        for (const route of ["/vi", "/en", "/vi/compare", "/en/roadmap"]) {
            await page.goto(route, { waitUntil: "domcontentloaded" })
            const nav = page.locator("nav").first()
            // The bar's controls render after mount (hydration-dependent): wait for the language button.
            await expect(nav.getByRole("button").first()).toBeVisible({ timeout: 20000 })
            await expect(page.getByRole("button", { name: /đăng nhập|sign ?in|log ?in/i }), `${route}: no login button`).toHaveCount(0)
            await expect(page.getByRole("link", { name: /đăng nhập|sign ?in|log ?in/i }), `${route}: no login link`).toHaveCount(0)
            const fit = await page.evaluate(() => {
                const bar = document.querySelector("nav")!.getBoundingClientRect()
                const last = [...document.querySelectorAll("nav button")].filter((b) => (b as HTMLElement).checkVisibility()).map((b) => b.getBoundingClientRect().right)
                return { scroll: document.documentElement.scrollWidth, inner: window.innerWidth, bar: Math.round(bar.right), rightmost: Math.round(Math.max(...last)) }
            })
            expect(fit.scroll, `${route}: no horizontal scroll`).toBeLessThanOrEqual(fit.inner)
            expect(fit.rightmost, `${route}: the last navbar control inside the bar`).toBeLessThanOrEqual(fit.bar)
            console.log(`[v269] ${route} navbar: scrollWidth ${fit.scroll} / ${fit.inner}, rightmost control ${fit.rightmost} / bar ${fit.bar}`)
        }
    })

    test("chat page and widget: a heading in the page's language, a labelled text box, named send/new-chat/close/copy, in each locale", async ({ page }) => {
        // As a visitor arrives: / redirects to /vi, whose chat provider stores a session — /en/chat must not show its title in Vietnamese.
        await page.goto("/vi", { waitUntil: "domcontentloaded" })
        await expect(page.locator("nav button").first()).toBeVisible({ timeout: 20000 })
        for (const l of ["vi", "en"] as Locale[]) {
            const other: Locale = l === "vi" ? "en" : "vi"
            await page.goto(`/${l}/chat`, { waitUntil: "domcontentloaded" })
            const h1 = page.getByRole("heading", { level: 1 })
            await expect(h1, `${l}/chat: one h1`).toHaveCount(1, { timeout: 20000 })
            await expect(h1, `${l}/chat: the chat's title in ${l}`).toContainText(msg(l, "chat", "title"))
            await expect(h1, `${l}/chat: no stored title of the other locale`).not.toContainText(msg(other, "chat", "newChat"))
            const box = page.getByRole("textbox", { name: msg(l, "chat", "inputLabel"), exact: true })
            await expect(box, `${l}/chat: the text box is labelled (not only by its placeholder)`).toBeVisible()
            await expect(box).toHaveAttribute("aria-label", msg(l, "chat", "inputLabel"))
            await expect(page.getByRole("button", { name: msg(l, "chat", "send"), exact: true }), `${l}/chat: send`).toBeVisible()
            // The greeting bubble's copy button (hover-revealed, still in the tree).
            await expect(page.getByRole("button", { name: msg(l, "chat", "copy"), exact: true }).first()).toHaveCount(1)
            // Below 640 px the header's new-chat text is display:none: the button keeps its name.
            const size = page.viewportSize()!
            await page.setViewportSize({ width: 375, height: 812 })
            await expect(page.locator("header").getByRole("button", { name: msg(l, "chat", "newChat"), exact: true }), `${l}/chat 375 px: new chat`).toBeVisible()
            await page.setViewportSize(size)

            await page.goto(`/${l}`, { waitUntil: "domcontentloaded" })
            const chat = page.locator("div.fixed.bottom-6.right-6")
            await chat.getByRole("button", { name: msg(l, "chat", "title"), exact: true }).click()
            await expect(chat.getByRole("heading", { name: msg(l, "chat", "title"), exact: true }), `${l} widget: heading`).toBeVisible({ timeout: 20000 })
            expect(await unnamedControls(page, "div.fixed.bottom-6.right-6"), `${l} widget: unnamed controls`).toEqual([])
            await expect(chat.getByRole("textbox", { name: msg(l, "chat", "inputLabel"), exact: true })).toHaveAttribute("aria-label", msg(l, "chat", "inputLabel"))
            await expect(chat.getByRole("button", { name: msg(l, "chat", "send"), exact: true })).toBeVisible()
            await expect(chat.getByRole("button", { name: msg(l, "chat", "close"), exact: true })).toBeVisible()
            await chat.getByRole("button", { name: msg(l, "chat", "close"), exact: true }).click()
            await expect(chat.getByRole("heading")).toHaveCount(0)
        }
    })

    test("every route, dialog tab and syllabus tab: no heading-level jump, every control named (Playwright's accessible name), no aria-label/title identical on /vi and /en — at the project's width and at 375 px", async ({ page }) => {
        test.setTimeout(600000)
        const first = rows()[0]
        const DIALOG = '[role="dialog"]'
        const WIDGET = "div.fixed.bottom-6.right-6"
        type State = { route: string; scope: string | null; label: string; open?: (p: Page, l: Locale) => Promise<void>; tabs?: boolean }
        const states: State[] = [
            ...["", "/compare", "/analytics", "/roadmap", "/materials", "/chat", `/programs/${first.id}`].map((route) => ({ route, scope: null, label: route || "/" })),
            { route: `?program=${first.id}`, scope: DIALOG, label: "detail dialog", tabs: true },
            {
                route: "",
                scope: WIDGET,
                label: "chat widget",
                open: async (p, l) => {
                    await p.locator(WIDGET).getByRole("button", { name: msg(l, "chat", "title"), exact: true }).click()
                },
            },
            { route: "/roadmap", scope: DIALOG, label: "syllabus modal on /roadmap", tabs: true, open: async (p, l) => void (await openRoadmapSyllabus(p, l)) },
        ]
        const widths = [page.viewportSize()!.width, ...(page.viewportSize()!.width > 640 ? [375] : [])]
        const defects: string[] = []
        const checked: string[] = []
        for (const width of widths) {
            await page.setViewportSize({ width, height: width === 375 ? 812 : page.viewportSize()!.height })
            for (const s of states) {
                const facts = new Map<string, Awaited<ReturnType<typeof a11yFacts>>>()
                const tabNames: string[] = []
                for (const l of ["vi", "en"] as Locale[]) {
                    await page.goto(`/${l}${s.route}`, { waitUntil: "domcontentloaded" })
                    // Loaded and hydrated: the navbar's controls render after mount; then the route's own content.
                    await expect(page.locator("nav button").first()).toBeVisible({ timeout: 20000 })
                    if (s.open) await s.open(page, l)
                    if (s.scope) await expect(page.locator(s.scope).first()).toBeVisible({ timeout: 30000 })
                    const where = `${width}px ${l} ${s.label}`
                    // A route with no heading at all is a defect of its own (Base /chat), listed with the others.
                    const headed = await page
                        .locator(s.scope ?? "main")
                        .getByRole("heading")
                        .first()
                        .waitFor({ timeout: 30000 })
                        .then(() => true, () => false)
                    if (!headed) defects.push(`${where}: no heading`)
                    const tabs = s.tabs ? page.locator(s.scope!).first().getByRole("tab") : null
                    const n = tabs ? await tabs.count() : 1
                    for (let i = 0; i < n; i++) {
                        if (tabs) {
                            await tabs.nth(i).click()
                            await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true")
                            if (l === "vi") tabNames[i] = (await tabs.nth(i).textContent())!.trim()
                        }
                        await page.waitForTimeout(800)
                        const at = tabs ? `${where} [tab ${i + 1} ${tabNames[i] ?? ""}]` : where
                        const f = await a11yFacts(page, s.scope)
                        facts.set(`${l}|${i}`, f)
                        for (const j of jumps(f.headings, !s.scope)) defects.push(`${at}: heading jump ${j}`)
                        for (const u of await unnamedControls(page, s.scope)) defects.push(`${at}: unnamed ${u}`)
                        if (l === "vi") checked.push(tabs ? `${width}px ${s.label} tab ${i + 1}` : `${width}px ${s.label}`)
                    }
                }
                for (const [k, vi] of facts) {
                    if (!k.startsWith("vi|")) continue
                    const en = new Map((facts.get(`en|${k.slice(3)}`)?.labels ?? []).map((x) => [`${x.path}|${x.attr}`, x.value]))
                    for (const x of vi.labels)
                        if (en.get(`${x.path}|${x.attr}`) === x.value && /\p{L}/u.test(x.value)) defects.push(`${width}px ${s.label}${s.tabs ? ` [tab ${Number(k.slice(3)) + 1}]` : ""}: ${x.attr}="${x.value}" is the same on /vi and /en`)
                }
            }
        }
        console.log(`[v269] a11y states checked (${checked.length}): ${checked.join(" | ")}`)
        expect(defects).toEqual([])
    })

    test("tab keys, detail dialog: Alt, Ctrl or Meta + arrow/Home/End is left to the browser; Shift + arrow moves as the plain key", async ({ page }) => {
        const detail = await openDetail(page, rows()[0])
        await checkTabKeys(page, detail, "detail dialog")
    })

    test("tab keys, syllabus modal on /roadmap: Alt, Ctrl or Meta + arrow/Home/End is left to the browser; Shift + arrow moves as the plain key", async ({ page }) => {
        await page.goto("/vi/roadmap", { waitUntil: "domcontentloaded" })
        const modal = await openRoadmapSyllabus(page)
        await checkTabKeys(page, modal, "syllabus modal")
    })

    test("Select: Alt+ArrowDown opens and Alt+ArrowUp picks + closes (the combobox's keys); Alt/Ctrl/Meta with another key is left to the browser, closed or open", async ({ page }) => {
        await page.goto("/vi", { waitUntil: "domcontentloaded" })
        const select = page.getByRole("combobox", { name: msg("vi", "programs", "cohortAria"), exact: true })
        await expect(select).toBeVisible({ timeout: 20000 })
        await expect(async () => {
            await select.focus()
            await recordKeys(page)
        }).toPass({ timeout: 20000 })
        // Closed: browser shortcuts neither open it nor are prevented.
        for (const key of ["Control+ArrowDown", "Meta+ArrowDown", "Control+End", "Alt+Home", "Alt+ArrowLeft"]) {
            await page.keyboard.press(key)
            expect.soft(await select.getAttribute("aria-expanded"), `closed Select ${key}: not opened`).toBe("false")
            expect.soft(await lastKey(page), `closed Select ${key}: not prevented`).toEqual({ key, prevented: false })
        }
        if ((await select.getAttribute("aria-expanded")) === "true") await page.keyboard.press("Escape")
        const before = (await select.textContent())!.trim()
        await page.keyboard.press("Alt+ArrowDown")
        await expect(select, "Alt+ArrowDown opens the listbox").toHaveAttribute("aria-expanded", "true")
        expect(await lastKey(page)).toEqual({ key: "Alt+ArrowDown", prevented: true })
        // Open, focus on the trigger: ArrowDown moves the highlight, Alt+ArrowUp picks it and closes.
        await page.keyboard.press("ArrowDown")
        await page.keyboard.press("Alt+ArrowUp")
        await expect(select, "Alt+ArrowUp closes").toHaveAttribute("aria-expanded", "false")
        expect(await lastKey(page)).toEqual({ key: "Alt+ArrowUp", prevented: true })
        await expect(select, "Alt+ArrowUp picked the highlighted option").not.toHaveText(before)
        // Open with the focus in the listbox (its own key handler): browser shortcuts left alone, Alt+ArrowUp picks + closes.
        const picked = (await select.textContent())!.trim()
        await page.keyboard.press("Alt+ArrowDown")
        await expect(select).toHaveAttribute("aria-expanded", "true")
        // The listbox the trigger controls (its aria-controls id).
        const listbox = page.locator(`[id="${await select.getAttribute("aria-controls")}"]`)
        await expect(listbox).toHaveAttribute("role", "listbox")
        await listbox.focus()
        const highlighted = await select.getAttribute("aria-activedescendant")
        for (const key of ["Control+End", "Alt+Home", "Meta+ArrowUp", "Alt+ArrowLeft"]) {
            await page.keyboard.press(key)
            expect.soft(await lastKey(page), `open listbox ${key}: not prevented`).toEqual({ key, prevented: false })
            expect.soft(await select.getAttribute("aria-activedescendant"), `open listbox ${key}: the highlight stays`).toBe(highlighted)
        }
        await page.keyboard.press("ArrowDown")
        await page.keyboard.press("Alt+ArrowUp")
        await expect(select, "listbox Alt+ArrowUp closes").toHaveAttribute("aria-expanded", "false")
        await expect(select, "listbox Alt+ArrowUp picked the next option").not.toHaveText(picked)
    })

    test("/roadmap?uni=X: only X's roadmap files are read, and no other university's course or picker value is ever shown; without JavaScript the static HTML shows as at Base", async ({ page, browser }) => {
        const unis = universities()
        const noData = unis.find((u) => !ROADMAP_UNIS.includes(u.code))!
        const cases = [
            { q: "", uni: DEFAULT_UNI },
            ...ROADMAP_UNIS.map((u) => ({ q: `?uni=${u}`, uni: u })),
            { q: `?uni=${noData.code}`, uni: noData.code },
            { q: "?uni=zzz", uni: DEFAULT_UNI },
        ]
        await page.addInitScript(installSampler)
        for (const c of cases) {
            const rec = recorder(page)
            await page.goto(`/vi/roadmap${c.q}`, { waitUntil: "domcontentloaded" })
            if (ROADMAP_UNIS.includes(c.uni)) {
                const code = c.uni === DEFAULT_UNI ? DEFAULT_CODE : indexOf(c.uni)[0]
                await expect(page.locator("main").getByText(code, { exact: true }).first(), `${c.q || "/roadmap"}: ${c.uni}'s default course`).toBeVisible({ timeout: 30000 })
            } else {
                await expect(page.locator("main select")).toHaveValue(c.uni, { timeout: 30000 })
                await expect(page.locator("main select")).toBeVisible()
            }
            await rec.quiet()
            expect(rec.data(), `${c.q || "/roadmap"}: the roadmap files read`).toEqual(roadmapSet(c.uni))
            const painted = await paintedOther(page, c.uni)
            expect(painted.courses, `${c.q || "/roadmap"}: another university's course shown`).toEqual([])
            expect(painted.pickers, `${c.q || "/roadmap"}: the picker shown on another university`).toEqual([])
            console.log(`[v269] /vi/roadmap${c.q}: ${rec.data().length} roadmap files, ${painted.samples.length} paint states, picker ${[...new Set(painted.samples.map((s) => s.picker))].join(" → ")}`)
        }
        // The static HTML (one file for every ?uni=): no client-side bailout, the Base FPT markup kept under an invisible wrapper.
        for (const l of ["vi", "en"]) {
            const html = readFileSync(path.join(ROOT, ".next", "server", "app", l, "roadmap.html"), "utf8")
            expect(html.match(/BAILOUT_TO_CLIENT_SIDE_RENDERING/g) ?? [], `${l}: bailout`).toEqual([])
            expect(html, `${l}: the university part is invisible until the URL is read`).toMatch(/data-testid="roadmap-university" class="[^"]*\binvisible\b/)
            expect(html).toMatch(new RegExp(`<option value="${DEFAULT_UNI}" selected=""`))
        }
        // Without JavaScript the URL is never read: the university part shows as the static HTML has it (Base: the FPT default).
        const noJs = await browser.newContext({ javaScriptEnabled: false })
        try {
            const p = await noJs.newPage()
            await p.goto(`${new URL(page.url()).origin}/vi/roadmap?uni=${ROADMAP_UNIS[1]}`, { waitUntil: "domcontentloaded" })
            const part = p.getByTestId("roadmap-university")
            expect(await part.evaluate((e) => e.checkVisibility({ visibilityProperty: true })), "no JavaScript: the university part is visible").toBe(true)
            await expect(part.getByText(DEFAULT_CODE, { exact: true }).first(), "no JavaScript: the static FPT default").toBeVisible()
        } finally {
            await noJs.close()
        }
    })

    test("/roadmap through the navbar from another page after a ?uni= visit: no file or course of another university before the URL is read", async ({ page }) => {
        const uni = ROADMAP_UNIS.find((u) => u !== DEFAULT_UNI)!
        const rec1 = recorder(page)
        await page.goto(`/vi/roadmap?uni=${uni}`, { waitUntil: "domcontentloaded" })
        await expect(page.locator("main").getByText(indexOf(uni)[0], { exact: true }).first()).toBeVisible({ timeout: 30000 })
        await rec1.quiet()
        const before = rec1.data()
        // A client navigation away (the page instance and its module caches stay), then back through the navbar link.
        await clickNavLink(page, "compare")
        await expect.poll(() => new URL(page.url()).pathname).toBe("/vi/compare")
        await expect(page.locator("main").getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30000 })
        await page.evaluate(installSampler)
        const rec2 = recorder(page)
        await clickNavLink(page, "roadmap")
        await expect.poll(() => new URL(page.url()).pathname).toBe("/vi/roadmap")
        // The university of the URL Next leaves (16.2.1 reopens the cached `?uni=` URL — v2.63; the default when it has none).
        await expect.poll(() => page.locator("main select").inputValue(), { timeout: 30000 }).not.toBe("")
        const v = new URL(page.url()).searchParams.get("uni")
        const shown = v !== null && ROADMAP_UNIS.includes(v) ? v : DEFAULT_UNI
        await expect(page.locator("main").getByText(shown === DEFAULT_UNI ? DEFAULT_CODE : indexOf(shown)[0], { exact: true }).first()).toBeVisible({ timeout: 30000 })
        await rec2.quiet(1500)
        // The files of the URL's university not read yet in this document (the page's fetchers cache what they read).
        expect(rec2.data(), `back on ${new URL(page.url()).search || "/roadmap"}: the roadmap files read`).toEqual(roadmapSet(shown).filter((f) => !before.includes(f)))
        const painted = await paintedOther(page, shown)
        expect(painted.courses, "another university's course shown on the way").toEqual([])
        expect(painted.pickers, "the picker shown on another university on the way").toEqual([])
        console.log(`[v269] navbar back to /roadmap from /vi/compare after ?uni=${uni}: URL ${new URL(page.url()).pathname}${new URL(page.url()).search} → ${shown}; files read ${rec2.data().length}; paint states ${painted.samples.length}`)
    })
})
