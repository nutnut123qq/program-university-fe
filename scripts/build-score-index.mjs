#!/usr/bin/env node
/**
 * build-score-index.mjs — the admissions rows the program list's score filter reads (v2.61).
 *
 * Reads (READ-ONLY):
 *   public/mock/universities.json        → university order and codes
 *   public/mock/admissions/<CODE>.json   → scores, quotas
 *
 * Writes:
 *   public/mock/score-index.json  (no timestamp: an unchanged mock gives a byte-identical file)
 *
 * Every score row and every quota row of every university's admissions file, in universities.json order and
 * file order, with only the fields the score filter reads (ProgramList: scale/method options, the qualifying
 * cutoff per program, the card hint's newest quota, the school/group threshold block). A projection, no
 * selection: the filter's own rules decide which rows count. `university` = the code the filter keys its rows
 * by. Columns as in search-index.json (`fields`, `values`, `rows`); string columns are stored as an index into
 * `values[field]`. One ~0.5 MB file instead of the 17 admissions files (~7 MB) on the filter's first use.
 *
 * Rerun after every mock export, admissions included (like build-search-index.mjs); the e2e fails on drift.
 *
 * No dependencies. Run: node scripts/build-score-index.mjs [--check]
 *   --check  exit 1 when the committed file differs from the rebuild.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const MOCK = path.join(ROOT, "public", "mock")
const OUT = path.join(MOCK, "score-index.json")

const SCORE_FIELDS = ["university", "programId", "year", "method", "methodLabel", "scope", "scopeLabel", "score", "scale", "kind", "comboNote", "sourceUrl"]
const QUOTA_FIELDS = ["university", "programId", "year", "scope", "quota"]
const NUMBERS = new Set(["year", "score", "scale", "quota"])

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"))

function columns(rows, fields) {
    const coded = fields.filter((f) => !NUMBERS.has(f))
    const values = Object.fromEntries(coded.map((f) => [f, [...new Set(rows.map((r) => r[f] ?? null))]]))
    const at = Object.fromEntries(coded.map((f) => [f, new Map(values[f].map((v, i) => [v, i]))]))
    return { fields, values, rows: rows.map((r) => fields.map((f) => (at[f] ? at[f].get(r[f] ?? null) : (r[f] ?? null)))) }
}

function buildIndex() {
    const scores = []
    const quotas = []
    for (const { code } of readJson(path.join(MOCK, "universities.json"))) {
        if (!code) continue
        // The file name rule of api.ts fetchAdmissions; a university without a file has no rows (as its 404 on Base).
        const file = path.join(MOCK, "admissions", `${code.replace(/[^a-zA-Z0-9_\-]/g, "_")}.json`)
        if (!existsSync(file)) continue
        const data = readJson(file)
        for (const s of data.scores ?? []) scores.push({ ...s, university: code })
        for (const q of data.quotas ?? []) quotas.push({ ...q, university: code })
    }
    if (scores.length === 0) throw new Error("no admission scores in public/mock/admissions — nothing to index")
    return { scores: columns(scores, SCORE_FIELDS), quotas: columns(quotas, QUOTA_FIELDS) }
}

const text = JSON.stringify(buildIndex()) + "\n"
if (process.argv.includes("--check")) {
    let current = ""
    try {
        current = readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") // a CRLF checkout is not drift
    } catch {
        // missing file = stale
    }
    if (current !== text) {
        console.error(`${path.relative(ROOT, OUT)} is stale — run: node scripts/build-score-index.mjs`)
        process.exit(1)
    }
    console.log(`${path.relative(ROOT, OUT)} matches public/mock (${Buffer.byteLength(text)} bytes)`)
} else {
    writeFileSync(OUT, text)
    console.log(`wrote ${path.relative(ROOT, OUT)} (${Buffer.byteLength(text)} bytes)`)
}
