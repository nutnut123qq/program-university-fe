/**
 * Text search for every search box (v2.68, audit M9/M18): the list, compare, the score-filter pool, the dialog's course
 * search, /materials and the /roadmap course search all match through this file.
 */

/**
 * The search fold (v2.63 /roadmap, v2.68 every text search): Vietnamese diacritics (NFD marks, so NFD and NFC text fold
 * alike; đ/Đ → d) and letter case dropped; "_" (FPT's "English_Vietnamese" names, codes like "BIT_SE_K15D") and runs of
 * white space read as one space; trimmed. Other punctuation stays: a query matches as typed.
 */
export const foldSearch = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim()

/** NFC, letter case, "_" and white-space runs as one space, trimmed — diacritics kept. */
const tidy = (s: string) => s.normalize("NFC").toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim()

/** One code unit of tidied text without its diacritics (đ → d): the fold kept one code unit per code unit, memoized. */
const BARE = new Map<string, string>()
const bareUnit = (c: string) => {
    let b = BARE.get(c)
    if (b === undefined) {
        b = c === "đ" ? "d" : (c.normalize("NFD").replace(/[\u0300-\u036f]/g, "") || c)[0]
        BARE.set(c, b)
    }
    return b
}
const bareUnits = (s: string) => {
    let out = ""
    for (let i = 0; i < s.length; i++) out += bareUnit(s[i])
    return out
}

/**
 * A searched text's tidied and bare forms, computed once (v2.68 fix r1: a keystroke then costs a lookup per text, as at
 * Base). Only data texts (names, codes, descriptions) are keys — queries are not — so the memo is bounded by the data.
 */
const FORMS = new Map<string, readonly [string, string]>()
function formsOf(text: string): readonly [string, string] {
    let f = FORMS.get(text)
    if (f === undefined) {
        const t = tidy(text)
        f = [t, bareUnits(t)]
        FORMS.set(text, f)
    }
    return f
}

/**
 * Whether a text contains the query, letter by letter (v2.68, audit M9): a letter typed without a diacritic matches
 * that letter with any (d matches đ), a letter typed with one matches only that letter as typed. So a query typed
 * without diacritics, or with some, finds every text the fully accented query finds (and every text its lower-case
 * substring found before), while "Hóa học" does not find "Khoa học". NFC, letter case, "_" and white space tidied on
 * both sides; an empty query finds everything.
 */
export function searchMatcher(query: string): (text: string | null | undefined) => boolean {
    const q = tidy(query)
    const qb = bareUnits(q)
    const typed: number[] = [] // query positions typed with a diacritic
    for (let j = 0; j < q.length; j++) if (q[j] !== qb[j]) typed.push(j)
    return (text) => {
        const [t, tb] = formsOf(text ?? "")
        for (let i = tb.indexOf(qb); i !== -1; i = tb.indexOf(qb, i + 1)) if (typed.every((j) => t[i + j] === q[j])) return true
        return false
    }
}

/** Whether a text contains the whole query as typed, diacritics included (NFC, letter case, "_" and white space tidied). */
export function exactMatcher(query: string): (text: string | null | undefined) => boolean {
    const q = tidy(query)
    return (text) => formsOf(text ?? "")[0].includes(q)
}

/** The query carries a diacritic (a tone or vowel mark, or đ). */
export const hasDiacritics = (query: string) => foldSearch(query) !== tidy(query)
