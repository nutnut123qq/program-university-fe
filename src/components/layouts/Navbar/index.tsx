"use client"

import React, { useState, useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { useRouter, usePathname, Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Sun, Moon, Globe, BarChart3, GitCompare, GitFork, BookOpen, Menu, X } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

// Single source of truth — rendered in the desktop bar AND the mobile dropdown.
const NAV_LINKS = [
    { href: "/", key: "courses", Icon: null },
    { href: "/roadmap", key: "roadmap", Icon: GitFork },
    { href: "/materials", key: "materials", Icon: BookOpen },
    { href: "/analytics", key: "analytics", Icon: BarChart3 },
    { href: "/compare", key: "compare", Icon: GitCompare },
] as const

export const Navbar = () => {
    const { theme, setTheme } = useTheme()
    const router = useRouter()
    const pathname = usePathname()
    const locale = useLocale()
    const t = useTranslations("navbar")
    // The mobile menu is "open" only for the path it was opened on — any
    // route change (link click or programmatic navigation while it is open)
    // closes it without an effect.
    const [menuOpenPath, setMenuOpenPath] = useState<string | null>(null)
    const menuOpen = menuOpenPath === pathname
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
                <div className="container mx-auto flex h-14 items-center px-4 sm:px-6 lg:px-8">
                    <div className="mr-4 flex">
                        <span className="font-bold">Tedo</span>
                    </div>
                </div>
            </nav>
        )
    }

    return (
        <nav className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
            <div className="container mx-auto flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-6">
                    <Link href="/" className="font-bold text-lg text-primary tracking-tight">
                        Tedo
                    </Link>
                    <div className="hidden md:flex items-center gap-5 text-sm">
                        {NAV_LINKS.map(({ href, key, Icon }) => (
                            <Link
                                key={key}
                                href={href}
                                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
                                <span>{t(key)}</span>
                            </Link>
                        ))}
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
                    <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden"
                        onClick={() => setMenuOpenPath((prev) => (prev === pathname ? null : pathname))}
                        aria-label={menuOpen ? t("close") : t("menu")}
                        aria-expanded={menuOpen}
                        aria-controls="mobile-nav-menu"
                    >
                        {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                    </Button>
                </div>
            </div>
            {/* Mobile dropdown nav (<md) — same links as the desktop bar */}
            {menuOpen && (
                <div
                    id="mobile-nav-menu"
                    className="md:hidden absolute inset-x-0 top-full border-b bg-background shadow-lg"
                >
                    <nav
                        aria-label={t("menu")}
                        className="container mx-auto flex flex-col gap-1 px-4 py-3 sm:px-6"
                    >
                        {NAV_LINKS.map(({ href, key, Icon }) => (
                            <Link
                                key={key}
                                href={href}
                                onClick={() => setMenuOpenPath(null)}
                                className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            >
                                {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
                                <span>{t(key)}</span>
                            </Link>
                        ))}
                    </nav>
                </div>
            )}
        </nav>
    )
}
