"use client"

import React, { useState, useRef, useEffect } from "react"
import { MessageSquare, X, Send, Bot, User, Copy, Check, Loader2, Maximize2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { useChat } from "@/hooks/ChatProvider"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"

export const QUICK_PROMPTS = [
    "Ở FPT có môn Triết học Mác - Lênin không?",
    "Ngành Công nghệ Thông tin học mấy năm và bao nhiêu tín chỉ?",
    "Sơ đồ cây môn học tiên quyết hoạt động như thế nào?",
    "Khối kiến thức cơ sở ngành và chuyên ngành khác nhau thế nào?",
]

export const SlmChatAssistant = () => {
    const { messages, isLoading, sendMessage, clearMessages, isOpen, setIsOpen } = useChat()
    const [input, setInput] = useState("")
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const locale = useLocale()
    const t = useTranslations("chat")

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }, [messages, isOpen])

    const handleSend = async (textToSend?: string) => {
        const query = textToSend || input
        if (!query.trim() || isLoading) return

        if (!textToSend) setInput("")
        await sendMessage(query)
    }

    const copyText = (text: string, id: string) => {
        navigator.clipboard.writeText(text)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    const handleExpand = () => {
        setIsOpen(false)
        router.push(`/${locale}/chat`)
    }

    return (
        <div className="fixed bottom-6 right-6 z-50">
            {/* Toggle Button */}
            {!isOpen && (
                <Button
                    onClick={() => setIsOpen(true)}
                    className="h-11 px-4 rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all gap-2 text-xs font-medium"
                >
                    <MessageSquare className="w-4 h-4" />
                    <span>{t("title") || "AI Hỏi đáp"}</span>
                </Button>
            )}

            {/* Chat Modal Box */}
            {isOpen && (
                <Card className="w-[360px] sm:w-[400px] h-[520px] shadow-xl border flex flex-col animate-in slide-in-from-bottom-5 duration-200">
                    <CardHeader className="p-3.5 border-b flex flex-row items-center justify-between space-y-0">
                        <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4 text-primary" />
                            <CardTitle className="text-sm font-semibold">{t("title") || "AI Hỏi đáp"}</CardTitle>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={clearMessages} className="h-7 w-7 text-muted-foreground hover:text-foreground" title={t("newChat") || "Cuộc trò chuyện mới"}>
                                <Plus className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={handleExpand} className="h-7 w-7 text-muted-foreground hover:text-foreground" title={t("expand") || "Mở rộng"}>
                                <Maximize2 className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-7 w-7">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </CardHeader>

                    {/* Messages Body */}
                    <CardContent className="flex-1 p-3.5 overflow-y-auto space-y-3 text-xs">
                        {messages.map((m) => (
                            <div
                                key={m.id}
                                className={`flex items-start gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                            >
                                <div className={`p-1.5 rounded-full ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                    {m.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                                </div>
                                <div className={`group relative max-w-[85%] p-2.5 rounded-xl ${m.role === "user" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted border rounded-tl-none"}`}>
                                    <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                                    <button
                                        onClick={() => copyText(m.content, m.id)}
                                        className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 p-1 bg-background/80 rounded text-muted-foreground hover:text-foreground transition-opacity"
                                        title="Copy"
                                    >
                                        {copiedId === m.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex items-center gap-2 text-muted-foreground text-[11px] p-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                <span>{t("loading") || "Đang tìm kiếm thông tin..."}</span>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </CardContent>

                    {/* Quick Suggestions */}
                    {messages.length <= 1 && (
                        <div className="p-2 border-t bg-muted/20 overflow-x-auto flex gap-1.5 scrollbar-none">
                            {QUICK_PROMPTS.map((prompt, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSend(prompt)}
                                    className="px-2.5 py-1 rounded-md bg-background border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary shrink-0 transition-colors"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Input Bar */}
                    <div className="p-2.5 border-t flex items-center gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSend()}
                            placeholder={t("placeholder") || "Nhập câu hỏi về ngành hoặc môn học..."}
                            className="flex-1 bg-muted/40 border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <Button
                            size="icon"
                            onClick={() => handleSend()}
                            disabled={isLoading}
                            className="h-7 w-7 rounded-lg shrink-0"
                        >
                            <Send className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </Card>
            )}
        </div>
    )
}
