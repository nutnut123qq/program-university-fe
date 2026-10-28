"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"
import { useModalFocus } from "@/hooks/useModalFocus"

interface SheetProps {
    children: React.ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
    side?: "left" | "right" | "top" | "bottom"
    /** Extra classes for the panel — e.g. widen the default w-3/4 on mobile. */
    className?: string
    /** Id of the sheet's visible title — the dialog's accessible name. */
    "aria-labelledby"?: string
}

const Sheet = ({ children, open, onOpenChange, side = "right", className, "aria-labelledby": labelledBy }: SheetProps) => {
    const panelRef = useModalFocus<HTMLDivElement>(!!open, () => onOpenChange?.(false))
    if (!open) return null

    const sideClasses = {
        left: "inset-y-0 left-0 h-full w-3/4 sm:max-w-sm",
        right: "inset-y-0 right-0 h-full w-3/4 sm:max-w-sm",
        top: "inset-x-0 top-0 h-auto w-full",
        bottom: "inset-x-0 bottom-0 h-auto w-full",
    }

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange?.(false)} />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                tabIndex={-1}
                className={cn("fixed z-50 border bg-background p-6 shadow-lg transition ease-in-out outline-none", sideClasses[side], className)}
            >
                {children}
                <button
                    onClick={() => onOpenChange?.(false)}
                    className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </button>
            </div>
        </div>
    )
}

const SheetContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn("flex h-full flex-col", className)} {...props} />
    )
)
SheetContent.displayName = "SheetContent"

export { Sheet, SheetContent }
