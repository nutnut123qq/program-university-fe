import { test, expect, Page, Locator } from "@playwright/test"
import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import path from "path"

/**
 * v2.55 — personal data and page junk out of the published snapshot (audit 2026-10-30 V1,
 * AGENTS.md §9). The rules live in crawler/scripts/export_mock_programs_sync.py:
 *
 * (a) no personal contact data anywhere in public/mock: a Vietnamese mobile number,
 *     a free-mail mailbox, or a phone/mailbox on a line that names a person. An
 *     institution's landline / role mailbox on its own line is not personal.
 * (b) no page dump published as "Chuẩn đầu ra (PLO)" (site search form, PDF syntax,
 *     JSON-LD, site menu, the courses.neu.edu.vn tab bar) and no PLO with a site
 *     footer line (related posts, other news, article navigation, application buttons…).
 * (c) a program whose PLO was withheld has no SLM score.
 * (d) no prerequisites-graph.json, no raw-documents file of a program that is not
 *     published, no crawler storage fields in a raw document.
 *
 * Every expectation is computed from public/mock at test time. The three programs
 * opened in the UI are the audit's acceptance cases, read from the snapshot by id:
 * HUST "Kỹ thuật hóa dược (CH-E11)" (its PLO was a PDF xref table), HUST ME-GU (its
 * PLO ended with a program director's name, mailbox and mobile number) and the
 * program whose document excerpt carried a hotline with an adviser's name.
 * domcontentloaded, not networkidle (AGENTS.md §12).
 */
const ROOT = path.join(__dirname, "..")
const MOCK = path.join(ROOT, "public", "mock")
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const vi: Record<string, string | undefined> = readJson(path.join(ROOT, "src", "messages", "vi.json")).programs

const CH_E11 = "46d09095-6ce5-448e-bb03-bff529074d35"
const ME_GU = "5fb9c540-5137-48fe-8ace-c31dfe1ea290"
const EXCERPT_PROGRAM = "3d6536f7-9526-4ab0-a93b-aa6fe4c9c148"
const PRIVATE_FIELDS = ["storagePath", "textPath", "contentHash", "errorMessage"]
const UNPUBLISHED_FILES = ["prerequisites-graph.json"]
// Book numbers: an ISBN-10 has the shape of a mobile number.
const NOT_CONTACT_KEYS = new Set(["isbn"])

// Same definitions as the exporter, written for JS (Unicode-aware boundaries).
const W = "[\\p{L}\\p{N}_]"
const B = `(?<!${W})`
const E = `(?!${W})`
const PHONE = new RegExp(`(?<![\\p{L}\\p{N}_/.-])(?:\\+84[\\s.]?|0)\\d{1,3}[\\s.-]?\\d{3,4}[\\s.-]?\\d{3,4}(?![\\p{L}\\p{N}_/-])`, "gu")
const EMAIL = new RegExp(`[\\p{L}\\p{N}_.%+-]+@((?:[\\p{L}\\p{N}_-]+\\.)+[\\p{L}\\p{N}_-]{2,})`, "gu")
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.com.vn", "hotmail.com", "outlook.com",
    "live.com", "icloud.com", "aol.com", "proton.me", "protonmail.com"])
const PERSON = new RegExp(
    `${B}(?:Dr|Mr|Mrs|Ms|Prof)\\.?\\s+${W}|${B}(?:TS|ThS|PGS|GS|NCS)\\.\\s*${W}|${B}Name\\s*:|${B}Họ (?:và )?tên\\s*:` +
        `|${B}Director${E}|${B}Giám đốc${E}|${B}Người liên hệ${E}`,
    "u"
)
const isMobile = (s: string) => {
    let d = s.replace(/\D/g, "")
    if (d.startsWith("84")) d = "0" + d.slice(2)
    return /^0[35789]\d{8}$/.test(d)
}
type Contact = { personal: boolean; text: string }
/** Phone numbers and mailboxes on one line, each marked personal or not. */
function contacts(line: string): Contact[] {
    const phones = [...line.matchAll(PHONE)].map((m) => m[0])
    const mails = [...line.matchAll(EMAIL)].map((m) => ({ text: m[0], domain: m[1].toLowerCase() }))
    if (!phones.length && !mails.length) return []
    const named = PERSON.test(line)
    return [
        ...phones.map((p) => ({ personal: named || isMobile(p), text: p })),
        ...mails.map((m) => ({ personal: named || FREE_MAIL.has(m.domain), text: m.text })),
    ]
}
const personalLines = (text: string) => text.split("\n").filter((l) => contacts(l).some((c) => c.personal))

