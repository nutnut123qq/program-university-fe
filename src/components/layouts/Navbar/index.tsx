"use client"

import React, { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { useRouter, usePathname, Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Sun, Moon, Globe, Sparkles, BarChart3 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

export const Navbar = () => {
    const { theme, setTheme } = useTheme()
    const router = useRouter()
    const pathname = usePathname()
    const locale = useLocale()
    const t = useTranslations("navbar")
    const mounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    )

    const toggleLocale = () => {
        const next = locale === "vi" ? "en" : "vi"
        router.replace(pathname, { locale: next })
    }

    if (!mounted) {
        return (
            <nav className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
                <div className="container mx-auto flex h-14 items-center">
                    <div className="mr-4 flex">
                        <span className="font-bold">Tedo</span>
                    </div>
                </div>
            </nav>
        )
    }

    return (
        <nav className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
            <div className="container mx-auto flex h-14 items-center justify-between">
                <div className="flex items-center gap-6">
                    <span className="font-bold text-lg text-primary">Tedo</span>
                    <div className="hidden md:flex items-center gap-4 text-sm">
                        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                            {t("home")}
                        </Link>
                        <Link href="/programs" className="text-muted-foreground hover:text-foreground transition-colors">
                            {t("courses")}
                        </Link>
                        <Link href="/analytics" className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors font-medium">
                            <BarChart3 className="w-3.5 h-3.5 text-primary" />
                            <span>Thống kê</span>
                        </Link>
                        <div className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-500 font-medium border border-blue-500/20">
                            <Sparkles className="w-3 h-3 animate-pulse text-amber-400" />
                            <span>SLM Assistant Ready</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={toggleLocale} title="Switch language">
                        <Globe className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        title="Toggle theme"
                    >
                        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </Button>
                    <Button variant="default" size="sm">{t("login")}</Button>
                </div>
            </div>
        </nav>
    )
}
