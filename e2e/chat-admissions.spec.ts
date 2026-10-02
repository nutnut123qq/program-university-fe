import { test, expect, Page } from "@playwright/test"

/**
 * W-CHAT — chat widget answers admission questions (điểm chuẩn / học phí /
 * chỉ tiêu) with real data from /mock/admissions/<UNI>.json.
 * Runs on the local grounded fallback (no LLM key needed): /api/chat returns
 * {reply: null, fallback: true} so slmRagEngine handles the query itself.
 */

const CHAT = "div.fixed.bottom-6.right-6"

async function openChat(page: Page) {
    await page.goto("/vi", { waitUntil: "networkidle" })
    const chat = page.locator(CHAT)
    const toggle = chat.getByRole("button", { name: /AI thử nghiệm|Trợ lý thử nghiệm/i })
    const input = chat.getByPlaceholder(/Nhập câu hỏi/i)
    await expect(toggle).toBeVisible({ timeout: 30000 })
    // The first click can land before React hydration finishes — retry until
    // the chat card's input actually mounts.
    await expect(async () => {
        if (!(await input.isVisible().catch(() => false))) await toggle.click()
        await expect(input).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 30000 })
}

/** Send a message and return the newest assistant bubble text. */
async function askChat(page: Page, question: string): Promise<string> {
    const chat = page.locator(CHAT)
    const assistant = chat.locator("div.rounded-tl-none > p")
    const before = await assistant.count()
    const input = chat.getByPlaceholder(/Nhập câu hỏi/i)
    await input.fill(question)
    await input.press("Enter")
    // user bubble + one assistant bubble are appended
    await expect(assistant).toHaveCount(before + 1, { timeout: 60000 })
    return (await assistant.last().innerText()) ?? ""
}

test.describe("Chat admission-aware retrieval (W-CHAT)", () => {
    test("điểm chuẩn ngành An toàn thông tin NEU → real snapshot score 25.59/30 + source", async ({
        page,
    }) => {
        await openChat(page)
        const reply = await askChat(page, "điểm chuẩn ngành an toàn thông tin NEU")

        expect(reply).toContain("25.59")
        expect(reply).toMatch(/\/30|thang 30/i)
        expect(reply).toContain("neu.edu.vn")
        expect(reply).toMatch(/tham khảo/i)
    })

    test("trường ngoài snapshot (ĐH Bách khoa Đà Nẵng) → 'chưa có dữ liệu', không bịa số", async ({
        page,
    }) => {
        await openChat(page)
        const reply = await askChat(page, "điểm chuẩn đại học bách khoa đà nẵng")

        expect(reply).toMatch(/chưa có dữ liệu/i)
        // Guard: no fabricated score like "25.59" or "25,5" in the reply
        expect(reply).not.toMatch(/\d{2}[.,]\d/)
    })

    test("học phí NEU → real tuition range (triệu đồng) + neu.edu.vn", async ({ page }) => {
        await openChat(page)
        const reply = await askChat(page, "học phí NEU")

        expect(reply.toLowerCase()).toContain("triệu")
        expect(reply).toContain("neu.edu.vn")
        expect(reply).toMatch(/tham khảo/i)
    })
})
