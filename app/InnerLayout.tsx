"use client"

import React, { PropsWithChildren } from "react"
import { NextThemesProvider, SwrProvider } from "@/components/providers"
import { ReduxProvider } from "@/redux"
import { UseEffects } from "@/hooks"
import { Navbar } from "@/components/layouts"

import { SlmChatAssistant } from "@/features/programs/components/SlmChatAssistant"
import { ChatProvider } from "@/hooks/ChatProvider"

export const InnerLayout = ({ children }: PropsWithChildren) => {
    // No Suspense around the whole tree (v2.52): a page's notFound() must stay in
    // the shell to answer HTTP 404, and the page HTML is then in the shell too.
    // A useSearchParams user brings its own boundary (ProgramComparison).
    return (
        <NextThemesProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={true}
            storageKey="fe-theme"
        >
            <SwrProvider>
                <ReduxProvider>
                    <ChatProvider>
                        <UseEffects />
                        <Navbar />
                        <main className="min-h-screen">
                            {children}
                        </main>
                        <SlmChatAssistant />
                    </ChatProvider>
                </ReduxProvider>
            </SwrProvider>
        </NextThemesProvider>
    )
}
