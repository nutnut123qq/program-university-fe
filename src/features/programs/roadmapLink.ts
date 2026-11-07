import { useSyncExternalStore } from "react"

/**
 * `?uni=<code>` on /roadmap (v2.63, audit V9): the picked university, so a reload or a shared link opens it. The
 * programLink.ts pattern (v2.48): the URL is read through useSyncExternalStore — its server snapshot is undefined ("not
 * read yet", v2.69: the static HTML and the hydration render, where the page requests nothing and keeps its university
 * part invisible), so no useSearchParams bails the page out of its static HTML — and written with the native
 * history methods and a null state (Next 16 keeps its router's URL in sync). The value is raw: the page uses it only
 * when its picker offers that code, and builds a fetch path only for a code of ROADMAP_UNIVERSITIES.
 */
const UNI_PARAM = "uni"

const CHANGED_EVENT = "tedo:roadmap-uni-changed"

/**
 * The URL's `?uni=`, or undefined ("not read yet") while `location` does not name the roadmap page (v2.69 fix r1): a client
 * navigation into /roadmap renders before Next writes the new URL (HistoryUpdater's insertion effect), so the location
 * still names the page left — reading null there decided the FPT default and fetched its files before the real URL.
 */
const readParam = () =>
    /\/roadmap\/?$/.test(window.location.pathname) ? new URLSearchParams(window.location.search).get(UNI_PARAM) : undefined

/**
 * Every URL change of this document (v2.63 fix r1). Next writes the URL of its own client navigations (a navbar link to
 * /roadmap from a picked `?uni=`) with its own history state — no popstate, no event of ours — and keeps the page
 * instance, so the Navigation API's `currententrychange` (fired for every pushState/replaceState/traversal, Next's
 * included) is heard too. Next writes inside a React insertion effect, where scheduling an update is an error, so that
 * change is read in a microtask. Without `window.navigation` (a browser lacking the Navigation API) only popstate and our
 * event are heard: after such a link the page keeps the university it showed until its next render reads the URL.
 */
function subscribe(onChange: () => void) {
    let active = true
    const onEntryChange = () =>
        queueMicrotask(() => {
            if (active) onChange()
        })
    const navigation = (window as unknown as { navigation?: EventTarget }).navigation
    window.addEventListener("popstate", onChange)
    window.addEventListener(CHANGED_EVENT, onChange)
    navigation?.addEventListener("currententrychange", onEntryChange)
    return () => {
        active = false
        window.removeEventListener("popstate", onChange)
        window.removeEventListener(CHANGED_EVENT, onChange)
        navigation?.removeEventListener("currententrychange", onEntryChange)
    }
}

/** Raw `?uni=` value of the current URL; null when absent; undefined on the server, in the hydration render and before the URL names /roadmap. */
export function useRoadmapUniParam(): string | null | undefined {
    return useSyncExternalStore(subscribe, readParam, () => undefined)
}

/**
 * A picker change: push the URL with `?uni=<code>` (null = without it, the FPT default), keeping the rest of the URL.
 * One history entry per change, so Back returns to the university picked before.
 */
export function pushRoadmapUniParam(code: string | null) {
    const url = new URL(window.location.href)
    if (code === null) url.searchParams.delete(UNI_PARAM)
    else url.searchParams.set(UNI_PARAM, code)
    window.history.pushState(null, "", url.pathname + url.search + url.hash)
    window.dispatchEvent(new Event(CHANGED_EVENT))
}
