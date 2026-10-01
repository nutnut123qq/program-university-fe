import type { Metadata } from "next"
import { Figtree, Geist } from "next/font/google"
import "./globals.css"
import React, { PropsWithChildren } from "react"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const figtree = Figtree({
    subsets: ["latin"],
    variable: "--font-figtree",
})

export const metadata: Metadata = {
    title: "Tedo — Tra cứu Chương trình Đào tạo Đại học",
    description: "Hệ thống tra cứu, chuẩn hóa và so sánh chương trình đào tạo của các trường đại học Việt Nam",
}

const Layout = ({ children }: PropsWithChildren) => {
    return (
        <html suppressHydrationWarning className={cn("font-sans", geist.variable)}>
            <body className={`${figtree.className} antialiased`}>
                {children}
            </body>
        </html>
    )
}

export default Layout
