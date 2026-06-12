"use client"

import { SWRConfig } from "swr"
import { ReactNode } from "react"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api"

export function SwrProvider({ children }: { children: ReactNode }) {
    return (
        <SWRConfig
            value={{
                fetcher: (url: string) =>
                    fetch(`${API_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`).then((res) => {
                        if (!res.ok) throw new Error(`API error: ${res.status}`)
                        return res.json()
                    }),
            }}
        >
            {children}
        </SWRConfig>
    )
}
