/**
 * The cohorts a program code records, read for the specs (v2.68 fix r1) by a table of code shapes with string operations —
 * deliberately not the app's regex (src/lib/cohorts.ts), so a spec checks the app against the data, not against itself
 * (AGENTS §12 v2.67 (g)). FPT writes "<PROGRAM>_<cohort segment>", the segment one or more cohorts: "K16B", "K22",
 * "K15D, K16A", "K16D,K17A", "K16DK17A", "K18D19A", "K18D-19A", "K22D_23A", "K17D 18A", "18D19A", "từ K16B" ("from"),
 * "K17C trở đi" ("onward"), with "(FNO)" / "_FNO" programme labels. The segment starts at the first "_" part that begins
 * with K + exactly 2 digits (a third digit = an admission code, TDTU "K7340101L") or with <2 digits><class letter A–D>;
 * each piece (split on "-", ",", " ", "_") is read as repeated [K]<2 digits>[A–D]. A piece of any other shape is pushed
 * to `unknownShapes` (a spec asserts it stays empty), never guessed.
 */
const isDigit = (c: string | undefined) => !!c && c >= "0" && c <= "9"
const isClass = (c: string | undefined) => !!c && "ABCDabcd".includes(c)

export const unknownShapes: string[] = []

export function cohortsOfCode(code: string | null | undefined): string[] {
    if (!code) return []
    let c = code
    for (const suffix of ["(FNO)", " trở đi"]) if (c.endsWith(suffix)) c = c.slice(0, -suffix.length)
    const parts = c.split("_").map((x) => (x.startsWith("từ ") ? x.slice(3) : x))
    const first = parts.findIndex(
        (x) => ((x[0] === "K" || x[0] === "k") && isDigit(x[1]) && isDigit(x[2]) && !isDigit(x[3])) || (isDigit(x[0]) && isDigit(x[1]) && isClass(x[2]))
    )
    if (first < 0) return []
    const found: string[] = []
    for (const piece of parts.slice(first).join("_").split(/[-_, ]+/).filter((x) => x && x.toUpperCase() !== "FNO")) {
        let i = 0
        while (i < piece.length) {
            if (piece[i] === "K" || piece[i] === "k") i++
            if (!isDigit(piece[i]) || !isDigit(piece[i + 1])) {
                unknownShapes.push(`${code} ("${piece}")`)
                break
            }
            found.push(`K${piece.slice(i, i + 2)}`)
            i += 2
            if (isClass(piece[i])) i++
        }
    }
    return [...new Set(found)]
}
