#!/usr/bin/env node
/**
 * build-roadmap-names.mjs — the course names /roadmap reads for its name search and its neighbour cards (v2.63).
 *
 * Reads (READ-ONLY):
 *   public/mock/roadmaps/<UNI>/index.json     → the university's course codes, in index order
 *   public/mock/roadmaps/<UNI>/<code>.json    → each course file's subjectName
 *
 * Writes:
 *   public/mock/roadmap-names/<UNI>.json  (one per roadmap folder; no timestamp: unchanged roadmaps give byte-identical files)
 *
 * Each file maps every code of the university's index to the subjectName of that code's own roadmap file — the name
 * the page shows for the course (banner, centre card). The map is built in index order, but JSON key order is
 * JavaScript's: integer-like codes (1,554 TDTU codes without a leading zero) come first, ascending. Readers look a name
 * up by code and never rely on the order; the bytes are still deterministic (--check). One read per university instead
 * of one per course file: the name search needs every name of the university, a neighbour card the name of one file.
 * Outside `roadmaps/` on purpose: a `roadmaps/<UNI>/` folder holds exactly its index + course files (v2.53 spec), and a
 * `names.json` there would also take the file name of a course coded "names".
 *
 * The roadmap folders are committed data with no generator (AGENTS.md §4.4): rerun after any change under
 * public/mock/roadmaps/ (the e2e drift test and --check fail otherwise).
 *
 * No dependencies. Run: node scripts/build-roadmap-names.mjs [--check]
 *   --check  exit 1 when a committed file differs from the rebuild, is missing, or no longer has a roadmap folder.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const MOCK = path.join(ROOT, "public", "mock")
const ROADMAPS = path.join(MOCK, "roadmaps")
const OUT_DIR = path.join(MOCK, "roadmap-names")

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"))
// The fetchers' file-name rule (src/features/programs/api.ts).
const fileName = (code) => code.replace(/[^a-zA-Z0-9_\-]/g, "_")

function buildNames(uni) {
    const dir = path.join(ROADMAPS, uni)
    const index = readJson(path.join(dir, "index.json"))
    if (!Array.isArray(index) || index.length === 0) throw new Error(`roadmaps/${uni}/index.json: not a non-empty list`)
    const names = {}
    for (const code of index) {
        if (typeof code !== "string" || !code) throw new Error(`roadmaps/${uni}/index.json: a code that is not a string`)
        if (Object.prototype.hasOwnProperty.call(names, code)) throw new Error(`roadmaps/${uni}/index.json: ${code} twice`)
        const file = path.join(dir, `${fileName(code)}.json`)
        if (!existsSync(file)) throw new Error(`roadmaps/${uni}/${fileName(code)}.json: listed in the index, no file`)
        const name = readJson(file).subjectName
        names[code] = typeof name === "string" ? name : ""
    }
    return names
}

const unis = readdirSync(ROADMAPS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
if (unis.length === 0) throw new Error("no folder under public/mock/roadmaps — nothing to build")
const files = new Map(unis.map((uni) => [`${fileName(uni)}.json`, JSON.stringify(buildNames(uni)) + "\n"]))

if (process.argv.includes("--check")) {
    const stale = []
    for (const [f, text] of files) {
        let current = ""
        try {
            current = readFileSync(path.join(OUT_DIR, f), "utf8").replace(/\r\n/g, "\n") // a CRLF checkout is not drift
        } catch {
            // missing file = stale
        }
        if (current !== text) stale.push(f)
    }
    const extra = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((f) => !files.has(f)) : []
    if (stale.length || extra.length) {
        console.error(
            `public/mock/roadmap-names is stale (${[...stale.map((f) => `differs: ${f}`), ...extra.map((f) => `no roadmap folder: ${f}`)].join(", ")}) — ` +
                `${extra.length ? "remove the files without a roadmap folder, then " : ""}run: node scripts/build-roadmap-names.mjs`
        )
        process.exit(1)
    }
    console.log(`public/mock/roadmap-names matches public/mock/roadmaps (${[...files].map(([f, t]) => `${f} ${Buffer.byteLength(t)} bytes`).join(", ")})`)
} else {
    mkdirSync(OUT_DIR, { recursive: true })
    for (const f of readdirSync(OUT_DIR)) if (!files.has(f)) throw new Error(`public/mock/roadmap-names/${f} has no roadmap folder — remove it by hand`)
    for (const [f, text] of files) writeFileSync(path.join(OUT_DIR, f), text)
    console.log(`wrote public/mock/roadmap-names/ (${[...files].map(([f, t]) => `${f} ${Buffer.byteLength(t)} bytes`).join(", ")})`)
}
