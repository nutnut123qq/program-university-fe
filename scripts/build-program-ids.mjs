#!/usr/bin/env node
/**
 * build-program-ids.mjs — the program ids proxy.ts lets through to the ISR program page (v2.54).
 *
 * Reads (READ-ONLY):
 *   public/mock/programs-by-id/<id>.json
 *
 * Writes:
 *   src/lib/program-ids.json  (sorted, no timestamp: an unchanged mock gives a byte-identical file)
 *
 * Every other `/<locale>/programs/<x>` gets a non-cacheable 404 from the proxy, so a
 * bad path never creates an ISR cache entry. The sitemap lists the same ids. An id is
 * listed only when its file name is a lowercase GUID and the file's own `id` is that
 * name (what `loadProgram` renders); any other file stops the script — a listed id
 * that 404s would be cached again.
 *
 * Rerun after every mock export (like build-search-index.mjs); the e2e fails on drift.
 *
 * No dependencies. Run: node scripts/build-program-ids.mjs [--check]
 *   --check  exit 1 when the committed file differs from the rebuild.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const BY_ID = path.join(ROOT, "public", "mock", "programs-by-id")
const OUT = path.join(ROOT, "src", "lib", "program-ids.json")
const ID_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/

function buildIds() {
    const ids = readdirSync(BY_ID)
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
            const id = ID_FILE.exec(f)?.[1]
            if (!id) throw new Error(`programs-by-id/${f}: not a lowercase GUID file name`)
            const own = JSON.parse(readFileSync(path.join(BY_ID, f), "utf8")).id
            if (own !== id) throw new Error(`programs-by-id/${f}: its id is ${JSON.stringify(own)}`)
            return id
        })
        .sort()
    if (ids.length === 0) throw new Error("no programs in public/mock/programs-by-id")
    return ids
}

const text = JSON.stringify(buildIds(), null, 2) + "\n"
if (process.argv.includes("--check")) {
    let current = ""
    try {
        current = readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") // a CRLF checkout is not drift
    } catch {
        // missing file = stale
    }
    if (current !== text) {
        console.error(`${path.relative(ROOT, OUT)} is stale — run: node scripts/build-program-ids.mjs`)
        process.exit(1)
    }
    console.log(`${path.relative(ROOT, OUT)} matches public/mock (${JSON.parse(text).length} ids)`)
} else {
    writeFileSync(OUT, text)
    console.log(`wrote ${path.relative(ROOT, OUT)} (${JSON.parse(text).length} ids, ${Buffer.byteLength(text)} bytes)`)
}
