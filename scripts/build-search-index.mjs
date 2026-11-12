#!/usr/bin/env node
/**
 * build-search-index.mjs — the compact program index the mock-mode list search reads (v2.50).
 *
 * Reads (READ-ONLY):
 *   public/mock/index.json         → chunk list
 *   public/mock/programs/<chunk>   → Program rows
 *
 * Writes:
 *   public/mock/search-index.json  (no timestamp: an unchanged mock gives a byte-identical file)
 *
 * One row per program, in chunk order (the old path's input order, so stable-sort
 * tie-breaks stay the same), with only the fields the program list reads: its
 * search/filters/sort (api.ts applyFiltersAndSort) and ProgramCard. Columns with
 * few distinct values are stored as an index into `values[field]`; lastCrawled
 * holds only its day (v2.73, the card's collection date). The card shows
 * the description under line-clamp-2, so a long one is cut after the word that
 * reaches DESCRIPTION_CUT characters + "…" (e2e/v250-search-index.spec.ts measures
 * that every kept text still needs more than two lines at the widest card, so the
 * two visible lines are the same as with the full text).
 * The detail dialog never reads this file: it loads programs-by-id/<id>.json.
 *
 * Rerun after every mock export (like build-analytics.mjs); the e2e fails on drift.
 *
 * No dependencies. Run: node scripts/build-search-index.mjs [--check]
 *   --check  exit 1 when the committed file differs from the rebuild.
 */

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { crawlDay } from "./crawl-day.mjs"

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const MOCK = path.join(ROOT, "public", "mock")
const OUT = path.join(MOCK, "search-index.json")

const FIELDS = [
    "id", "universityId", "universityName", "universityIsPublic", "name", "code", "degreeType", "credits",
    "duration", "language", "sourceUrl", "lastCrawled", "description", "courseCount", "createdAt",
]
const DICTIONARY = ["universityId", "universityName", "universityIsPublic", "degreeType", "duration", "language", "lastCrawled"]
const DESCRIPTION_CUT = 250

// The card prints only the collection day (v2.73, src/lib/crawl-date.ts), so the index keeps the day as written
// ("YYYY-MM-DD", ~10 distinct values, dictionary-coded) instead of the full timestamp — through crawl-day.mjs, which
// accepts only +07:00 timestamps (their written day is the Vietnam day the helper prints) and stops on anything else.

// Cut at the first whitespace at or after DESCRIPTION_CUT, so the kept text ends with
// a whole word and is never shorter than the cut; no whitespace after it → kept whole.
const cutDescription = (d) => {
    if (typeof d !== "string") return d
    const end = d.slice(DESCRIPTION_CUT).search(/\s/)
    return end < 0 ? d : d.slice(0, DESCRIPTION_CUT + end) + "…"
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"))

function buildIndex() {
    const programs = readJson(path.join(MOCK, "index.json"))
        .chunks.flatMap((f) => readJson(path.join(MOCK, "programs", f)))
        .map((p) => ({ ...p, lastCrawled: crawlDay(p.lastCrawled ?? null) }))
    if (programs.length === 0) throw new Error("no programs in public/mock — nothing to index")
    const values = Object.fromEntries(DICTIONARY.map((f) => [f, [...new Set(programs.map((p) => p[f] ?? null))]]))
    const rows = programs.map((p) =>
        FIELDS.map((f) => {
            const v = p[f] ?? null
            if (values[f]) return values[f].indexOf(v)
            return f === "description" ? cutDescription(v) : v
        })
    )
    return { fields: FIELDS, values, rows }
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
        console.error(`${path.relative(ROOT, OUT)} is stale — run: node scripts/build-search-index.mjs`)
        process.exit(1)
    }
    console.log(`${path.relative(ROOT, OUT)} matches public/mock (${Buffer.byteLength(text)} bytes)`)
} else {
    writeFileSync(OUT, text)
    console.log(`wrote ${path.relative(ROOT, OUT)} (${Buffer.byteLength(text)} bytes)`)
}
