"use client"

import { ThemeProvider } from "next-themes"

export function NextThemesProvider({ children, ...props }: React.ComponentProps<typeof ThemeProvider>) {
    return <ThemeProvider {...props}>{children}</ThemeProvider>
}
