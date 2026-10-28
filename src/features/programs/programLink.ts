import { useSyncExternalStore } from "react"
import { isProgramId } from "./programId"

export { isProgramId }

/**
 * `?program=<id>` on the list page opens that program's detail dialog
 * (v2.48, audit V5). The URL is the source of truth, so a detail can be
 * shared and browser Back closes it. Everything about the param lives here —
 * V9's program route can later take over `programLinkUrl`.
 */
const PROGRAM_PARAM = "program"

const CHANGED_EVENT = "tedo:program-link-changed"

const readParam = () => new URLSearchParams(window.location.search).get(PROGRAM_PARAM)

function subscribe(onChange: () => void) {
    window.addEventListener("popstate", onChange)
    window.addEventListener(CHANGED_EVENT, onChange)
    return () => {
        window.removeEventListener("popstate", onChange)
        window.removeEventListener(CHANGED_EVENT, onChange)
    }
}

/** Raw `?program=` value of the current URL; null when absent and on the server. */
export function useProgramParam(): string | null {
    return useSyncExternalStore(subscribe, readParam, () => null)
}

/** Current path + query + hash with `?program=` set to `id`, or removed for null. */
function urlWith(id: string | null) {
    const url = new URL(window.location.href)
    if (id === null) url.searchParams.delete(PROGRAM_PARAM)
    else url.searchParams.set(PROGRAM_PARAM, id)
    return url.pathname + url.search + url.hash
}

/**
 * Push `?program=<id>` or replace the entry without it. Null state on
 * purpose: Next 16 patches the history methods and then keeps its router's
 * URL in sync (state with `__NA` would skip that sync).
 */
export function setProgramParam(id: string | null, mode: "push" | "replace") {
    if (mode === "push") window.history.pushState(null, "", urlWith(id))
    else window.history.replaceState(null, "", urlWith(id))
    window.dispatchEvent(new Event(CHANGED_EVENT))
}

/**
 * Page loaded on a program link: rewrite this entry as the plain list and
 * push the link back on top, so browser Back closes the dialog instead of
 * leaving the site. Returns whether it did. Next's own history state is
 * reused for both entries — its router already holds the link as its URL,
 * and Back to the plain entry stays a Next-handled traversal.
 */
export function stackProgramLanding(): boolean {
    const id = readParam()
    if (id === null || !isProgramId(id)) return false
    const link = window.location.pathname + window.location.search + window.location.hash
    const state = window.history.state
    window.history.replaceState(state, "", urlWith(null))
    window.history.pushState(state, "", link)
    return true
}

/** Shareable link to a program's detail on the current list page. */
export function programLinkUrl(id: string) {
    const url = new URL(window.location.pathname, window.location.origin)
    url.searchParams.set(PROGRAM_PARAM, id)
    return url.toString()
}
