import { test, expect, Locator, Page } from "@playwright/test"
import { existsSync, readFileSync } from "fs"
import path from "path"

/**
 * v2.49 — a11y of the modals and the detail tabs (audit V6, gap G8).
 *
 * The program detail dialog, the syllabus modal and the wishlist sheet are
 * real modal dialogs: role="dialog" + aria-modal + a name taken from their
 * visible title; opening one by keyboard moves focus into it, Tab/Shift+Tab
 * never leave it, Escape closes it (the detail dialog through the same path
 * as its X button, so the v2.48 URL behaviour holds) and focus returns to
 * the control that opened it. The detail dialog's tabs follow the APG tabs
 * pattern, its icon buttons are named (also on mobile), wishlist rows and
 * compare selects are named, and a long program name wraps.
 *
 * Fixtures come from public/mock at test time (nothing named is pinned): the
 * first program in listing order (= the first card), the last one, the first
 * one with a course list, and the one with the longest name. Message strings
 * are read from src/messages. domcontentloaded, not networkidle (AGENTS.md
 * §12); keyboard input waits for a hydration-dependent signal first.
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
type Messages = Record<string, Record<string, string | undefined>>
const messages = (locale: "vi" | "en"): Messages => readJson(path.join(ROOT, "src", "messages", `${locale}.json`))
const vi = messages("vi")

type MockProgram = { id: string; name: string; universityName: string; courseCount: number }
const chunks: string[] = readJson(path.join(MOCK, "index.json")).chunks
const all: MockProgram[] = chunks.flatMap((c) => readJson(path.join(MOCK, "programs", c)))
const byIdFile = (id: string) => path.join(MOCK, "programs-by-id", `${id}.json`)
const curriculaFile = (id: string) => path.join(MOCK, "curricula", `${id}.json`)
const first = all[0]
const last = all[all.length - 1]
const withCourses = all.find((p) => p.courseCount > 0 && existsSync(curriculaFile(p.id)))
const longest = all.reduce((a, b) => (b.name.length > a.name.length ? b : a))

// The detail dialog's tabs, in the order the component renders them.
const TAB_KEYS = ["infoTab", "admissionsTab", "curriculumTab", "graphTab", "gpaTab", "rawDocumentsTab", "evalTab"]

const dialogNamed = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const focusInside = (box: Locator) => box.evaluate((el) => el.contains(document.activeElement))
const pathAndQuery = (page: Page) => {
    const u = new URL(page.url())
    return u.pathname + u.search
}

/** More Tab presses than the box has controls, then Shift+Tab: focus never leaves it. */
async function expectFocusTrapped(page: Page, box: Locator) {
    const controls = await box.evaluate(
        (el) => el.querySelectorAll("a[href], button, input, select, textarea, summary, [tabindex]").length
    )
    for (let i = 1; i <= controls + 3; i++) {
        await page.keyboard.press("Tab")
        expect(await focusInside(box), `focus inside after Tab #${i} of ${controls + 3}`).toBe(true)
    }
    for (let i = 1; i <= 4; i++) {
        await page.keyboard.press("Shift+Tab")
        expect(await focusInside(box), `focus inside after Shift+Tab #${i}`).toBe(true)
    }
}

/** First card = first program of the first chunk; returns its "Xem chi tiết" button once the list is hydrated. */
async function firstCardButton(page: Page) {
    await page.goto("/vi", { waitUntil: "domcontentloaded" })
    const card = page.getByTestId("program-card").first()
    await expect(card).toBeVisible({ timeout: 30000 })
    await expect(card.getByRole("heading", { name: first.name, exact: true })).toBeVisible()
    return card.getByRole("button", { name: vi.programs.viewDetail, exact: true })
}

