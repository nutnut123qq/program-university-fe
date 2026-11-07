#!/usr/bin/env node
/**
 * build-cohort-options.mjs — the options of the list's cohort filter (v2.68, audit M44).
 *
 * Reads (READ-ONLY):
 *   public/mock/search-index.json  → the rows the list's search/filter reads in mock mode (code, name, universityId)
 *   public/mock/universities.json  → universityId → code
 *
 * Writes:
 *   src/lib/cohort-options.json  (no timestamp: an unchanged mock gives a byte-identical file)
 *     programs    — rows in the index
 *     withCohort  — rows carrying at least one cohort code (the filter hides every other row)
 *     universities — codes of the universities with such rows
 *     cohorts     — one entry per cohort code found, newest (highest number) first: id, programs, universities
 *
 * The cohorts of a row are read from its code or name by the same regex as src/lib/cohorts.ts `cohortsOf`, which the
 * filter reads: a span starting at "K" + exactly two digits (a "K" followed by more digits is an admission code, e.g.
 * TDTU "K7340101L"), every 2-digit group of the span a cohort ("K18D-19A" → K18, K19) — see cohorts.ts for the shapes.
 * So every option lists at least one program.
 *
 * Rerun after every mock export, after build-search-index.mjs; e2e/v268-search-accents-and-cohorts.spec.ts fails on drift.
 *
 * No dependencies. Run: node scripts/build-cohort-options.mjs [--check]
 *   --check  exit 1 when the committed file differs from the rebuild.
 */

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const MOCK = path.join(ROOT, "public", "mock")
const OUT = path.join(ROOT, "src", "lib", "cohort-options.json")
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"))

// Same rule as src/lib/cohorts.ts cohortsOf (keep the two regexes equal; e2e/v268 recomputes the options independently).
const SPAN = /(?<![0-9a-z])k\d{2}(?![0-9])[a-d]?(?:(?:[-_ ]|, ?)?k?\d{2}[a-d](?![0-9]))*|(?<=_)\d{2}[a-d](?:(?:[-_ ]|, ?)?\d{2}[a-d](?![0-9]))+/gi
const cohortsOf = (code, name) =>
    [...new Set([...`${code ?? ""} ${name ?? ""}`.matchAll(SPAN)].flatMap((m) => (m[0].match(/\d{2}/g) ?? []).map((d) => `K${d}`)))]

function buildOptions() {
    const { fields, values, rows } = readJson(path.join(MOCK, "search-index.json"))
    const col = (f) => fields.indexOf(f)
    const cell = (row, f) => (values[f] ? values[f][row[col(f)]] : row[col(f)])
    const uniCode = new Map(readJson(path.join(MOCK, "universities.json")).map((u) => [u.id, u.code]))
    const byCohort = new Map()
    const unis = new Set()
    let withCohort = 0
    for (const row of rows) {
        const found = cohortsOf(cell(row, "code"), cell(row, "name"))
        if (found.length === 0) continue
        const uni = uniCode.get(cell(row, "universityId"))
        if (!uni) throw new Error(`search-index row ${cell(row, "id")}: university ${cell(row, "universityId")} not in universities.json`)
        withCohort++
        unis.add(uni)
        for (const id of found) {
            const c = byCohort.get(id) ?? { id, programs: 0, universities: new Set() }
            c.programs++
            c.universities.add(uni)
            byCohort.set(id, c)
        }
    }
    return {
        programs: rows.length,
        withCohort,
        universities: [...unis].sort(),
        cohorts: [...byCohort.values()]
            .sort((a, b) => Number(b.id.slice(1)) - Number(a.id.slice(1)))
            .map((c) => ({ id: c.id, programs: c.programs, universities: [...c.universities].sort() })),
    }
}

const text = JSON.stringify(buildOptions(), null, 2) + "\n"
if (process.argv.includes("--check")) {
    let current = ""
    try {
        current = readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") // a CRLF checkout is not drift
    } catch {
        // missing file = stale
    }
    if (current !== text) {
        console.error(`${path.relative(ROOT, OUT)} is stale — run: node scripts/build-cohort-options.mjs`)
        process.exit(1)
    }
    console.log(`${path.relative(ROOT, OUT)} matches public/mock (${JSON.parse(text).cohorts.length} cohorts)`)
} else {
    writeFileSync(OUT, text)
    console.log(`wrote ${path.relative(ROOT, OUT)} (${JSON.parse(text).cohorts.length} cohorts, ${Buffer.byteLength(text)} bytes)`)
}
