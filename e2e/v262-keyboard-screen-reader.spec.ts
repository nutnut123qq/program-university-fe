import { test, expect, Locator, Page } from "@playwright/test"
import { existsSync, readFileSync } from "fs"
import path from "path"
import { isOwnLink } from "./source-domains"

/**
 * v2.62 — keyboard and screen-reader residuals (audit 2026-10-30 §3 V8).
 *
 * - Course rows: each curriculum row holds a "Đề cương" button that Tab reaches; Enter/Space open that course's
 *   syllabus, Escape closes it and focus returns to the same button. While the syllabus file loads the modal is
 *   already open with its loading line (focus inside, Escape closes); a file that fails shows the "no syllabus" state.
 * - The syllabus modal's tabs are an APG tablist (named, role=tab + aria-selected, roving tabindex, arrows/Home/End
 *   move focus and select, one tabpanel named by its tab); the detail dialog's tablist is named too.
 * - The wishlist sheet's built-in close button reads the page locale ("Đóng" on /vi, "Close" on /en), like the
 *   detail dialog's and the syllabus modal's.
 * - Every visible card's "Xem chi tiết" and every wishlist row's detail/remove button has its own name with the
 *   program and its university (program names repeat across universities); the card's source link keeps its
 *   visible label as its name at phone width.
 * - With a modal open, the floating chat button is inert and the overlay paints over it; it works again after.
 * - A long syllabus title wraps instead of being cut.
 *
 * Fixtures come from public/mock at test time by rule (nothing named is pinned): FIRST = the first program in
 * listing order (= the first card); ROW = the first program in listing order with >= 2 curriculum rows that have
 * a syllabus file at its university; LONG = the curriculum row (FPT/TDTU programs in listing order) with the
 * longest syllabus title; SAME = the first program name in listing order shared by programs of >= 2
 * universities whose first search-result page (the list's search rule, restated) shows >= 2 of them at
 * different universities. Messages are read inside test bodies (a missing key fails that test only);
 * domcontentloaded, not networkidle (AGENTS.md §12); keyboard input waits for a hydration-dependent signal first.
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
const fill = (s: string, params: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? params[k] : m))
/** Accessible names collapse runs of white space (757 course names in the snapshot hold double spaces). */
const ws = (s: string) => s.replace(/\s+/g, " ").trim()
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

type Program = { id: string; name: string; code: string | null; universityName: string; universityId: string; sourceUrl: string | null }
type Course = { courseCode: string | null; courseName: string }
const chunks: string[] = readJson(path.join(MOCK, "index.json")).chunks
const listed: Program[] = chunks.flatMap((c) => readJson(path.join(MOCK, "programs", c)))
const universities: { id: string; code: string }[] = readJson(path.join(MOCK, "universities.json"))
const uniCode = (p: Program) => universities.find((u) => u.id === p.universityId)?.code ?? ""
// fetchSyllabus's file name rule (src/features/programs/api.ts), restated.
const safe = (s: string) => s.replace(/[^a-zA-Z0-9_\-]/g, "_")
const syllabusFile = (uni: string, code: string) => path.join(MOCK, "syllabuses", safe(uni), `${safe(code)}.json`)
const hasSyllabus = (uni: string, c: Course) => !!c.courseCode && existsSync(syllabusFile(uni, c.courseCode))
const curriculaOf = (p: Program): Course[] => {
    const f = path.join(MOCK, "curricula", `${p.id}.json`)
    return existsSync(f) ? readJson(f) : []
}
/** The modal's title: the syllabus file's name, else the row's course name (SyllabusDetailModal). */
const syllabusTitle = (uni: string, c: Course): string =>
    ws((hasSyllabus(uni, c) && readJson(syllabusFile(uni, c.courseCode!)).info?.syllabusName) || c.courseName)
/** The row button's course part: "<code> <name>", or the name for a row without a code. */
const courseLabel = (c: Course) => (c.courseCode ? `${c.courseCode} ${c.courseName}` : c.courseName)

