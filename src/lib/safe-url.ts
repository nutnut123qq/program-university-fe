/**
 * The only gate for an `href` taken from the data (v2.58): the string itself when the WHATWG URL parser — the one
 * the browser uses for `href` — reads it as an absolute http(s) URL, else null. javascript:, data:, other schemes,
 * "javascript://host/…" (it has a hostname) and relative/unparsable strings never become a link; the original
 * string is kept so the rendered href is exactly the published one.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
    if (!url) return null
    try {
        const { protocol } = new URL(url)
        return protocol === "http:" || protocol === "https:" ? url : null
    } catch {
        return null
    }
}

/** The host of a safe http(s) URL without a leading "www.", for link text; null when `safeHttpUrl` rejects it. */
export function urlHost(url: string | null | undefined): string | null {
    const safe = safeHttpUrl(url)
    return safe ? new URL(safe).hostname.replace(/^www\./, "") : null
}
