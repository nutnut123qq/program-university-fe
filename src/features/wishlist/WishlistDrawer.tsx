"use client"

import { useState } from "react"
import useSWR from "swr"
import { GitCompare, Heart, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchProgramById } from "@/features/programs/api"
import { useWishlist } from "./useWishlist"

export interface WishlistDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const MAX_COMPARE = 2

export function WishlistDrawer({ open, onOpenChange }: WishlistDrawerProps) {
    const t = useTranslations("wishlist")
    const router = useRouter()
    const { mounted, ids, remove, clear } = useWishlist()
    const [selected, setSelected] = useState<string[]>([])

    // Batch-fetch every saved program. Keyed on the joined id list so any
    // mutation (toggle/remove/clear, this tab or another) refetches exactly
    // the current set; an empty list produces a falsy key and skips the fetch.
    const { data: fetched, error, isLoading } = useSWR(
        mounted && open && ids.length > 0 ? ["wishlist-programs", ids.join(",")] : null,
        () => Promise.all(ids.map((id) => fetchProgramById(id)))
    )

    // Ids that disappeared from the wishlist drop out of the compare
    // selection automatically — `selected` may keep stale entries, this
    // derived list never does.
    const selectedIds = selected.filter((id) => ids.includes(id))

    const toggleSelect = (id: string) => {
        setSelected((prev) =>
            prev.includes(id)
                ? prev.filter((x) => x !== id)
                : prev.length < MAX_COMPARE
                  ? [...prev, id]
                  : prev
        )
    }

    const handleCompare = () => {
        if (selectedIds.length !== MAX_COMPARE) return
        onOpenChange(false)
        router.push(`/compare?a=${encodeURIComponent(selectedIds[0])}&b=${encodeURIComponent(selectedIds[1])}`)
    }

    const hasItems = mounted && ids.length > 0
    // Skeleton only before the first payload for the current key lands; on
    // error we still render the rows (id fallback) so entries stay removable.
    const showSkeleton = !mounted || (hasItems && fetched === undefined && !error && isLoading)

    return (
        <Sheet open={open} onOpenChange={onOpenChange} side="right" className="w-[85%] sm:max-w-sm">
            <SheetContent>
                {/* Header: title + count + clear-all. pr-8 keeps clear of the
                    built-in close X in the top-right corner of the sheet. */}
                <div className="flex items-center justify-between gap-2 pr-8">
                    <div className="flex min-w-0 items-center gap-2">
                        <Heart className="h-5 w-5 shrink-0 text-rose-500" fill="currentColor" aria-hidden />
                        <h2 className="truncate text-base font-bold">{t("wishlistTitle")}</h2>
                        {hasItems && (
                            <Badge variant="secondary" className="shrink-0">
                                {ids.length}
                            </Badge>
                        )}
                    </div>
                    {hasItems && (
                        <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={clear}>
                            {t("clearAll")}
                        </Button>
                    )}
                </div>

                {/* Body */}
                {showSkeleton ? (
                    <div className="mt-4 flex-1 space-y-2 overflow-hidden">
                        {Array.from({ length: Math.max(ids.length, 3) }).map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full" />
                        ))}
                    </div>
                ) : !hasItems ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                        <Heart className="h-8 w-8 text-muted-foreground/50" aria-hidden />
                        <p className="max-w-[220px] text-sm text-muted-foreground">{t("wishlistEmpty")}</p>
                    </div>
                ) : (
                    <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
                        {ids.map((id, i) => {
                            const program = fetched?.[i]
                            const isSelected = selectedIds.includes(id)
                            const checkboxDisabled = !isSelected && (selectedIds.length >= MAX_COMPARE || program === null)
                            return (
                                <li key={id} className="flex items-start gap-2 rounded-lg border border-border p-2.5">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        disabled={checkboxDisabled}
                                        onChange={() => toggleSelect(id)}
                                        aria-label={program?.name ?? id}
                                        className="mt-1 h-4 w-4 shrink-0 accent-primary disabled:opacity-40"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="break-words text-sm font-semibold leading-snug">
                                            {program?.name ?? id}
                                        </p>
                                        <p className="break-words text-xs text-muted-foreground">
                                            {program?.universityName ?? ""}
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                        aria-label={t("wishlistRemove")}
                                        onClick={() => remove(id)}
                                    >
                                        <Trash2 className="h-4 w-4" aria-hidden />
                                    </Button>
                                </li>
                            )
                        })}
                    </ul>
                )}

                {/* Footer: compare needs exactly 2 selections. */}
                {hasItems && !showSkeleton && (
                    <div className="shrink-0 space-y-2 border-t border-border pt-3">
                        <p className="text-xs text-muted-foreground">
                            {t("compareHint")} ({selectedIds.length}/{MAX_COMPARE})
                        </p>
                        <Button className="w-full" disabled={selectedIds.length !== MAX_COMPARE} onClick={handleCompare}>
                            <GitCompare className="h-4 w-4" aria-hidden />
                            {t("compare")}
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}
