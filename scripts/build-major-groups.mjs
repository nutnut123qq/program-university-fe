#!/usr/bin/env node
/**
 * build-major-groups.mjs — derive "same ngành at other universities" groups.
 *
 * Reads (READ-ONLY, never writes):
 *   public/mock/index.json                 → chunk list
 *   public/mock/programs/<chunk>           → Program rows
 *   public/mock/universities.json          → universityId → universityCode
 *   public/mock/admissions/<UNICODE>.json  → newest cutoff per member
 *
 * Writes:
 *   src/lib/major-groups.json
 *
 * Grouping: normalize program.name → name key (lowercase, strip diacritics,
 * drop parenthesized + qualifier tail segments, drop qualifier phrases and
 * code-like tokens, expand obvious abbreviations). Union programs by name key;
 * additionally union by 7-digit catalog major code — but ONLY between name
 * keys whose token sets are subset-compatible, so a mis-coded program cannot
 * chain-merge two genuinely different ngành (partial-honest grouping).
 *
 * No dependencies. Run: node scripts/build-major-groups.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const MOCK = path.join(ROOT, "public", "mock")
const OUT = path.join(ROOT, "src", "lib", "major-groups.json")

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"))

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const stripDiacritics = (s) =>
    s
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Mn}/gu, "")
        .replace(/đ/g, "d")

/** Multi-word qualifier phrases removed anywhere (longest first at apply time). */
const QUALIFIER_PHRASES = [
    "dinh huong nghe nghiep",
    "chat luong cao",
    "chuyen nganh",
    "chuong trinh",
    "tien tien",
    "dac biet",
    "song bang",
    "don bang",
    "lien ket",
    "phan hieu",
    "khanh hoa",
    "quang tri",
    "cu nhan",
    "hoc tai",
    "du bi",
]

/** Whole-token qualifiers dropped after phrase removal. */
const DROP_TOKENS = new Set(["ct", "ctdt", "clc", "ctclc", "cttt", "nganh"])

/** Abbreviation expansion at token level. */
const ABBREV = {
    cntt: "cong nghe thong tin",
    khmt: "khoa hoc may tinh",
    ktpm: "ky thuat phan mem",
    attt: "an toan thong tin",
}

/**
 * A dash/slash-separated tail segment containing any of these marks a program
 * variant ("- Chương trình tiên tiến", "/ Chương trình POHE", …) — the segment
 * and everything after it is dropped.
 */
const QUALIFIER_SEGMENT =
    /chuong trinh|chuyen nganh|phan hieu|lien ket|du bi|hoc tai|chat luong cao|tien tien|song bang|don bang|dac biet|clc|ctclc|cttt/

function normalizeName(raw) {
    let s = stripDiacritics(String(raw ?? ""))

    // Remove balanced (...) groups iteratively, then unclosed tails / strays.
    for (let i = 0; i < 6 && /\([^()]*\)/.test(s); i++) {
        s = s.replace(/\([^()]*\)/g, " ")
    }
    s = s.replace(/\([^)]*$/g, " ").replace(/\)/g, " ")

    // FPT style: "<ngành>, chuyên ngành <specialization>" → cut at ", chuyên ngành".
    s = s.split(/,\s*chuyen nganh/)[0]

    // Underscore separates name|variant in this dataset ("X_CTCLC", "X_Phien dich …").
    s = s.split("_")[0]

    // "&" is the Vietnamese "và" in names ("Logistics & Quản lý chuỗi cung ứng").
    s = s.replace(/&/g, " va ")

    // Drop tail segments from the first qualifier segment onward.
    const segments = s.split(/\s+[-–—]\s+|\/+/).map((x) => x.trim())
    let kept = []
    for (const seg of segments) {
        if (QUALIFIER_SEGMENT.test(seg)) break
        if (seg) kept.push(seg)
    }
    s = kept.join(" ")

    // Remove code-like tokens: pure digits, or tokens with >=4 consecutive digits
    // (bare catalog codes such as 7480201 left after paren stripping).
    s = s
        .split(/\s+/)
        .filter((tok) => tok && !/^\d+$/.test(tok) && !/\d{4,}/.test(tok))
        .join(" ")

    // Remove multi-word qualifier phrases (word boundaries, longest first).
    for (const phrase of QUALIFIER_PHRASES) {
        s = s.replace(new RegExp(`\\b${phrase}\\b`, "g"), " ")
    }

    // Drop single-token qualifiers and expand abbreviations.
    s = s
        .split(/\s+/)
        .filter((tok) => tok && !DROP_TOKENS.has(tok))
        .map((tok) => ABBREV[tok] ?? tok)
        .join(" ")

    return s.replace(/\s+/g, " ").trim()
}

/** First 7-digit run of the program code = national catalog major code. */
function majorCodeOf(code) {
    const m = String(code ?? "").match(/\d{7}/)
    return m ? m[0] : null
}

/**
 * Canonical display name: same cleanup as the group key but preserving the
 * original casing/diacritics — strip parens, cut ", chuyên ngành …" and
 * qualifier tail segments, drop leading program-marker tokens
 * (CTĐT / Chương trình / Cử nhân / Ngành) and pure-code tokens.
 */
