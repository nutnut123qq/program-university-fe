"use client"

import { useTranslations } from "next-intl"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export const HomePage = () => {
    const t = useTranslations("home")

    return (
        <div className="container py-8 space-y-6">
            <section className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">{t("welcome")}</h1>
                <p className="text-muted-foreground">{t("title")}</p>
            </section>

            <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Shadcn UI</CardTitle>
                        <CardDescription>Primitives ready to use</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <p className="text-sm">Button, Card, Input, Badge, Avatar, Dialog, Dropdown, Select, Sheet, Skeleton</p>
                        <Button size="sm">Try it</Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>HeroUI</CardTitle>
                        <CardDescription>Toast, Provider integrated</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm">HeroUIProvider and ToastProvider are active in InnerLayout.</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Theming</CardTitle>
                        <CardDescription>Dark / Light / System</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm">next-themes with CSS variables and oklch color tokens.</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>i18n</CardTitle>
                        <CardDescription>next-intl routing</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm">Switch between vi and en using the globe button in navbar.</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Redux Toolkit</CardTitle>
                        <CardDescription>State management scaffold</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm">Store, hooks, and provider are configured and ready.</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>SWR</CardTitle>
                        <CardDescription>Data fetching</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm">SWR provider configured with default fetcher.</p>
                    </CardContent>
                </Card>
            </section>

            <section className="space-y-2">
                <h2 className="text-xl font-semibold">Skeleton Loading</h2>
                <div className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-[250px]" />
                        <Skeleton className="h-4 w-[200px]" />
                    </div>
                </div>
            </section>
        </div>
    )
}
