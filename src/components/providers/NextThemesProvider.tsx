"use client"

import { ThemeProvider } from "next-themes"
import { type ReactNode } from "react"

export function NextThemesProvider({ children, ...props }: React.ComponentProps<typeof ThemeProvider>) {
    return <ThemeProvider {...props}>{children}</ThemeProvider>
}