function displayClean(raw) {
    let s = ` ${String(raw ?? "")} `
    for (let i = 0; i < 6 && /\([^()]*\)/.test(s); i++) {
        s = s.replace(/\([^()]*\)/g, " ")
    }
    s = s.replace(/\([^)]*$/g, " ").replace(/\)/g, " ")
    s = s.replace(/,?\s*chuy[eê]n\s+ng[aà]nh.*$/i, " ")
    s = s.split("_")[0]

    const segments = s.split(/\s+[-–—]\s+|\/+/).map((x) => x.trim())
    const kept = []
    for (const seg of segments) {
        if (QUALIFIER_SEGMENT.test(stripDiacritics(seg))) break
        if (seg) kept.push(seg)
    }
    // Keep a canonical " - " between legitimate name parts ("Tài chính - Ngân hàng").
    s = kept.join(" - ")

    // Token-level cleanup on folded forms; original casing preserved.
    let toks = s.split(/\s+/).filter(Boolean)
    const folded = toks.map(stripDiacritics)
    const drop = new Array(toks.length).fill(false)
    toks.forEach((tok, i) => {
        if (/^\d+$/.test(tok) || /\d{4,}/.test(tok) || DROP_TOKENS.has(folded[i])) drop[i] = true
    })
    // Multi-word qualifier phrases as contiguous token runs.
    for (const phrase of QUALIFIER_PHRASES) {
        const pt = phrase.split(" ")
        outer: for (let i = 0; i + pt.length <= toks.length; i++) {
            for (let j = 0; j < pt.length; j++) {
                if (folded[i + j] !== pt[j]) continue outer
            }
            for (let j = 0; j < pt.length; j++) drop[i + j] = true
        }
    }
    s = toks.filter((_, i) => !drop[i]).join(" ")
    return s.replace(/\s+/g, " ").trim()
}

const tokenSet = (key) => new Set(key.split(/\s+/).filter(Boolean))
const isSubset = (a, b) => {
    for (const t of a) if (!b.has(t)) return false
    return true
}

// ---------------------------------------------------------------------------
// Union-find
// ---------------------------------------------------------------------------

class DSU {
    constructor(n) {
        this.p = Array.from({ length: n }, (_, i) => i)
    }
    find(x) {
        while (this.p[x] !== x) {
            this.p[x] = this.p[this.p[x]]
            x = this.p[x]
        }
        return x
    }
    union(a, b) {
        const ra = this.find(a)
        const rb = this.find(b)
        if (ra !== rb) this.p[ra] = rb
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const index = readJson(path.join(MOCK, "index.json"))
const universities = readJson(path.join(MOCK, "universities.json"))
const uniCodeById = new Map(universities.map((u) => [u.id, u.code]))

/** @type {{id:string,name:string,code:string|null,universityId:string,universityName:string,universityCode:string,sourceUrl:string|null,isActive:boolean,nameKey:string,majorCode:string|null}[]} */
const programs = []
for (const chunk of index.chunks) {
    const arr = readJson(path.join(MOCK, "programs", chunk))
    for (const p of arr) {
        programs.push({
            id: p.id,
            name: p.name,
            code: p.code ?? null,
            universityId: p.universityId,
            universityName: p.universityName,
            universityCode: uniCodeById.get(p.universityId) ?? "?",
            sourceUrl: p.sourceUrl ?? null,
            isActive: p.isActive !== false,
            nameKey: normalizeName(p.name),
            majorCode: majorCodeOf(p.code),
        })
    }
}
console.log(`programs loaded: ${programs.length}`)

const dsu = new DSU(programs.length)

// Pass 1 — union by identical normalized name key.
const byNameKey = new Map()
programs.forEach((p, i) => {
    if (p.nameKey.length < 3) return
    const list = byNameKey.get(p.nameKey) ?? []
    if (list.length) dsu.union(list[0], i)
    list.push(i)
    byNameKey.set(p.nameKey, list)
})

// Pass 2 — union by catalog major code, but only between name keys whose token
// sets are subset-compatible (one name contains the other). Blocks false
// chain-merges (e.g. a CNTT-named program carrying the KHMT code 7480101).
const keysByMajorCode = new Map()
programs.forEach((p, i) => {
    if (!p.majorCode || p.nameKey.length < 3) return
    if (!keysByMajorCode.has(p.majorCode)) keysByMajorCode.set(p.majorCode, new Map())
    const m = keysByMajorCode.get(p.majorCode)
    if (!m.has(p.nameKey)) m.set(p.nameKey, { tokens: tokenSet(p.nameKey), firstIdx: i })
})
for (const [code, nameMap] of keysByMajorCode) {
    const entries = [...nameMap.values()]
    for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
            const a = entries[i].tokens
            const b = entries[j].tokens
            if (isSubset(a, b) || isSubset(b, a)) {
                dsu.union(entries[i].firstIdx, entries[j].firstIdx)
            }
        }
    }
    void code
}

