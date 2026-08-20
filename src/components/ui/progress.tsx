"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
    value?: number
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
    ({ className, value = 0, ...props }, ref) => (
        <div
            ref={ref}
            role="progressbar"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={100}
            className={cn(
                "relative h-2 w-full overflow-hidden rounded-full bg-muted/60",
                className
            )}
            {...props}
        >
            <div
                className="h-full w-full flex-1 bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 ease-in-out"
                style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
            />
        </div>
    )
)
Progress.displayName = "Progress"

export { Progress }