// (b) page-dump markers and whole footer lines.
const DUMP: Record<string, RegExp> = {
    search_form: /Tìm kiếm cho:/,
    pdf_syntax: /\bendobj\b|\bstartxref\b|%%EOF/,
    json_ld: /"@type"\s*:/,
    site_menu: /^Toggle navigation$/m,
}
const NEU_TABS = new Set(["Chuẩn đầu ra chương trình", "Cơ hội việc làm và khả năng học tập nâng cao", "Quy trình đào tạo",
    "Điều kiện tốt nghiệp", "Chương trình đào tạo", "Phương pháp giảng dạy và đánh giá", "Chương trình đào tạo tham khảo",
    "Tiêu chuẩn đội ngũ giảng viên", "Cơ sở vật chất, công nghệ và học liệu", "Hướng dẫn thực hiện"])
const FOOTER_LINES = new Set(["Bài viết liên quan", "Các tin khác", "Previous article", "Next article", "NỘP HỒ SƠ XÉT TUYỂN",
    "NỘP HỒ SƠ", "admin", "Bài trước", "Bài tiếp theo", "Liên hệ"])
function junkOf(lo: string): string[] {
    const found = Object.entries(DUMP).filter(([, rx]) => rx.test(lo)).map(([k]) => k)
    const lines = lo.split("\n").map((l) => l.trim())
    if (lines.slice(0, 15).filter((l) => NEU_TABS.has(l)).length >= 5) found.push("neu_tab_bar")
    for (const l of lines) if (FOOTER_LINES.has(l)) found.push(`footer "${l}"`)
    return found
}

type Program = Record<string, unknown> & { id: string; name: string; learningOutcomes: string | null; evaluationScore?: number | null }
const index = readJson(path.join(MOCK, "index.json"))
const chunkRows: Program[] = (index.chunks as string[]).flatMap((f) => readJson(path.join(MOCK, "programs", f)))
const byId = (id: string): Program => readJson(path.join(MOCK, "programs-by-id", `${id}.json`))
const EVAL_COMPONENTS = ["evalOutcomes", "evalStructure", "evalKnowledgeBlocks", "evalCompleteness"]

function* jsonFiles(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
        const p = path.join(dir, name)
        if (statSync(p).isDirectory()) yield* jsonFiles(p)
        else if (name.endsWith(".json")) yield p
    }
}
function* strings(v: unknown, key = ""): Generator<[string, string]> {
    if (typeof v === "string") yield [key, v]
    else if (Array.isArray(v)) for (const x of v) yield* strings(x, key)
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) yield* strings(x, k)
}

const dialogNamed = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
async function openDialog(page: Page, p: Program): Promise<Locator> {
    await page.goto(`/vi?program=${p.id}`, { waitUntil: "domcontentloaded" })
    const box = dialogNamed(page, p.name)
    await expect(box).toBeVisible({ timeout: 30000 })
    return box
}
const MESSAGE_KEYS = ["learningOutcomes", "evalTab", "evalEmpty", "slmRefScore", "rawDocumentsTab", "infoTab"] as const

