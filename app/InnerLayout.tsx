"use client"

import React, { PropsWithChildren, Suspense } from "react"
import { NextThemesProvider, SwrProvider } from "@/components/providers"
import { ReduxProvider } from "@/redux"
import { UseEffects } from "@/hooks"
import { Navbar } from "@/components/layouts"
import { AIChatWidget, SlmChatModal } from "@/components/common"

import { SlmChatAssistant } from "@/features/programs/components/SlmChatAssistant"
import { ChatProvider } from "@/hooks/ChatProvider"

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
        </Suspense>
    )
}