const FIRST = listed[0]
const ROW = (() => {
    for (const p of listed) {
        const cs = curriculaOf(p)
        if (cs.filter((c) => hasSyllabus(uniCode(p), c)).length >= 2) return { p, uni: uniCode(p), cs }
    }
    return null
})()
const LONG = (() => {
    let best: { p: Program; c: Course; title: string; english: string | null } | null = null
    for (const p of listed) {
        const uni = uniCode(p)
        if (uni !== "FPT" && uni !== "TDTU") continue
        for (const c of curriculaOf(p)) {
            if (!hasSyllabus(uni, c)) continue
            const info = readJson(syllabusFile(uni, c.courseCode!)).info ?? {}
            const title: string = info.syllabusName || c.courseName
            if (!best || title.length > best.title.length) best = { p, c, title, english: info.syllabusEnglish ?? null }
        }
    }
    return best
})()
/** The list's search in mock mode (api.ts applyFiltersAndSort, restated): lower-case substring of name, code or university, listing order, 12 cards a page. */
const firstResultPage = (q: string) =>
    listed.filter((p) => [p.name, p.code ?? "", p.universityName].some((f) => f.toLowerCase().includes(q.toLowerCase()))).slice(0, 12)
const SAME = (() => {
    const byName = new Map<string, Program[]>()
    for (const p of listed) byName.set(p.name, [...(byName.get(p.name) ?? []), p])
    for (const group of byName.values()) {
        const second = group.find((p) => p.universityName !== group[0].universityName)
        const page1 = firstResultPage(group[0].name).filter((p) => p.name === group[0].name)
        if (second && new Set(page1.map((p) => p.universityName)).size >= 2) return { name: group[0].name, a: group[0], b: second, page1 }
    }
    return null
})()

const dialogNamed = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const focusInside = (box: Locator) => box.evaluate((el) => el.contains(document.activeElement))
/**
 * Role and accessible name of one aria-snapshot line: `- button "Name"`, or YAML-quoted as a whole
 * (`- 'button "Name: x"'`) when the name holds ": "; null for a line of another shape.
 */
function ariaLine(line: string): { role: string; name: string } | null {
    let s = line.replace(/^\s*- /, "")
    if (s.startsWith("'")) {
        let inner = ""
        for (let i = 1; i < s.length; i++) {
            if (s[i] === "'" && s[i + 1] === "'") {
                inner += "'"
                i++
            } else if (s[i] === "'") break
            else inner += s[i]
        }
        s = inner
    }
    const m = /^([\w-]+)(?: "((?:[^"\\]|\\.)*)")?/.exec(s)
    return m ? { role: m[1], name: m[2] === undefined ? "" : JSON.parse(`"${m[2]}"`) } : null
}
/** The accessible name Playwright computes for the element (the first line of its aria snapshot). */
async function accName(l: Locator): Promise<string> {
    return ariaLine((await l.ariaSnapshot()).split("\n")[0])?.name ?? ""
}

async function openDetail(page: Page, p: Program, locale: Locale = "vi") {
    await page.goto(`/${locale}?program=${p.id}`, { waitUntil: "domcontentloaded" })
    const detail = dialogNamed(page, p.name)
    await expect(detail).toBeVisible({ timeout: 30000 })
    return detail
}
async function openCurriculum(page: Page, p: Program, locale: Locale = "vi") {
    const detail = await openDetail(page, p, locale)
    const tab = detail.getByRole("tab", { name: msg(locale, "programs", "curriculumTab"), exact: true })
    await tab.click()
    await expect(detail.locator("tbody tr").first()).toBeVisible({ timeout: 15000 })
    return { detail, tab }
}
/** The curriculum row of a course, by its code cell (mock mode lists rows by course name, AGENTS.md §12 v2.59 (c)). */
const rowOf = (page: Page, detail: Locator, code: string) =>
    detail.locator("tbody tr").filter({ has: page.locator("td:nth-child(1)").getByText(code, { exact: true }) })