test.describe("v2.49 — a11y modals + tabs", () => {
    test.describe.configure({ timeout: 90000 })

    test("fixtures exist in the snapshot", () => {
        expect(chunks.length).toBeGreaterThan(1)
        expect(withCourses).toBeTruthy()
        for (const p of [first, last, withCourses!, longest]) {
            const detail = readJson(byIdFile(p.id))
            expect(detail.id).toBe(p.id)
            expect(detail.name).toBe(p.name)
        }
        expect(readJson(curriculaFile(withCourses!.id)).length).toBeGreaterThan(0)
        // Long enough to need several lines on a phone.
        expect(longest.name.length).toBeGreaterThan(120)
    })

    test("messages: every label the spec relies on exists in vi and en", () => {
        for (const locale of ["vi", "en"] as const) {
            const m = messages(locale)
            for (const key of ["close", "printPdf", "exportExcel", "exportJson", "copyLink", "viewDetail", ...TAB_KEYS]) {
                expect(m.programs[key], `${locale}.programs.${key}`).toBeTruthy()
            }
            for (const key of ["compareProgram1", "compareProgram2"]) expect(m.programs[key]).toBeTruthy()
            expect(m.wishlist.wishlistTitle).toBeTruthy()
            expect(m.roadmap.viewSyllabus).toBeTruthy()
        }
    })

    test("detail dialog by keyboard: Enter opens it named by the program, Tab stays inside, Escape closes it like X and focus returns to the card", async ({ page }) => {
        const opener = await firstCardButton(page)
        await opener.focus()
        await page.keyboard.press("Enter")

        const dialog = dialogNamed(page, first.name)
        await expect(dialog).toBeVisible({ timeout: 15000 })
        await expect(dialog).toHaveAttribute("aria-modal", "true")
        await expect.poll(() => focusInside(dialog)).toBe(true)
        await expect.poll(() => pathAndQuery(page)).toBe(`/vi?program=${first.id}`)

        await expectFocusTrapped(page, dialog)

        await page.keyboard.press("Escape")
        await expect(dialog).toHaveCount(0)
        // Same path as the X button (v2.48): the pushed entry is gone, the URL is clean.
        await expect.poll(() => pathAndQuery(page)).toBe("/vi")
        await expect(opener).toBeFocused()
    })

    test("a held Escape closes the detail dialog once and stays on the list", async ({ page }) => {
        const opener = await firstCardButton(page)
        await opener.focus()
        await page.keyboard.press("Enter")
        const dialog = dialogNamed(page, first.name)
        await expect(dialog).toBeVisible({ timeout: 15000 })
        await expect.poll(() => pathAndQuery(page)).toBe(`/vi?program=${first.id}`)

        // Key auto-repeat: the 2nd and 3rd keydown carry repeat=true.
        await page.keyboard.down("Escape")
        await page.keyboard.down("Escape")
        await page.keyboard.down("Escape")
        await page.keyboard.up("Escape")
        await expect(dialog).toHaveCount(0)
        await expect.poll(() => pathAndQuery(page)).toBe("/vi")
        await expect(page.getByTestId("program-card").first()).toBeVisible()
        await expect(opener).toBeFocused()
    })

    test("detail tabs: tablist/tab/tabpanel, one Tab stop, arrows Home End move and select", async ({ page }) => {
        await page.goto(`/vi?program=${first.id}`, { waitUntil: "domcontentloaded" })
        const dialog = dialogNamed(page, first.name)
        await expect(dialog).toBeVisible({ timeout: 30000 })

        const tabs = dialog.getByRole("tablist").getByRole("tab")
        await expect(tabs).toHaveText(TAB_KEYS.map((k) => vi.programs[k]!))
        const tab = (i: number) => dialog.getByRole("tab", { name: vi.programs[TAB_KEYS[i]], exact: true })
        const panel = dialog.getByRole("tabpanel")
        const expectSelected = async (i: number) => {
            await expect(tab(i)).toHaveAttribute("aria-selected", "true")
            await expect(dialog.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1)
            await expect(dialog.locator('[role="tab"][tabindex="0"]')).toHaveCount(1)
            await expect(tab(i)).toHaveAttribute("tabindex", "0")
            await expect(tab(i)).toBeFocused()
            await expect(panel).toHaveAccessibleName(vi.programs[TAB_KEYS[i]]!)
            expect(await tab(i).getAttribute("aria-controls")).toBe(await panel.getAttribute("id"))
        }

        await expect(tab(0)).toHaveAttribute("aria-selected", "true")
        await tab(0).focus()
        await expectSelected(0)
        await page.keyboard.press("ArrowRight")
        await expectSelected(1)
        await expect(dialog.getByTestId("admissions-section")).toBeVisible()
        await page.keyboard.press("ArrowLeft")
        await expectSelected(0)
        await page.keyboard.press("ArrowLeft") // wraps to the last tab
        await expectSelected(TAB_KEYS.length - 1)
        await page.keyboard.press("ArrowRight") // wraps to the first tab
        await expectSelected(0)
        await page.keyboard.press("End")
        await expectSelected(TAB_KEYS.length - 1)
        await page.keyboard.press("Home")
        await expectSelected(0)
    })

    test("icon buttons are named on every viewport; compare selects are named by their slot", async ({ page }) => {
        const p = withCourses!
        await page.goto(`/vi?program=${p.id}`, { waitUntil: "domcontentloaded" })
        const dialog = dialogNamed(page, p.name)
        await expect(dialog).toBeVisible({ timeout: 30000 })
        // CSV/JSON appear once the course list has loaded.
        for (const key of ["exportExcel", "exportJson", "printPdf", "copyLink", "close"]) {
            await expect(dialog.getByRole("button", { name: vi.programs[key], exact: true }), key).toBeVisible({ timeout: 15000 })
        }
        await dialog.getByRole("button", { name: vi.programs.close, exact: true }).click()
        await expect(dialog).toHaveCount(0)

        const en = messages("en")
        await page.goto(`/en?program=${p.id}`, { waitUntil: "domcontentloaded" })
        const enDialog = dialogNamed(page, p.name)
        await expect(enDialog).toBeVisible({ timeout: 30000 })
        for (const key of ["printPdf", "close"]) {
            await expect(enDialog.getByRole("button", { name: en.programs[key], exact: true }), `en ${key}`).toBeVisible()
        }

        await page.goto("/vi/compare", { waitUntil: "domcontentloaded" })
        for (const key of ["compareProgram1", "compareProgram2"]) {
            await expect(page.getByRole("combobox", { name: vi.programs[key], exact: true }), key).toBeVisible({ timeout: 30000 })
        }
    })

    test("wishlist sheet: named dialog, focus trapped, Escape returns focus; rows name their program and open it by keyboard", async ({ page }) => {
        await page.goto("/vi", { waitUntil: "domcontentloaded" })
        await page.evaluate((ids) => window.localStorage.setItem("tedo:wishlist", JSON.stringify(ids)), [first.id, last.id])
        await page.reload({ waitUntil: "domcontentloaded" })
        const openBtn = page.getByTestId("wishlist-open")
        // "(2)" renders only once the wishlist store has read localStorage (hydrated).
        await expect(openBtn).toContainText("(2)", { timeout: 15000 })

        await openBtn.focus()
        await page.keyboard.press("Enter")
        const sheet = dialogNamed(page, vi.wishlist.wishlistTitle!)
        await expect(sheet).toBeVisible()
        await expect(sheet).toHaveAttribute("aria-modal", "true")
        await expect.poll(() => focusInside(sheet)).toBe(true)
        for (const p of [first, last]) {
            await expect(sheet.getByRole("button", { name: `${vi.programs.viewDetail}: ${p.name}`, exact: true })).toBeVisible({ timeout: 15000 })
        }
        await expectFocusTrapped(page, sheet)
        await page.keyboard.press("Escape")
        await expect(sheet).toHaveCount(0)
        await expect(openBtn).toBeFocused()

        // A row's detail by keyboard: the sheet closes, the detail dialog takes focus,
        // Escape closes it and focus lands back on the wishlist button.
        await page.keyboard.press("Enter")
        await expect(sheet).toBeVisible()
        const row = sheet.getByRole("button", { name: `${vi.programs.viewDetail}: ${last.name}`, exact: true })
        await row.focus()
        await page.keyboard.press("Enter")
        const dialog = dialogNamed(page, last.name)
        await expect(dialog).toBeVisible({ timeout: 15000 })
        await expect(sheet).toHaveCount(0)
        await expect.poll(() => focusInside(dialog)).toBe(true)
        await page.keyboard.press("Escape")
        await expect(dialog).toHaveCount(0)
        await expect.poll(() => pathAndQuery(page)).toBe("/vi")
        await expect(openBtn).toBeFocused()
    })

    test("syllabus modal by keyboard: named by its heading, Tab stays inside, Escape returns focus to the opener", async ({ page }) => {
        await page.goto("/vi/roadmap", { waitUntil: "domcontentloaded" })
        const opener = page.getByRole("button", { name: vi.roadmap.viewSyllabus, exact: true }).filter({ visible: true }).first()
        await expect(opener).toBeVisible({ timeout: 30000 })
        const dialog = page.getByRole("dialog")
        // The button is in the static HTML: retry until hydration lets Enter open the modal.
        await expect(async () => {
            await opener.focus()
            await page.keyboard.press("Enter")
            await expect(dialog).toBeVisible({ timeout: 2000 })
        }).toPass({ timeout: 30000 })

        await expect(dialog).toHaveAttribute("aria-modal", "true")
        const title = dialog.getByRole("heading", { level: 2 })
        // Named by its visible title (which switches to the syllabus name once loaded).
        await expect(async () => {
            await expect(dialog).toHaveAccessibleName((await title.innerText()).trim(), { timeout: 1000 })
        }).toPass({ timeout: 15000 })
        await expect.poll(() => focusInside(dialog)).toBe(true)

        await expectFocusTrapped(page, dialog)
        await page.keyboard.press("Escape")
        await expect(dialog).toHaveCount(0)
        await expect(opener).toBeFocused()
    })

    test("Escape on a syllabus opened from the detail dialog closes only the syllabus", async ({ page }) => {
        const p = withCourses!
        await page.goto(`/vi?program=${p.id}`, { waitUntil: "domcontentloaded" })
        const detail = dialogNamed(page, p.name)
        await expect(detail).toBeVisible({ timeout: 30000 })
        await detail.getByRole("tab", { name: vi.programs.curriculumTab, exact: true }).click()
        const row = detail.locator("tbody tr").first()
        await expect(row).toBeVisible({ timeout: 15000 })
        await row.click()

        const dialogs = page.getByRole("dialog")
        await expect(dialogs).toHaveCount(2)
        const syllabus = dialogs.nth(1)
        await expect(syllabus).toHaveAttribute("aria-modal", "true")
        await expect.poll(() => focusInside(syllabus)).toBe(true)

        await page.keyboard.press("Escape")
        await expect(dialogs).toHaveCount(1)
        await expect(detail).toBeVisible()
        await expect.poll(() => focusInside(detail)).toBe(true)
        expect(pathAndQuery(page)).toBe(`/vi?program=${p.id}`)

        await page.keyboard.press("Escape")
        await expect(detail).toHaveCount(0)
        await expect.poll(() => pathAndQuery(page)).toBe("/vi")
    })

    test("the longest program name wraps in the dialog header: not cut, inside the viewport, no horizontal scroll", async ({ page }) => {
        await page.goto(`/vi?program=${longest.id}`, { waitUntil: "domcontentloaded" })
        const dialog = dialogNamed(page, longest.name)
        await expect(dialog).toBeVisible({ timeout: 30000 })
        const heading = dialog.getByRole("heading", { level: 2, name: longest.name, exact: true })
        const m = await heading.evaluate((el) => {
            const r = el.getBoundingClientRect()
            return {
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
                left: r.left,
                right: r.right,
                width: r.width,
                viewport: window.innerWidth,
                page: document.documentElement.scrollWidth,
            }
        })
        expect(m.scrollWidth, "heading cut (no wrap)").toBeLessThanOrEqual(m.clientWidth + 1)
        expect(m.left).toBeGreaterThanOrEqual(0)
        expect(m.right).toBeLessThanOrEqual(m.viewport + 1)
        expect(m.page, "horizontal page scroll").toBeLessThanOrEqual(m.viewport + 1)
        // Phones: the header buttons sit on their own row, the name gets the dialog width.
        if (m.viewport < 640) expect(m.width).toBeGreaterThan(m.viewport * 0.6)
    })
})
