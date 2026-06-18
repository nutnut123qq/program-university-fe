"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

interface SelectProps {
    value?: string
    onValueChange?: (value: string) => void
    placeholder?: string
    children: React.ReactNode
}

const Select = ({ value, onValueChange, placeholder, children }: SelectProps) => {
    const [open, setOpen] = React.useState(false)
    const ref = React.useRef<HTMLDivElement>(null)

    const selectedLabel = React.useMemo(() => {
        if (value === undefined || value === null || value === "") return null
        let label: React.ReactNode = null
        React.Children.forEach(children, (child) => {
            if (React.isValidElement<{ value?: string; children?: React.ReactNode }>(child) && child.props.value === value) {
                label = child.props.children
            }
        })
        return label
    }, [children, value])

    React.useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClick)
        return () => document.removeEventListener("mousedown", handleClick)
    }, [])

    return (
        <SelectContext.Provider value={{ onValueChange, setOpen }}>
            <div ref={ref} className="relative">
                <button
                    type="button"
                    onClick={() => setOpen(!open)}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <span>{selectedLabel || value || placeholder || "Select..."}</span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </button>
                {open && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                        {children}
                    </div>
                )}
            </div>
        </SelectContext.Provider>
    )
}

const SelectItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { value: string }>(
    ({ className, value, onClick, ...props }, ref) => {
        const parent = React.useContext(SelectContext)
        return (
            <div
                ref={ref}
                onClick={(e) => {
                    parent?.onValueChange?.(value)
                    parent?.setOpen?.(false)
                    onClick?.(e as any)
                }}
                className={cn(
                    "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                    className
                )}
                {...props}
            />
        )
    }
)
SelectItem.displayName = "SelectItem"

interface SelectContextValue {
    onValueChange?: (value: string) => void
    setOpen?: (open: boolean) => void
}

const SelectContext = React.createContext<SelectContextValue>({})

export { Select, SelectItem, SelectContext }