// Collect components; keep groups spanning >= 2 distinct university codes.
const comps = new Map()
programs.forEach((p, i) => {
    const r = dsu.find(i)
    if (!comps.has(r)) comps.set(r, [])
    comps.get(r).push(i)
})

// ---------------------------------------------------------------------------
// Admissions: newest program-scope cutoff per member.
// ---------------------------------------------------------------------------

const admissionsCache = new Map()
function admissionsFor(uniCode) {
    if (!admissionsCache.has(uniCode)) {
        const p = path.join(MOCK, "admissions", `${uniCode}.json`)
        let data = null
        if (existsSync(p)) {
            try {
                data = readJson(p)
            } catch {
                data = null
            }
        }
        admissionsCache.set(uniCode, data)
    }
    return admissionsCache.get(uniCode)
}

/** Index cutoff rows by programId, per university file. */
const cutoffIndexCache = new Map()
function cutoffIndexFor(uniCode) {
    if (!cutoffIndexCache.has(uniCode)) {
        const data = admissionsFor(uniCode)
        const byPid = new Map()
        if (data?.scores) {
            for (const s of data.scores) {
                if (s.programId == null || s.scope !== "program" || s.kind !== "cutoff") continue
                if (!byPid.has(s.programId)) byPid.set(s.programId, [])
                byPid.get(s.programId).push(s)
            }
        }
        cutoffIndexCache.set(uniCode, byPid)
    }
    return cutoffIndexCache.get(uniCode)
}

function newestCutoff(member) {
    const rows = cutoffIndexFor(member.universityCode).get(member.id)
    if (!rows || rows.length === 0) return null
    const year = Math.max(...rows.map((r) => r.year ?? 0))
    const thatYear = rows.filter((r) => r.year === year && typeof r.score === "number")
    if (thatYear.length === 0) return null
    const best = thatYear.reduce((a, b) => (a.score <= b.score ? a : b))
    return {
        year: best.year,
        method: best.method ?? null,
        methodLabel: best.methodLabel ?? null,
        score: best.score,
        scale: best.scale ?? null,
    }
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const groups = []
for (const idxs of comps.values()) {
    const uniCodes = new Set(idxs.map((i) => programs[i].universityCode))
    if (uniCodes.size < 2) continue

    const members = idxs
        .map((i) => programs[i])
        .sort((a, b) => a.universityCode.localeCompare(b.universityCode) || a.name.localeCompare(b.name, "vi"))
        .map((p) => ({
            programId: p.id,
            programName: p.name,
            code: p.code,
            universityCode: p.universityCode,
            universityName: p.universityName,
            sourceUrl: p.sourceUrl,
            newestCutoff: newestCutoff(p),
        }))

    // Canonical key: most common nameKey (tie → shortest → alphabetical).
    const keyFreq = new Map()
    for (const i of idxs) {
        const k = programs[i].nameKey
        keyFreq.set(k, (keyFreq.get(k) ?? 0) + 1)
    }
    const key = [...keyFreq.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0])
    )[0][0]

    // Display label: most common cleaned member name in the canonical nameKey
    // bucket (cleaning keeps casing, drops parens/qualifier/code noise).
    // Fallback: most common raw name when every cleaned form is empty.
    const nameFreq = new Map()
    for (const i of idxs) {
        if (programs[i].nameKey !== key) continue
        const n = displayClean(programs[i].name)
        if (!n) continue
        nameFreq.set(n, (nameFreq.get(n) ?? 0) + 1)
    }
    const rankNames = (entries) =>
        entries.sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0], "vi"))
    let label = rankNames([...nameFreq.entries()])[0]?.[0]
    if (!label) {
        const all = new Map()
        for (const i of idxs) all.set(programs[i].name, (all.get(programs[i].name) ?? 0) + 1)
        label = rankNames([...all.entries()])[0][0]
    }

    groups.push({ key, label, members })
}

groups.sort((a, b) => b.members.length - a.members.length || a.label.localeCompare(b.label, "vi"))

mkdirSync(path.dirname(OUT), { recursive: true })
writeFileSync(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), groups }, null, 2) + "\n",
    "utf8"
)

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

const memberCount = groups.reduce((n, g) => n + g.members.length, 0)
const withCutoff = groups.reduce(
    (n, g) => n + g.members.filter((m) => m.newestCutoff).length,
    0
)
console.log(`groups written: ${groups.length} (members: ${memberCount}, with newestCutoff: ${withCutoff})`)
console.log(`output: ${path.relative(ROOT, OUT)}`)
console.log("\ntop groups:")
for (const g of groups.slice(0, 5)) {
    const unis = new Set(g.members.map((m) => m.universityCode))
    console.log(`  ${g.members.length} members / ${unis.size} unis — ${g.label}  [${g.key}]`)
}
const cntt = groups.filter(
    (g) => g.key.includes("cong nghe thong tin") || g.label.toLowerCase().includes("công nghệ thông tin")
)
console.log(`\ngroups containing "cong nghe thong tin": ${cntt.length}`)
for (const g of cntt) {
    console.log(`  - [${g.key}] "${g.label}" members=${g.members.length} unis=${new Set(g.members.map((m) => m.universityCode)).size}`)
}
