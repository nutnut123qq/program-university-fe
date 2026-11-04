"use client"

import { useEffect, useState } from "react"
import { API_MODE } from "./api"

/** API mode: a search box's text is sent once typing has paused this long (v2.64). */
export const SEARCH_DEBOUNCE_MS = 300

/**
 * The text a search request uses (the program list, the compare slot search). API mode: the typed text once it has
 * not changed for SEARCH_DEBOUNCE_MS, so a typed word sends one list request instead of one per keystroke (the compare
 * search asks the whole catalog, 1-2 requests of 1,000 rows each time). Mock mode: the typed text itself, as before:
 * the mock search filters an index already loaded, with no request per keystroke.
 */
export function useSearchQuery(text: string): string {
    const [settled, setSettled] = useState(text)
    useEffect(() => {
        if (!API_MODE) return
        const timer = setTimeout(() => setSettled(text), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [text])
    return API_MODE ? settled : text
}
