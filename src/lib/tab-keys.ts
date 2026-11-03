/**
 * APG tabs pattern, automatic activation (v2.49 detail dialog, v2.62 syllabus modal): the index of the tab a key
 * moves focus and selection to — ArrowRight/ArrowLeft wrap at the ends, Home/End jump — or -1 for any other key.
 * The caller selects that tab and focuses it (roving tabindex: only the selected tab is a Tab stop).
 */
export function tabKeyTarget(key: string, index: number, count: number): number {
    const last = count - 1
    if (key === "ArrowRight") return index === last ? 0 : index + 1
    if (key === "ArrowLeft") return index === 0 ? last : index - 1
    if (key === "Home") return 0
    if (key === "End") return last
    return -1
}
