"use client"

import React from "react"
import { useTheme } from "next-themes"
import { useRouter, usePathname, Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Sun, Moon, Monitor, Globe } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

export const Navbar = () => {
    const { theme, setTheme } = useTheme()
    const router = useRouter()
    const pathname = usePathname()
    const locale = useLocale()
    const t = useTranslations("navbar")
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    const toggleLocale = () => {
        const next = locale === "vi" ? "en" : "vi"
        router.replace(pathname, { locale: next })
    }

    if (!mounted) {
        return (
            <nav className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
                <div className="container mx-auto flex h-14 items-center">
                    <div className="mr-4 flex">
                        <span className="font-bold">Fe</span>
                    </div>
                </div>
            </nav>
        )
    }

    return (
        <nav className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
            <div className="container mx-auto flex h-14 items-center justify-between">
                <div className="flex items-center gap-6">
                    <span className="font-bold text-lg">Fe</span>
                    <div className="hidden md:flex items-center gap-4 text-sm">
                        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                            {t("home")}
                        </Link>
                        <Link href="/programs" className="text-muted-foreground hover:text-foreground transition-colors">
                            {t("courses")}
                        </Link>
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
