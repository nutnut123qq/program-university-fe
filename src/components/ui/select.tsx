"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
    value: string
    index?: number
    children?: React.ReactNode
}

interface SelectContextValue {
    value?: string
    onValueChange?: (value: string) => void
    setOpen?: (open: boolean) => void
    listboxId?: string
    highlightedIndex?: number
    setHighlightedIndex?: (index: number) => void
}

const SelectContext = React.createContext<SelectContextValue>({})

interface SelectProps {
    value?: string
    onValueChange?: (value: string) => void
    placeholder?: string
    children: React.ReactNode
    "aria-label"?: string
    "aria-labelledby"?: string
}

const Select = ({
    value,
    onValueChange,
    placeholder,
    children,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
}: SelectProps) => {
    const [open, setOpen] = React.useState(false)
    const [highlightedIndex, setHighlightedIndex] = React.useState(0)
    const triggerRef = React.useRef<HTMLButtonElement>(null)
    const listboxRef = React.useRef<HTMLDivElement>(null)
    const id = React.useId()
    const triggerId = `${id}-trigger`
    const listboxId = `${id}-listbox`

    const { items, labelMap, indexedChildren } = React.useMemo(() => {
        const map = new Map<string, React.ReactNode>()
        const values: string[] = []
        const childArray = React.Children.toArray(children)

        const wrapped = childArray.map((child, itemIndex) => {
            if (
                React.isValidElement<SelectItemProps>(child) &&
                typeof child.props.value === "string"
            ) {
                values.push(child.props.value)
                map.set(child.props.value, child.props.children)
                return React.cloneElement(child, { index: itemIndex })
            }
            return child
        })

        return { items: values, labelMap: map, indexedChildren: wrapped }
    }, [children])

    const selectedIndex = React.useMemo(
        () => (value ? items.indexOf(value) : -1),
        [items, value]
    )

    const selectedLabel = React.useMemo(() => {
        if (!value) return null
        return labelMap.get(value) ?? null
    }, [labelMap, value])

    React.useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (
                listboxRef.current &&
                !listboxRef.current.contains(e.target as Node) &&
                triggerRef.current &&
                !triggerRef.current.contains(e.target as Node)
            ) {
                setOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClick)
        return () => document.removeEventListener("mousedown", handleClick)
    }, [])

    const openListbox = React.useCallback(
        (targetIndex?: number) => {
            const index =
                targetIndex ?? (selectedIndex >= 0 ? selectedIndex : 0)
            setHighlightedIndex(Math.max(0, Math.min(index, items.length - 1)))
            setOpen(true)
        },
        [items.length, selectedIndex]
    )

    const selectItem = React.useCallback(
        (itemValue: string) => {
            onValueChange?.(itemValue)
            setOpen(false)
            triggerRef.current?.focus()
        },
        [onValueChange]
    )

    const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        const maxIndex = items.length - 1
        if (maxIndex < 0) return

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault()
                if (!open) {
                    openListbox()
                } else {
                    setHighlightedIndex((prev) => (prev >= maxIndex ? 0 : prev + 1))
                }
                break
            case "ArrowUp":
                e.preventDefault()
                if (!open) {
                    openListbox(maxIndex)
                } else {
                    setHighlightedIndex((prev) => (prev <= 0 ? maxIndex : prev - 1))
                }
                break
            case "Home":
                if (open) {
                    e.preventDefault()
                    setHighlightedIndex(0)
                }
                break
            case "End":
                if (open) {
                    e.preventDefault()
                    setHighlightedIndex(maxIndex)
                }
                break
            case "Enter":
            case " ":
                e.preventDefault()
                if (open) {
                    const item = items[highlightedIndex]
                    if (item) selectItem(item)
                } else {
                    openListbox()
                }
                break
            case "Escape":
                e.preventDefault()
                setOpen(false)
                break
        }
    }

    const handleListboxKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const maxIndex = items.length - 1
        if (maxIndex < 0) return

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault()
                setHighlightedIndex((prev) => (prev >= maxIndex ? 0 : prev + 1))
                break
            case "ArrowUp":
                e.preventDefault()
                setHighlightedIndex((prev) => (prev <= 0 ? maxIndex : prev - 1))
                break
            case "Home":
                e.preventDefault()
                setHighlightedIndex(0)
                break
            case "End":
                e.preventDefault()
                setHighlightedIndex(maxIndex)
                break
            case "Enter":
            case " ":
                e.preventDefault()
                {
                    const item = items[highlightedIndex]
                    if (item) selectItem(item)
                }
                break
            case "Escape":
                e.preventDefault()
                setOpen(false)
                triggerRef.current?.focus()
                break
        }
    }

    return (
        <SelectContext.Provider
            value={{
                value,
                onValueChange: selectItem,
                setOpen,
                listboxId,
                highlightedIndex,
                setHighlightedIndex,
            }}
        >
            <div className="relative">
                <button
                    ref={triggerRef}
                    id={triggerId}
                    type="button"
                    role="combobox"
                    aria-expanded={open}
                    aria-haspopup="listbox"
                    aria-controls={listboxId}
                    aria-activedescendant={
                        open && highlightedIndex >= 0 && highlightedIndex < items.length
                            ? `${listboxId}-option-${highlightedIndex}`
                            : undefined
                    }
                    aria-label={ariaLabel}
                    aria-labelledby={ariaLabelledBy}
                    onClick={() => openListbox()}
                    onKeyDown={handleTriggerKeyDown}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <span>{selectedLabel || value || placeholder || "Select..."}</span>
                    <ChevronDown className="h-4 w-4 opacity-50" aria-hidden="true" />
                </button>
                {open && (
                    <div
                        ref={listboxRef}
                        id={listboxId}
                        role="listbox"
                        aria-labelledby={triggerId}
                        tabIndex={-1}
                        onKeyDown={handleListboxKeyDown}
                        className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                    >
                        {indexedChildren}
                    </div>
                )}
            </div>
        </SelectContext.Provider>
    )
}

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
    ({ className, value, index, onClick, onMouseEnter, children, ...props }, ref) => {
        const parent = React.useContext(SelectContext)
        const isSelected = parent.value === value
        const isHighlighted = parent.highlightedIndex === index && index !== undefined
        const optionId =
            index !== undefined && parent.listboxId
                ? `${parent.listboxId}-option-${index}`
                : undefined

        return (
            <div
                ref={ref}
                id={optionId}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onMouseEnter={(e) => {
                    if (index !== undefined) {
                        parent.setHighlightedIndex?.(index)
                    }
                    onMouseEnter?.(e)
                }}
                onClick={(e) => {
                    parent.onValueChange?.(value)
                    parent.setOpen?.(false)
                    onClick?.(e as React.MouseEvent<HTMLDivElement>)
                }}
                className={cn(
                    "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                    isHighlighted && "bg-accent text-accent-foreground",
                    className
                )}
                {...props}
            >
                {children}
                {isSelected && (
                    <span className="absolute right-2 flex h-2 w-2 items-center justify-center">
                        <span className="block h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                    </span>
                )}
            </div>
        )
    }
)
SelectItem.displayName = "SelectItem"

export { Select, SelectItem, SelectContext }
export type { SelectProps, SelectItemProps }
