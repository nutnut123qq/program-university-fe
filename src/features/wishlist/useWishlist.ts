"use client"

import { useCallback, useSyncExternalStore } from "react"

const STORAGE_KEY = "tedo:wishlist"
const CHANGED_EVENT = "tedo:wishlist-changed"

const EMPTY: readonly string[] = Object.freeze([])

// Module-level store shared by every useWishlist() consumer. `snapshot` must
// keep a stable reference between mutations — useSyncExternalStore re-reads
// it on every render and would loop forever if we returned a fresh array.
let snapshot: readonly string[] = EMPTY
let initialized = false
const listeners = new Set<() => void>()
let windowListenersAttached = false

function sanitize(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    const out: string[] = []
    for (const item of value) {
        if (typeof item === "string" && item.length > 0 && !out.includes(item)) {
            out.push(item)
        }
    }
    return out
}

function readIds(): readonly string[] {
    if (typeof window === "undefined") return EMPTY
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === null) return EMPTY
        let parsed: unknown
        try {
            parsed = JSON.parse(raw)
        } catch {
            // Corrupt JSON — reset so the next write starts clean.
            window.localStorage.removeItem(STORAGE_KEY)
            return EMPTY
        }
        const ids = sanitize(parsed)
        if (!Array.isArray(parsed) || ids.length !== parsed.length) {
            // Non-array payload or dropped entries (dupes/non-strings) —
            // normalize the stored value back to a clean string[].
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
            } catch {
                // Storage unavailable — the in-memory reset is enough.
            }
        }
        return ids
    } catch {
        // localStorage itself unavailable (private mode, denied access).
        return EMPTY
    }
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i])
}

function emit() {
    listeners.forEach((l) => l())
}

function apply(next: readonly string[]) {
    if (sameIds(next, snapshot)) return
    snapshot = next
    emit()
}

// Lazy read: storage is only touched once a real client-side consumer shows up.
function ensureInit() {
    if (initialized || typeof window === "undefined") return
    initialized = true
    snapshot = readIds()
}

function handleChangedEvent(event: Event) {
    const detail = (event as CustomEvent<unknown>).detail
    // Writes carry the new ids in `detail` so a failed localStorage write
    // doesn't revert the in-memory state; foreign events fall back to a read.
    apply(Array.isArray(detail) ? sanitize(detail) : readIds())
}

// Cross-tab sync: `storage` only fires in *other* tabs/windows.
function handleStorageEvent(event: StorageEvent) {
    if (event.key !== null && event.key !== STORAGE_KEY) return
    apply(readIds())
}

function attachWindowListeners() {
    if (windowListenersAttached || typeof window === "undefined") return
    windowListenersAttached = true
    window.addEventListener(CHANGED_EVENT, handleChangedEvent)
    window.addEventListener("storage", handleStorageEvent)
}

function subscribe(listener: () => void) {
    ensureInit()
    attachWindowListeners()
    listeners.add(listener)
    // Re-sync in case storage moved while nobody was subscribed.
    apply(readIds())
    return () => {
        listeners.delete(listener)
    }
}

function getSnapshot(): readonly string[] {
    ensureInit()
    return snapshot
}

function getServerSnapshot(): readonly string[] {
    return EMPTY
}

function persist(next: readonly string[]) {
    ensureInit()
    apply(next)
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
        // Quota/private-mode write failure — keep the in-memory state.
    }
    // Same-tab hook consumers already re-rendered via apply(); the event keeps
    // any non-hook listeners informed and mirrors the cross-tab contract.
    window.dispatchEvent(new CustomEvent<string[]>(CHANGED_EVENT, { detail: [...next] }))
}

export interface UseWishlist {
    /** false during SSR and the hydration pass — render neutral UI until true. */
    mounted: boolean
    ids: readonly string[]
    has: (id: string) => boolean
    toggle: (id: string) => void
    remove: (id: string) => void
    clear: () => void
}

export function useWishlist(): UseWishlist {
    // Same mounted gate as Navbar: true only after client hydration.
    const mounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    )
    const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

    const has = useCallback((id: string) => ids.includes(id), [ids])

    const toggle = useCallback((id: string) => {
        if (!id) return
        ensureInit()
        persist(snapshot.includes(id) ? snapshot.filter((x) => x !== id) : [...snapshot, id])
    }, [])

    const remove = useCallback((id: string) => {
        ensureInit()
        persist(snapshot.filter((x) => x !== id))
    }, [])

    const clear = useCallback(() => {
        persist(EMPTY)
    }, [])

    return { mounted, ids, has, toggle, remove, clear }
}
