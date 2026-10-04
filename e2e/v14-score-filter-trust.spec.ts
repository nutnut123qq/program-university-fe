import { test, expect, Page } from "@playwright/test"

/**
 * v1.4 trust — score-filter eligibility ↔ hint consistency
 * (SPEC-V14-TRUST UC-V14-01).
 *
 * Regression context: with method=all the previous hint builder picked the
 * FIRST same-scale trend series, which could be a different method than
 * the row that made the program eligible — the production snapshot had
 * 24/389 cards at 25/30 showing cutoffs above the threshold (e.g. 25.78).
 * These specs assert EVERY rendered hint, not just one card.
 *
 * Pinned fixture case (HCMUS.json): "Sinh học (Chương trình tăng cường
 * tiếng Anh) (7420101_DKD)" has its newest scale-30 year at 2025 with
 * methods pt1bc (min 25.22), pt1d (25.7) and thpt (min 20.06). It is
 * eligible at 25/30 ONLY via the thpt row — the card must show
 * "Chuẩn 2025: 20,06/30" with the thpt method label, not the 25.22 the
 * old first-series logic displayed.
 */

const cards = (page: Page) => page.getByTestId("program-card")
const hints = (page: Page) => page.getByTestId("score-hint")
const hintMethods = (page: Page) => page.getByTestId("score-hint-method")

async function applyScoreFilter(page: Page, score: string, scale: string) {
    await page.goto("/vi", { waitUntil: "networkidle" })
    const input = page.getByTestId("score-filter-input")
    await expect(input).toBeVisible()
    await input.fill(score)
    const filter = page.getByTestId("score-filter")
    await filter
        .getByRole("combobox", { name: /Thang điểm|Scale/i })
        .click()
    await page.getByRole("option", { name: scale, exact: true }).click()
    await expect(page.getByTestId("score-filter-result")).toBeVisible({
        timeout: 60000,
    })
    await expect(cards(page).first()).toBeVisible({ timeout: 30000 })
}

/**
 * Parse "Chuẩn <year>: <cutoff>/<scale>" out of a hint line.
 * vi locale renders decimals with a comma ("20,06"); en uses a dot —
 * both parse the same way at scale 30 (no thousands separators possible).
 */
function parseHintCutoff(text: string) {
    const m = text.match(/(?:Chuẩn|Cutoff)\s+(\d{4}):\s*(\d+[.,]?\d*)\s*\/\s*(\d+)/i)
    if (!m) return null
    return {
        year: Number(m[1]),
        cutoff: Number(m[2].replace(",", ".")),
        scale: Number(m[3]),
    }
}

/** Parse the leading count of "… ngành có điểm xét tuyển ≤ …". */
function parseResultCount(text: string) {
    const m = text.match(/([\d.,]+)\s*ngành|([\d.,]+)\s*programs/i)
    if (!m) return null
    return Number((m[1] ?? m[2]).replace(/[.,]/g, ""))
}

test.describe("v1.4 score-filter trust (/vi)", () => {
    test("method=all at 25/30: every rendered score-hint cutoff satisfies the threshold and names its method", async ({
        page,
    }) => {
        await applyScoreFilter(page, "25", "30")

        // Result count ↔ rendered cards ↔ rendered hints consistency.
        const count = parseResultCount(
            (await page.getByTestId("score-filter-result").textContent()) ?? ""
        )
        expect(count).not.toBeNull()
        const cardCount = await cards(page).count()
        expect(cardCount).toBe(count)
        expect(cardCount).toBeGreaterThan(0)
        expect(await hints(page).count()).toBe(cardCount)

        // EVERY hint must satisfy the active threshold on the selected
        // scale — this is the adversarial check the v1.3 spec lacked.
        const texts = await hints(page).allTextContents()
        for (const text of texts) {
            const parsed = parseHintCutoff(text)
            expect(
                parsed,
                `hint must contain a cutoff fragment: "${text}"`
            ).not.toBeNull()
            expect(
                parsed!.scale,
                `hint "${text}" is not on the selected scale`
            ).toBe(30)
            expect(
                parsed!.cutoff,
                `hint "${text}" exceeds the 25/30 threshold`
            ).toBeLessThanOrEqual(25)
        }

        // method=all => every hint names the method that qualified it.
        const labels = await hintMethods(page).allTextContents()
        expect(labels.length).toBe(texts.length)
        for (const label of labels) {
            expect(label.trim().length).toBeGreaterThan(0)
        }
    })

    test("previously-mismatched card shows the qualifying thpt row (20,06), not another method's 25,22", async ({
        page,
    }) => {
        await applyScoreFilter(page, "25", "30")
        const card = cards(page)
            .filter({
                hasText: "Sinh học (Chương trình tăng cường tiếng Anh) (7420101_DKD)",
            })
            .filter({ hasText: "Khoa học Tự nhiên" })
        await expect(card).toHaveCount(1, { timeout: 30000 })
        const hint = card.getByTestId("score-hint")
        await expect(hint).toContainText("Chuẩn 2025: 20,06/30")
        // Qualifying row's method label (thpt / "PT 2 — …TN THPT 2025…").
        await expect(hint.getByTestId("score-hint-method")).toContainText(
            /TN THPT 2025/
        )
        await expect(hint).not.toContainText("25,22")
    })

    test("method selected: every hint belongs to that method and still satisfies the threshold", async ({
        page,
    }) => {
        await applyScoreFilter(page, "25", "30")
        const filter = page.getByTestId("score-filter")
        await filter
            .getByRole("combobox", {
                name: /Tất cả phương thức|All methods/i,
            })
            .click()
        // hoc_ba at scale 30 — labels come from the data, never hardcoded
        // in the UI; this label is unique among scale-30 options.
        await page
            .getByRole("option", {
                name: /học bạ THPT theo tổ hợp xét tuyển của 06 học kỳ/i,
            })
            .click()

        // Wait for the re-filtered hints to all carry the chosen method.
        await expect(hintMethods(page).first()).toHaveAttribute(
            "data-method",
            "hoc_ba",
            { timeout: 30000 }
        )
        const methods = await hintMethods(page).evaluateAll((els) =>
            els.map((e) => e.getAttribute("data-method"))
        )
        expect(methods.length).toBeGreaterThan(0)
        for (const m of methods) {
            expect(m).toBe("hoc_ba")
        }

        const texts = await hints(page).allTextContents()
        expect(texts.length).toBe(methods.length)
        for (const text of texts) {
            const parsed = parseHintCutoff(text)
            expect(parsed).not.toBeNull()
            expect(parsed!.scale).toBe(30)
            expect(parsed!.cutoff).toBeLessThanOrEqual(25)
        }
    })
})