test.describe("v2.55 — personal data and page junk out of the snapshot", () => {
    test("message keys used below exist", () => {
        for (const k of MESSAGE_KEYS) expect(typeof vi[k] === "string" && (vi[k] as string).length > 0, k).toBe(true)
    })

    test("(a) no personal phone number or mailbox anywhere in public/mock", () => {
        test.setTimeout(300000)
        const personal: string[] = []
        let institutional = 0
        let files = 0
        for (const f of jsonFiles(MOCK)) {
            files++
            for (const [key, s] of strings(readJson(f))) {
                if (NOT_CONTACT_KEYS.has(key)) continue
                for (const line of s.split("\n")) {
                    for (const c of contacts(line)) {
                        if (c.personal) personal.push(`${path.relative(MOCK, f)} [${key}] ${c.text}: ${line.trim().slice(0, 120)}`)
                        else institutional++
                    }
                }
            }
        }
        expect(files).toBeGreaterThan(1000)
        // The scan is exercised: institutional numbers / role mailboxes (and digit runs) are seen and kept.
        expect(institutional).toBeGreaterThan(0)
        expect(personal).toEqual([])
    })

    test("(b) no published PLO is a page dump or carries a site footer line", () => {
        const rows: [string, Program][] = [
            ...chunkRows.map((p) => ["chunk", p] as [string, Program]),
            ...chunkRows.map((p) => ["by-id", byId(p.id)] as [string, Program]),
        ]
        const withPlo = rows.filter(([, p]) => typeof p.learningOutcomes === "string" && p.learningOutcomes.trim())
        expect(withPlo.length).toBeGreaterThan(1000)
        const bad = withPlo.flatMap(([w, p]) => junkOf(p.learningOutcomes as string).map((j) => `${w} ${p.id} ${j}`))
        expect(bad).toEqual([])
    })

    test("(c) CH-E11: no PLO and no SLM score; ME-GU keeps its PLO without the contact line", () => {
        for (const p of [byId(CH_E11), chunkRows.find((r) => r.id === CH_E11)!]) {
            expect(p.learningOutcomes).toBeNull()
            expect(p.evaluationScore ?? null).toBeNull()
            expect(EVAL_COMPONENTS.filter((k) => k in p)).toEqual([])
        }
        for (const p of [byId(ME_GU), chunkRows.find((r) => r.id === ME_GU)!]) {
            expect(typeof p.learningOutcomes).toBe("string")
            const lo = p.learningOutcomes as string
            expect(lo.split("\n").filter((l) => l.trim()).length).toBeGreaterThan(5)
            expect(personalLines(lo)).toEqual([])
        }
    })

    test("(d) no unread files, no raw document of an unpublished program, no storage fields", () => {
        for (const f of UNPUBLISHED_FILES) expect(existsSync(path.join(MOCK, f)), f).toBe(false)
        const ids = new Set(chunkRows.map((p) => p.id))
        const dir = path.join(MOCK, "raw-documents")
        const files = readdirSync(dir)
        expect(files.length).toBeGreaterThan(0)
        expect(files.filter((f) => !ids.has(f.replace(/\.json$/, "")))).toEqual([])
        const withPrivate: string[] = []
        for (const f of files)
            for (const d of readJson(path.join(dir, f)) as Record<string, unknown>[])
                for (const k of PRIVATE_FIELDS) if (k in d) withPrivate.push(`${f} ${d.id} ${k}`)
        expect(withPrivate).toEqual([])
        const docs: { extractedText?: string | null }[] = readJson(path.join(dir, `${EXCERPT_PROGRAM}.json`))
        const texts = docs.map((d) => d.extractedText).filter((t): t is string => typeof t === "string" && t.length > 0)
        expect(texts.length).toBeGreaterThan(0)
        expect(texts.flatMap(personalLines)).toEqual([])
    })

    test.describe("dialog", () => {
        test.describe.configure({ timeout: 90000 })

        test("ME-GU: the PLO section shows the published PLO and no personal contact line", async ({ page }) => {
            const p = byId(ME_GU)
            const lo = (p.learningOutcomes as string).trim()
            const box = await openDialog(page, p)
            await expect(box.getByRole("heading", { name: vi.learningOutcomes!, exact: true })).toBeVisible()
            const lastLine = lo.split("\n").filter((l) => l.trim()).at(-1)!.trim()
            await expect(box).toContainText(lastLine.slice(0, 80))
            expect(personalLines(await box.innerText())).toEqual([])
        })

        test("CH-E11: no PLO section and no SLM score", async ({ page }) => {
            const p = byId(CH_E11)
            const box = await openDialog(page, p)
            await expect(box.getByRole("tab", { name: vi.infoTab!, exact: true })).toBeVisible()
            await expect(box.getByRole("heading", { name: vi.learningOutcomes!, exact: true })).toHaveCount(0)
            await box.getByRole("tab", { name: vi.evalTab!, exact: true }).click()
            await expect(box.getByText(vi.evalEmpty!)).toBeVisible()
            await expect(box).not.toContainText(`${vi.slmRefScore}:`)
        })

        test("documents tab: the excerpt has no personal contact line", async ({ page }) => {
            const p = byId(EXCERPT_PROGRAM)
            const box = await openDialog(page, p)
            await box.getByRole("tab", { name: vi.rawDocumentsTab!, exact: true }).click()
            const excerpts = box.getByTestId("raw-doc-excerpt")
            await expect(excerpts.first()).toBeVisible({ timeout: 15000 })
            const shown = await excerpts.allInnerTexts()
            expect(shown.length).toBeGreaterThan(0)
            expect(shown.flatMap(personalLines)).toEqual([])
            expect(personalLines(await box.innerText())).toEqual([])
        })
    })
})
