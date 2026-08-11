"use client"

import React, { PropsWithChildren, Suspense } from "react"
import { NextThemesProvider, SwrProvider } from "@/components/providers"
import { ReduxProvider } from "@/redux"
import { UseEffects } from "@/hooks"
import { Navbar } from "@/components/layouts"
import { AIChatWidget } from "@/components/common"

export const InnerLayout = ({ children }: PropsWithChildren) => {
    return (
        <Suspense>
            <NextThemesProvider
                attribute="class"
                defaultTheme="dark"
                enableSystem={true}
                storageKey="fe-theme"
            >
                <SwrProvider>
                    <ReduxProvider>
                        <UseEffects />
                        <Navbar />
                        <main className="min-h-screen">
                            {children}
                        </main>
                        <AIChatWidget />
                    </ReduxProvider>
                </SwrProvider>
            </NextThemesProvider>
        </Suspense>
    )
}