async function openWishlist(page: Page, ids: string[], locale: Locale = "vi") {
    await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" })
    await page.evaluate((list) => window.localStorage.setItem("tedo:wishlist", JSON.stringify(list)), ids)
    await page.reload({ waitUntil: "domcontentloaded" })
    const openBtn = page.getByTestId("wishlist-open")
    // "(N)" renders only once the wishlist store has read localStorage (hydrated).
    await expect(openBtn).toContainText(`(${ids.length})`, { timeout: 15000 })
    await openBtn.click()
    const sheet = dialogNamed(page, msg(locale, "wishlist", "wishlistTitle"))
    await expect(sheet).toBeVisible({ timeout: 15000 })
    return sheet
}
async function openRoadmapSyllabus(page: Page, locale: Locale = "vi") {
    await page.goto(`/${locale}/roadmap`, { waitUntil: "domcontentloaded" })
    const opener = page.getByRole("button", { name: msg(locale, "roadmap", "viewSyllabus"), exact: true }).filter({ visible: true }).first()
    await expect(opener).toBeVisible({ timeout: 30000 })
    const dialog = page.getByRole("dialog")
    // The button is in the static HTML: retry until hydration lets Enter open the modal (v249).
    await expect(async () => {
        await opener.focus()
        await page.keyboard.press("Enter")
        await expect(dialog).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 30000 })
    return dialog
}

// ---- the floating chat button (src/features/programs/components/SlmChatAssistant.tsx; chat-admissions.spec.ts uses this root) ----
const CHAT = "div.fixed.bottom-6.right-6"
async function chatCentre(page: Page) {
    const button = page.locator(CHAT).getByRole("button", { name: msg("vi", "chat", "title"), exact: true })
    await expect(button).toBeVisible({ timeout: 30000 })
    const b = (await button.boundingBox())!
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
/**
 * What paints at a point: inside the chat widget; inside an overlay layer — an element of the hit's chain with
 * position:fixed and z-index >= 50 (the detail dialog's backdrop, the syllabus and sheet wrappers; the chat widget
 * is z-40 since v2.62); inside a dialog box. The layer's rect and the viewport are kept for the log.
 */
const hitAt = (page: Page, c: { x: number; y: number }) =>
    page.evaluate(({ x, y, chat }) => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null
        let layer: HTMLElement | null = null
        for (let e: HTMLElement | null = el; e && !layer; e = e.parentElement) {
            const cs = getComputedStyle(e)
            if (cs.position === "fixed" && Number(cs.zIndex) >= 50) layer = e
        }
        const r = layer?.getBoundingClientRect()
        return {
            what: el ? `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 5).join(".")}` : "none",
            chat: !!el?.closest(chat),
            layer: !!layer,
            inDialog: !!el?.closest('[role="dialog"]'),
            layerRect: r ? [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v)).join(",") : "",
            viewport: `${innerWidth}x${innerHeight}, client ${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`,
        }
    }, { ...c, chat: CHAT })
const chatInert = (page: Page) => page.locator(CHAT).evaluate((el) => el.closest("[inert]") !== null)
/** focus() on the chat button: true when it took focus (focus is put back where it was). */
const chatTakesFocus = (page: Page) =>
    page.evaluate((chat) => {
        const b = document.querySelector<HTMLElement>(`${chat} button`)
        if (!b) return false
        const before = document.activeElement
        b.focus()
        const took = document.activeElement === b
        if (took && before instanceof HTMLElement) before.focus()
        return took
    }, CHAT)
async function expectChatUnder(page: Page, box: Locator, c: { x: number; y: number }, label: string) {
    const hit = await hitAt(page, c)
    console.log(`[v262 ${test.info().project.name}] ${label}: at the chat button's centre ${JSON.stringify(hit)}`)
    expect(hit.chat, `${label}: what paints at the chat button's centre (${hit.what})`).toBe(false)
    expect(hit.layer || hit.inDialog, `${label}: the overlay is at the chat button's centre (${JSON.stringify(hit)})`).toBe(true)
    expect(await chatInert(page), `${label}: the chat widget is inert`).toBe(true)
    expect(await chatTakesFocus(page), `${label}: focus() on the chat button`).toBe(false)
    const controls = await box.evaluate((el) => el.querySelectorAll("a[href], button, input, select, textarea, summary, [tabindex]").length)
    for (let i = 1; i <= controls + 3; i++) {
        await page.keyboard.press("Tab")
        expect(await page.evaluate((chat) => !!document.activeElement?.closest(chat), CHAT), `${label}: Tab #${i} on the chat`).toBe(false)
    }
}
async function expectChatUsable(page: Page, c: { x: number; y: number }, label: string) {
    await expect.poll(() => hitAt(page, c).then((h) => h.chat), `${label}: the chat button paints at its centre again`).toBe(true)
    expect(await chatInert(page), `${label}: the chat widget is not inert`).toBe(false)
    const button = page.locator(CHAT).getByRole("button", { name: msg("vi", "chat", "title"), exact: true })
    await button.focus()
    await expect(button, `${label}: the chat button takes focus`).toBeFocused()
}

