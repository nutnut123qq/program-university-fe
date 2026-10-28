#!/usr/bin/env node
/**
 * build-analytics.mjs — derive every number of the analytics page from the snapshot.
 *
 * Reads (READ-ONLY):
 *   public/mock/index.json         → chunk list
 *   public/mock/programs/<chunk>   → Program rows (courseCount, evaluationScore, dataSufficiency)
 *   public/mock/universities.json  → universityId → code, name
 *
 * Writes:
 *   src/lib/analytics-snapshot.json  (no timestamp: an unchanged mock gives a byte-identical file)
 *
 * "Enough data": a program counts in the averages, the share ≥ 6.0 and the
 * score bands when it carries an SLM score, has a course list (courseCount > 0
 * — without courses structure and knowledge blocks cannot be scored) and is
 * not marked dataSufficiency "insufficient" (the program dialog hides that
 * score). A university with no such program gets mean null: shown as
 * "not enough data", unranked, after the ranked rows.
 *
 * e2e/v247-honest-analytics.spec.ts recomputes the same from public/mock and
 * fails when the committed file is stale. Rerun after every mock export.
 *
 * No dependencies. Run: node scripts/build-analytics.mjs [--check]
 *   --check  exit 1 when the committed file differs from the recomputation.
 */

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const MOCK = path.join(ROOT, "public", "mock")
const OUT = path.join(ROOT, "src", "lib", "analytics-snapshot.json")

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"))

// Score bands, high → low: a score belongs to the first band whose minimum it reaches.
const BANDS = [
    [9, "9.0 - 10.0"],
    [7.5, "7.5 - 8.9"],
    [6, "6.0 - 7.4"],
    [4, "4.0 - 5.9"],
    [-Infinity, "1.0 - 3.9"],
]

const enough = (p) => typeof p.evaluationScore === "number" && p.courseCount > 0 && p.dataSufficiency !== "insufficient"
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const r2 = (x) => Number(x.toFixed(2))

function buildAnalytics() {
    const programs = readJson(path.join(MOCK, "index.json")).chunks.flatMap((f) => readJson(path.join(MOCK, "programs", f)))
    const basis = programs.filter(enough).map((p) => p.evaluationScore)
    if (basis.length === 0) throw new Error("no program with enough data — nothing to show on the analytics page")

    const rows = readJson(path.join(MOCK, "universities.json"))
        .map((u) => {
            const mine = programs.filter((p) => p.universityId === u.id)
            const xs = mine.filter(enough).map((p) => p.evaluationScore)
            return { code: u.code, name: u.name, programs: mine.length, n: xs.length, raw: xs.length ? mean(xs) : null }
        })
        .filter((u) => u.programs > 0)
    const byCode = (a, b) => (a.code < b.code ? -1 : 1)
    const ranked = rows.filter((u) => u.raw !== null).sort((a, b) => b.raw - a.raw || byCode(a, b))
    const noData = rows.filter((u) => u.raw === null).sort(byCode)

    return {
        catalog: {
            programs: programs.length,
            courses: programs.reduce((sum, p) => sum + p.courseCount, 0),
            universities: rows.length,
            programsWithoutCourses: programs.filter((p) => p.courseCount === 0).length,
        },
        scoredPrograms: programs.filter((p) => typeof p.evaluationScore === "number").length,
        basis: { programs: basis.length, mean: r2(mean(basis)), atLeast6: basis.filter((s) => s >= 6).length },
        bands: BANDS.map(([min, range], i) => ({
            range,
            count: basis.filter((s) => s >= min && (i === 0 || s < BANDS[i - 1][0])).length,
        })),
        universities: [...ranked, ...noData].map(({ raw, ...u }) => ({ ...u, mean: raw === null ? null : r2(raw) })),
    }
}

const text = JSON.stringify(buildAnalytics(), null, 2) + "\n"
if (process.argv.includes("--check")) {
    let current = ""
    try {
        current = readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") // a CRLF checkout is not drift
    } catch {
        // missing file = stale
    }
    if (current !== text) {
        console.error(`${path.relative(ROOT, OUT)} is stale — run: node scripts/build-analytics.mjs`)
        process.exit(1)
    }
    console.log(`${path.relative(ROOT, OUT)} matches public/mock`)
} else {
    writeFileSync(OUT, text)
    console.log(`wrote ${path.relative(ROOT, OUT)}`)
}
