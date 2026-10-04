"use client"

import { Heart } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useWishlist } from "./useWishlist"

export interface WishlistButtonProps {
    programId: string
    size?: "sm" | "default"
}

export function WishlistButton({ programId, size = "default" }: WishlistButtonProps) {
    const t = useTranslations("wishlist")
    const { mounted, has, toggle } = useWishlist()
    const saved = mounted && has(programId)
    const isSm = size === "sm"

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="wishlist-toggle"
            data-saved={saved || undefined}
            aria-label={saved ? t("wishlistRemove") : t("wishlistAdd")}
            aria-pressed={saved}
            disabled={!mounted}
            onClick={(e) => {
                // The button usually sits inside a clickable card/link — never
                // let the toggle bubble into a navigation.
                e.preventDefault()
                e.stopPropagation()
                toggle(programId)
            }}
            className={cn(
                "shrink-0",
                isSm && "h-8 w-8",
                saved ? "text-rose-500 hover:text-rose-600" : "text-muted-foreground"
            )}
        >
            <Heart
                aria-hidden
                className={isSm ? "h-4 w-4" : "h-5 w-5"}
                fill={saved ? "currentColor" : "none"}
            />
        </Button>
    )
}