test.describe("v2.62 — keyboard and screen-reader residuals", () => {
    test.describe.configure({ timeout: 180000 })

    test("messages: the new labels exist in vi and en with their parameters, start with the visible label, and vi = en", () => {
        const keyPaths = (o: Record<string, unknown>, pre = ""): string[] =>
            Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keyPaths(v as Record<string, unknown>, `${pre}${k}.`) : [`${pre}${k}`]))
        expect(keyPaths(messages.vi), "vi and en: the same keys in the same order").toEqual(keyPaths(messages.en))
        for (const l of ["vi", "en"] as const) {
            expect(msg(l, "programs", "viewDetailFor")).toMatch(new RegExp(`^${esc(msg(l, "programs", "viewDetail"))}.*\\{name\\}.*\\{university\\}`))
            expect(msg(l, "programs", "syllabusFor")).toMatch(new RegExp(`^${esc(msg(l, "programs", "syllabusLink"))}.*\\{course\\}`))
            expect(msg(l, "wishlist", "wishlistRemoveFor")).toMatch(new RegExp(`^${esc(msg(l, "wishlist", "wishlistRemove"))}.*\\{name\\}.*\\{university\\}`))
            expect(msg(l, "wishlist", "wishlistRemoveId")).toMatch(new RegExp(`^${esc(msg(l, "wishlist", "wishlistRemove"))}.*\\{id\\}`))
            msg(l, "programs", "detailTabsLabel")
            msg(l, "syllabus", "tabsLabel")
        }
    })

    test("course rows by keyboard: Tab reaches a row's syllabus button, Enter opens that course's syllabus, Escape returns focus to it", async ({ page }) => {
        expect(ROW, "a program with >= 2 curriculum rows that have a syllabus file").toBeTruthy()
        const { p, uni, cs } = ROW!
        const { detail, tab } = await openCurriculum(page, p)
        await expect(detail.locator("tbody tr")).toHaveCount(cs.length)
        await tab.focus()
        const focusedRow = () =>
            page.evaluate(() => {
                const a = document.activeElement
                const r = a?.closest("tbody tr")
                return r ? { tag: a!.tagName, code: (r.querySelector("td:nth-child(1)")?.textContent ?? "").trim() } : null
            })
        let row: { tag: string; code: string } | null = null
        for (let i = 1; i <= 40 && !row; i++) {
            await page.keyboard.press("Tab")
            row = await focusedRow()
        }
        expect(row, "Tab from the curriculum tab reaches a control inside a course row (40 presses)").not.toBeNull()
        // On to the first row whose course has a syllabus file (each row is one Tab stop).
        for (let i = 0; i < cs.length && row && !cs.some((c) => c.courseCode === row!.code && hasSyllabus(uni, c)); i++) {
            await page.keyboard.press("Tab")
            row = await focusedRow()
        }
        expect(row?.tag, "the row control is a button").toBe("BUTTON")
        const course = cs.find((c) => c.courseCode === row!.code && hasSyllabus(uni, c))!
        expect(course, `a row with a syllabus file reached by Tab (${row?.code})`).toBeTruthy()
        const control = detail.getByRole("button", { name: ws(fill(msg("vi", "programs", "syllabusFor"), { course: courseLabel(course) })), exact: true })
        await expect(control).toBeFocused()
        // Shown while it has keyboard focus (it is a hover hint for the mouse).
        await expect(control).toHaveCSS("opacity", "1")

        for (const key of ["Enter", "Space"]) {
            await page.keyboard.press(key)
            const syllabus = dialogNamed(page, syllabusTitle(uni, course))
            await expect(syllabus, `${key} opens the syllabus of ${course.courseCode}`).toBeVisible({ timeout: 20000 })
            await expect(page.getByRole("dialog")).toHaveCount(2)
            await expect.poll(() => focusInside(syllabus)).toBe(true)
            await page.keyboard.press("Escape")
            await expect(page.getByRole("dialog")).toHaveCount(1)
            await expect(control, `after Escape (${key}) focus is back on the row button`).toBeFocused()
        }

        // One button per row, named by its course: unique within the program.
        const names = (await detail.locator("tbody").ariaSnapshot())
            .split("\n")
            .map(ariaLine)
            .filter((x) => x?.role === "button")
            .map((x) => x!.name)
        const expected = cs.map((c) => ws(fill(msg("vi", "programs", "syllabusFor"), { course: courseLabel(c) })))
        expect(new Set(expected).size).toBe(cs.length)
        expect([...names].sort()).toEqual([...expected].sort())
    })

    test("course row → syllabus while its file loads: the modal opens at once with the loading line, Escape closes it and focus returns; a failed file shows the no-syllabus state", async ({ page }) => {
        expect(ROW).toBeTruthy()
        const { p, uni, cs } = ROW!
        const [held, failed] = cs.filter((c) => hasSyllabus(uni, c))
        let release: () => void = () => {}
        const gate = new Promise<void>((r) => (release = r))
        const heldUrl = `/mock/syllabuses/${safe(uni)}/${safe(held.courseCode!)}.json`
        await page.route(`**${heldUrl}`, async (route) => {
            await gate
            await route.fulfill({ path: syllabusFile(uni, held.courseCode!) })
        })
        await page.route(`**/mock/syllabuses/${safe(uni)}/${safe(failed.courseCode!)}.json`, (route) => route.abort())
        const { detail } = await openCurriculum(page, p)

        const heldControl = rowOf(page, detail, held.courseCode!).getByRole("button")
        await expect(heldControl, `the row of ${held.courseCode} holds one control`).toHaveCount(1)
        await heldControl.focus()
        await page.keyboard.press("Enter")
        // Pending: open at once, titled by the row's course name, the loading line, focus inside.
        const pending = dialogNamed(page, ws(held.courseName))
        await expect(pending).toBeVisible({ timeout: 10000 })
        await expect(pending.getByText(msg("vi", "syllabus", "loading"), { exact: true })).toBeVisible()
        await expect.poll(() => focusInside(pending)).toBe(true)
        await page.keyboard.press("Escape")
        await expect(page.getByRole("dialog")).toHaveCount(1)
        await expect(heldControl, "Escape while loading: focus back on the row button").toBeFocused()
        const heldDone = page.waitForResponse((r) => new URL(r.url()).pathname === heldUrl)
        release()
        await heldDone
        await expect(page.getByRole("dialog"), "the late file opens nothing").toHaveCount(1)

        // Failed: the file request fails -> the no-syllabus state; Escape returns focus.
        const failedControl = rowOf(page, detail, failed.courseCode!).getByRole("button")
        await failedControl.focus()
        await page.keyboard.press("Enter")
        const failedDialog = dialogNamed(page, ws(failed.courseName))
        await expect(failedDialog.getByRole("heading", { name: msg("vi", "syllabus", "emptyTitle"), exact: true })).toBeVisible({ timeout: 15000 })
        await page.keyboard.press("Escape")
        await expect(page.getByRole("dialog")).toHaveCount(1)
        await expect(failedControl, "Escape on the failed state: focus back on the row button").toBeFocused()
    })

    test("syllabus tabs: a named tablist of tabs with aria-selected, one Tab stop, arrows Home End move and select (vi, en)", async ({ page }) => {
        for (const l of ["vi", "en"] as const) {
            const dialog = await openRoadmapSyllabus(page, l)
            const tablist = dialog.getByRole("tablist")
            await expect(tablist, `${l}: the syllabus modal has one tablist`).toHaveCount(1)
            await expect(tablist).toHaveAccessibleName(msg(l, "syllabus", "tabsLabel"))
            const labels = ["tabAssessments", "tabClos", "tabSessions", "tabMaterials", "tabRoadmap", "tabRules"].map((k) => msg(l, "syllabus", k))
            const tabs = tablist.getByRole("tab")
            await expect(tabs).toHaveCount(labels.length)
            for (const [i, label] of labels.entries()) await expect(tabs.nth(i)).toHaveAccessibleName(new RegExp(`^${esc(label)}`))
            const panel = dialog.getByRole("tabpanel")
            await expect(panel).toHaveCount(1)
            const expectSelected = async (i: number) => {
                await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true")
                await expect(dialog.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1)
                await expect(dialog.locator('[role="tab"][tabindex="0"]')).toHaveCount(1)
                await expect(tabs.nth(i)).toHaveAttribute("tabindex", "0")
                await expect(tabs.nth(i)).toBeFocused()
                expect(await tabs.nth(i).getAttribute("aria-controls")).toBe(await panel.getAttribute("id"))
                await expect(panel).toHaveAccessibleName(await accName(tabs.nth(i)))
            }
            const last = labels.length - 1
            await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true")
            await tabs.nth(0).focus()
            await expectSelected(0)
            await page.keyboard.press("ArrowRight")
            await expectSelected(1)
            await expect(panel.getByRole("heading", { level: 3, name: msg(l, "syllabus", "closTitle"), exact: true })).toBeVisible() // v2.69: h3 under the modal's h2
            await page.keyboard.press("ArrowLeft")
            await expectSelected(0)
            await page.keyboard.press("ArrowLeft") // wraps to the last tab
            await expectSelected(last)
            await page.keyboard.press("ArrowRight") // wraps to the first tab
            await expectSelected(0)
            await page.keyboard.press("End")
            await expectSelected(last)
            await page.keyboard.press("Home")
            await expectSelected(0)
            // One Tab stop: Tab from the selected tab goes to the panel, not to the next tab.
            await page.keyboard.press("Tab")
            await expect(panel).toBeFocused()
        }
    })

    test("detail dialog: its tablist is named (vi, en)", async ({ page }) => {
        for (const l of ["vi", "en"] as const) {
            const detail = await openDetail(page, FIRST, l)
            const tablist = detail.getByRole("tablist")
            await expect(tablist).toHaveCount(1)
            expect(await accName(tablist), `${l}: the detail tablist has a name`).not.toBe("")
            await expect(tablist).toHaveAccessibleName(msg(l, "programs", "detailTabsLabel"))
        }
    })

    test("close buttons: the wishlist sheet, the detail dialog and the syllabus modal read the page locale (vi, en)", async ({ page }) => {
        expect(ROW).toBeTruthy()
        for (const l of ["vi", "en"] as const) {
            const close = msg(l, "programs", "close")
            const syllabusClose = msg(l, "syllabus", "close")
            const other = l === "vi" ? msg("en", "programs", "close") : msg("vi", "programs", "close")
            const sheet = await openWishlist(page, [FIRST.id], l)
            await expect(sheet.getByRole("button", { name: close, exact: true }), `${l}: the sheet's close button`).toHaveCount(1)
            await expect(sheet.getByRole("button", { name: other, exact: true })).toHaveCount(0)
            await sheet.getByRole("button", { name: close, exact: true }).click()
            await expect(sheet).toHaveCount(0)

            const { detail } = await openCurriculum(page, ROW!.p, l)
            await expect(detail.getByRole("button", { name: close, exact: true })).toHaveCount(1)
            await expect(detail.getByRole("button", { name: other, exact: true })).toHaveCount(0)
            await detail.locator("tbody tr").first().click()
            const syllabus = page.getByRole("dialog").nth(1)
            await expect(syllabus).toBeVisible({ timeout: 15000 })
            await expect(syllabus.getByRole("button", { name: syllabusClose, exact: true }), `${l}: the syllabus X + footer`).toHaveCount(2)
            await expect(syllabus.getByRole("button", { name: other, exact: true })).toHaveCount(0)
        }
    })

    test("cards: every visible card's detail button has its own name with the program and its university", async ({ page }) => {
        const view = msg("vi", "programs", "viewDetail")
        await page.goto("/vi", { waitUntil: "domcontentloaded" })
        const cards = page.getByTestId("program-card")
        await expect(cards.nth(11).getByRole("heading", { name: listed[11].name, exact: true })).toBeVisible({ timeout: 30000 })
        await expect(cards).toHaveCount(12)
        const detailButton = (card: Locator) => card.getByRole("button", { name: new RegExp(`^${esc(view)}`) })
        const names: string[] = []
        for (let i = 0; i < 12; i++) names.push(await accName(detailButton(cards.nth(i))))
        expect(new Set(names).size, `distinct names of the 12 visible detail buttons: ${names.join(" | ")}`).toBe(12)
        const template = msg("vi", "programs", "viewDetailFor")
        expect(names).toEqual(listed.slice(0, 12).map((p) => ws(fill(template, { name: p.name, university: p.universityName }))))

        // One program name at several universities on one result page: still one name per card.
        expect(SAME, "a program name shared by >= 2 universities on its first result page").toBeTruthy()
        await page.getByPlaceholder(msg("vi", "programs", "searchPlaceholder"), { exact: true }).fill(SAME!.name)
        const same = cards.filter({ has: page.getByRole("heading", { name: SAME!.name, exact: true }) })
        await expect(same).toHaveCount(SAME!.page1.length, { timeout: 30000 })
        const sameNames: string[] = []
        for (let i = 0; i < SAME!.page1.length; i++) sameNames.push(await accName(detailButton(same.nth(i))))
        expect(new Set(sameNames).size, `"${SAME!.name}" cards: ${sameNames.join(" | ")}`).toBe(SAME!.page1.length)
        expect(sameNames).toEqual(SAME!.page1.map((p) => ws(fill(template, { name: p.name, university: p.universityName }))))
    })

    test("wishlist rows: detail and remove buttons name their program and university, unique for one name at two universities", async ({ page }) => {
        expect(SAME).toBeTruthy()
        const { a, b } = SAME!
        const ids: string[] = readJson(path.join(ROOT, "src", "lib", "program-ids.json"))
        const ghost = "00000000-0000-4000-8000-000000000000" // not a snapshot program: the row keeps its id
        expect(ids).not.toContain(ghost)
        await page.route(`**/mock/programs-by-id/${ghost}.json`, (route) => route.fulfill({ status: 404, body: "" }))
        const saved = [a, b, FIRST]
        const sheet = await openWishlist(page, [...saved.map((p) => p.id), ghost])
        const detailButtons = sheet.getByTestId("wishlist-open-detail")
        await expect(detailButtons).toHaveCount(saved.length, { timeout: 15000 })
        const detailNames: string[] = []
        for (let i = 0; i < saved.length; i++) detailNames.push(await accName(detailButtons.nth(i)))
        expect(new Set(detailNames).size, `detail buttons: ${detailNames.join(" | ")}`).toBe(saved.length)
        const remove = msg("vi", "wishlist", "wishlistRemove")
        const rows = sheet.getByRole("listitem")
        await expect(rows).toHaveCount(saved.length + 1)
        const removeNames: string[] = []
        for (let i = 0; i < saved.length + 1; i++) removeNames.push(await accName(rows.nth(i).getByRole("button", { name: new RegExp(`^${esc(remove)}`) })))
        expect(new Set(removeNames).size, `remove buttons: ${removeNames.join(" | ")}`).toBe(saved.length + 1)
        const view = msg("vi", "programs", "viewDetailFor")
        const removeFor = msg("vi", "wishlist", "wishlistRemoveFor")
        expect(detailNames).toEqual(saved.map((p) => ws(fill(view, { name: p.name, university: p.universityName }))))
        expect(removeNames).toEqual([...saved.map((p) => ws(fill(removeFor, { name: p.name, university: p.universityName }))), fill(msg("vi", "wishlist", "wishlistRemoveId"), { id: ghost })])
    })

    test("cards: the source link keeps its visible label as its name at phone width (412 px) as on desktop", async ({ page }) => {
        const label = msg("vi", "programs", "admissionSourceLabel")
        // v2.69: the tooltip says "official" only for a link on the program's own university's domain (e2e/source-domains.ts).
        const tooltip = (p: Program) => msg("vi", "programs", isOwnLink(p) ? "sourceLinkTitle" : "sourceLinkTitleCollected")
        const cards = page.getByTestId("program-card")
        for (const width of [412, 1280]) {
            await page.setViewportSize({ width, height: width === 412 ? 915 : 800 })
            await page.goto("/vi", { waitUntil: "domcontentloaded" })
            await expect(cards.nth(11).getByRole("heading", { name: listed[11].name, exact: true })).toBeVisible({ timeout: 30000 })
            for (let i = 0; i < 12; i++) {
                const link = cards.nth(i).locator(`a[href="${listed[i].sourceUrl}"]`)
                await expect(link).toHaveCount(1)
                expect(await accName(link), `${width} px: card ${i + 1}'s source link name`).toBe(label)
                await expect(link).toHaveAttribute("title", tooltip(listed[i]))
            }
        }
    })

    test("chat button with the detail dialog, the syllabus over it and the wishlist sheet open: inert and under the overlay; usable after", async ({ page }) => {
        expect(ROW).toBeTruthy()
        await page.goto("/vi", { waitUntil: "domcontentloaded" })
        const c = await chatCentre(page)
        expect((await hitAt(page, c)).chat, "no modal: the chat button paints at its centre").toBe(true)

        const { detail } = await openCurriculum(page, ROW!.p)
        await expectChatUnder(page, detail, c, "detail dialog")
        await detail.locator("tbody tr").first().click()
        const syllabus = page.getByRole("dialog").nth(1)
        await expect(syllabus).toBeVisible({ timeout: 15000 })
        await expectChatUnder(page, syllabus, c, "syllabus over the detail dialog")
        await page.keyboard.press("Escape")
        await expect(page.getByRole("dialog")).toHaveCount(1)
        expect(await chatInert(page), "the detail dialog is still open: still inert").toBe(true)
        await page.keyboard.press("Escape")
        await expect(page.getByRole("dialog")).toHaveCount(0)
        await expectChatUsable(page, c, "after the detail dialog")

        const sheet = await openWishlist(page, [FIRST.id])
        await expectChatUnder(page, sheet, c, "wishlist sheet")
        await page.keyboard.press("Escape")
        await expect(sheet).toHaveCount(0)
        await expectChatUsable(page, c, "after the wishlist sheet")
        // And it still opens the chat panel by pointer (no message is sent).
        await page.locator(CHAT).getByRole("button", { name: msg("vi", "chat", "title"), exact: true }).click()
        await expect(page.locator(CHAT).getByPlaceholder(msg("vi", "chat", "placeholder"), { exact: true })).toBeVisible()
    })

    test("chat button with the syllabus modal open on /roadmap: inert and under the overlay; usable after", async ({ page }) => {
        await page.goto("/vi/roadmap", { waitUntil: "domcontentloaded" })
        const c = await chatCentre(page)
        const dialog = await openRoadmapSyllabus(page)
        await expectChatUnder(page, dialog, c, "syllabus on /roadmap")
        await page.keyboard.press("Escape")
        await expect(dialog).toHaveCount(0)
        await expectChatUsable(page, c, "after the syllabus on /roadmap")
    })

    test("a long syllabus title wraps: not cut, inside the viewport, no horizontal scroll", async ({ page }) => {
        expect(LONG, "a curriculum row with an FPT/TDTU syllabus").toBeTruthy()
        const { p, c, title, english } = LONG!
        const { detail } = await openCurriculum(page, p)
        await rowOf(page, detail, c.courseCode!).click()
        const syllabus = dialogNamed(page, ws(title))
        await expect(syllabus).toBeVisible({ timeout: 20000 })
        const measure = (l: Locator) =>
            l.evaluate((el) => {
                const cs = getComputedStyle(el)
                const r = el.getBoundingClientRect()
                return { sw: el.scrollWidth, cw: el.clientWidth, overflow: cs.textOverflow, ws: cs.whiteSpace, left: r.left, right: r.right, lines: Math.round(r.height / parseFloat(cs.lineHeight)), vw: innerWidth, page: document.documentElement.scrollWidth }
            })
        const lines: Locator[] = [syllabus.getByRole("heading", { level: 2, name: ws(title), exact: true })]
        // The English line shows when it does not read the same as the title (roadmapUniversities.ts sameName, restated).
        const fold = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase()
        if (english && fold(english) !== fold(title)) lines.push(syllabus.getByText(ws(english), { exact: true }))
        for (const l of lines) {
            await expect(l).toBeVisible()
            const m = await measure(l)
            expect(m.sw, `cut (no wrap): ${JSON.stringify(m)}`).toBeLessThanOrEqual(m.cw + 1)
            expect(m.overflow).not.toBe("ellipsis")
            expect(m.ws).not.toBe("nowrap")
            expect(m.left).toBeGreaterThanOrEqual(0)
            expect(m.right).toBeLessThanOrEqual(m.vw + 1)
            expect(m.page, "horizontal page scroll").toBeLessThanOrEqual(m.vw + 1)
        }
        expect((await measure(lines[0])).lines, "the title takes more than one line").toBeGreaterThan(1)
    })
})
