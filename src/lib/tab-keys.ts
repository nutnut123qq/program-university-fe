/** The modifier part of a key event that the keyboard handlers below read. */
type KeyLike = { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean }

/**
 * Alt, Ctrl or Meta held (v2.69, Someday v2.62): the key belongs to the browser (Alt/Cmd+← Back, Ctrl+Home, Cmd+↑ …),
 * so a widget key handler returns before `preventDefault`. Shift is not a browser shortcut on a tab or a button: Shift
 * with an arrow/Home/End acts as the plain key, as before.
 */
export const browserShortcut = (e: KeyLike) => e.altKey || e.ctrlKey || e.metaKey

/**
 * APG tabs pattern, automatic activation (v2.49 detail dialog, v2.62 syllabus modal): the index of the tab a key
 * moves focus and selection to — ArrowRight/ArrowLeft wrap at the ends, Home/End jump — or -1 for any other key and
 * for a browser shortcut. The caller selects that tab and focuses it (roving tabindex: only the selected tab is a Tab stop).
 */
export function tabKeyTarget(e: KeyLike, index: number, count: number): number {
    if (browserShortcut(e)) return -1
    const last = count - 1
    if (e.key === "ArrowRight") return index === last ? 0 : index + 1
    if (e.key === "ArrowLeft") return index === 0 ? last : index - 1
    if (e.key === "Home") return 0
    if (e.key === "End") return last
    return -1
}
