"use client"

import { useEffect, useEffectEvent, useRef, useSyncExternalStore } from "react"

// Open overlays, innermost last: only the top one answers Escape and Tab
// (the syllabus modal opens on top of the program detail dialog).
const openStack: HTMLElement[] = []
// useModalOpen subscribers (v2.62): told whenever an overlay opens or closes.
const stackListeners = new Set<() => void>()
const stackChanged = () => stackListeners.forEach((listener) => listener())
const subscribeStack = (listener: () => void) => {
    stackListeners.add(listener)
    return () => {
        stackListeners.delete(listener)
    }
}

/**
 * True while any overlay of useModalFocus is open (v2.62, audit V8). Content
 * outside every overlay that stays interactive on its own (the floating chat
 * button) uses it to go inert under the overlay. The server render and the
 * first client render see no overlay.
 */
export function useModalOpen(): boolean {
    return useSyncExternalStore(subscribeStack, () => openStack.length > 0, () => false)
}

const TABBABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, iframe, [contenteditable="true"], [tabindex]'

const tabbables = (box: HTMLElement) =>
    Array.from(box.querySelectorAll<HTMLElement>(TABBABLE)).filter(
        (el) => el.tabIndex >= 0 && el.getClientRects().length > 0
    )

/**
 * Keyboard contract of a modal overlay (v2.49, audit V6). While `open`:
 * focus moves to the returned element (give it role="dialog",
 * aria-modal="true", aria-labelledby and tabIndex={-1}), Tab/Shift+Tab wrap
 * inside it, Escape calls `onClose` — the same callback as the close button.
 * On close, focus goes back to the element that had it before opening.
 */
export function useModalFocus<T extends HTMLElement>(open: boolean, onClose: () => void) {
    const boxRef = useRef<T>(null)
    const close = useEffectEvent(onClose)

    useEffect(() => {
        const box = boxRef.current
        if (!open || !box) return
        const opener = document.activeElement
        openStack.push(box)
        stackChanged()
        box.focus({ preventScroll: true })

        const onKeyDown = (e: KeyboardEvent) => {
            if (openStack[openStack.length - 1] !== box || e.defaultPrevented) return
            if (e.key === "Escape") {
                e.preventDefault()
                // A held key repeats: one close only (the detail dialog closes with history.back()).
                if (!e.repeat) close()
                return
            }
            if (e.key !== "Tab") return
            const items = tabbables(box)
            const active = document.activeElement
            if (items.length === 0) {
                e.preventDefault()
                box.focus()
            } else if (!box.contains(active)) {
                e.preventDefault()
                items[e.shiftKey ? items.length - 1 : 0].focus()
            } else if (e.shiftKey && (active === items[0] || active === box)) {
                e.preventDefault()
                items[items.length - 1].focus()
            } else if (!e.shiftKey && active === items[items.length - 1]) {
                e.preventDefault()
                items[0].focus()
            }
        }
        document.addEventListener("keydown", onKeyDown)
        return () => {
            document.removeEventListener("keydown", onKeyDown)
            openStack.splice(openStack.indexOf(box), 1)
            stackChanged()
            if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
        }
    }, [open])

    return boxRef
}
