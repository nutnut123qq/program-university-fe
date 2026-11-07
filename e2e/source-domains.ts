import { readFileSync } from "fs"
import path from "path"

/**
 * The specs' own rule for "a program link on its own university's website" (v2.69, audit M11), written independently of
 * the app's src/lib/source-label.ts table: a university's domain is the last three labels of its universities.json
 * website host (all are "<name>.edu.vn"), one label more when another university's website registers the same domain
 * with fewer labels (UET under VNU's vnu.edu.vn). A link belongs when its host (http/https, lower case) is that domain or
 * a subdomain of it. Used by v269 (the label per university) and by the older specs whose output is that label (v252, v262).
 */
type Uni = { id: string; code: string; website: string }
const universities: Uni[] = JSON.parse(readFileSync(path.join(__dirname, "..", "public", "mock", "universities.json"), "utf8"))
const hostname = (website: string) => new URL(website).hostname.toLowerCase()

export function hostOf(url: string | null | undefined): string | null {
    try {
        const u = new URL(url ?? "")
        return u.protocol === "http:" || u.protocol === "https:" ? u.hostname.toLowerCase() : null
    } catch {
        return null
    }
}

export function ownDomain(universityId: string): string | null {
    const u = universities.find((x) => x.id === universityId)
    if (!u) return null
    const labels = hostname(u.website).split(".")
    const reg = labels.slice(-3).join(".")
    const shared = universities.some((o) => {
        const h = hostname(o.website).split(".")
        return o.id !== u.id && h.slice(-3).join(".") === reg && h.length < labels.length
    })
    return shared ? labels.slice(-4).join(".") : reg
}

/** True when the link is on the program's own university's domain: the "official source" label applies. */
export function isOwnLink(p: { universityId: string; sourceUrl?: string | null }): boolean {
    const h = hostOf(p.sourceUrl)
    const d = ownDomain(p.universityId)
    return !!h && !!d && (h === d || h.endsWith("." + d))
}
