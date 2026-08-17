"use client"

import React, { useState, useRef, useEffect } from "react"
import { ArrowLeft, Send, Bot, User, Copy, Check, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useChat } from "@/hooks/ChatProvider"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { QUICK_PROMPTS } from "@/features/programs/components/SlmChatAssistant"

export const ChatPage = () => {
    const { messages, isLoading, sendMessage, clearMessages } = useChat()
    const [input, setInput] = useState("")
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const t = useTranslations("chat")

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }, [messages])

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

    const formatDate = (dateString: string) => {
        if (!dateString) return "";
        try {
            return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return "";
        }
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] max-w-3xl mx-auto bg-background md:border-x md:shadow-sm">
            {/* Header */}
            <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <span className="font-semibold text-lg flex items-center gap-2">
                        <Bot className="w-5 h-5 text-primary" />
                        {t("title") || "AI Hỏi đáp"}
                    </span>
                </div>
                <Button variant="outline" size="sm" onClick={clearMessages} className="gap-2 h-8">
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">{t("newChat") || "Cuộc trò chuyện mới"}</span>
                </Button>
            </header>

            {/* Messages Area */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                {messages.map((m) => (
                    <div
                        key={m.id}
                        className={`flex items-start gap-3 sm:gap-4 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                        <div className={`p-2 shrink-0 rounded-full ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            {m.role === "user" ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                        </div>
                        <div className={`group relative max-w-[85%] sm:max-w-[75%] p-3.5 sm:p-4 rounded-2xl ${m.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted border rounded-tl-sm"}`}>
                            <p className="leading-relaxed whitespace-pre-wrap text-sm sm:text-base">{m.content}</p>
                            
                            <div className={`absolute -bottom-5 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-muted-foreground ${m.role === "user" ? "right-1" : "left-1"}`}>
                                <span>{formatDate(m.timestamp)}</span>
                            </div>

                            <button
                                onClick={() => copyText(m.content, m.id)}
                                className={`opacity-0 group-hover:opacity-100 absolute top-2 ${m.role === "user" ? "left-2 -translate-x-full" : "right-2 translate-x-full"} p-1.5 bg-background border shadow-sm rounded-md text-muted-foreground hover:text-foreground transition-all z-10 mx-2`}
                                title="Copy"
                            >
                                {copiedId === m.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex items-center gap-3">
                        <div className="p-2 shrink-0 rounded-full bg-muted">
                            <Bot className="w-5 h-5" />
                        </div>
                        <div className="p-4 rounded-2xl bg-muted border rounded-tl-sm flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            <span className="text-sm">{t("loading") || "Đang tìm kiếm thông tin..."}</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} className="h-4" />
            </main>

            {/* Input Area */}
            <div className="sticky bottom-0 bg-background border-t p-3 sm:p-4">
                <div className="max-w-3xl mx-auto flex flex-col gap-3">
                    {messages.length <= 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                            {QUICK_PROMPTS.map((prompt, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSend(prompt)}
                                    className="px-3 py-1.5 rounded-full bg-muted/50 border text-xs sm:text-sm text-muted-foreground hover:text-foreground hover:bg-muted whitespace-nowrap transition-colors"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="relative flex items-end gap-2 bg-muted/30 border rounded-2xl p-2 focus-within:ring-1 focus-within:ring-primary focus-within:bg-background transition-colors">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder={t("placeholder") || "Nhập câu hỏi về ngành hoặc môn học..."}
                            className="flex-1 bg-transparent resize-none border-0 outline-none min-h-[44px] max-h-32 py-2.5 px-3 text-sm sm:text-base scrollbar-none"
                            rows={1}
                        />
                        <Button
                            size="icon"
                            onClick={() => handleSend()}
                            disabled={isLoading || !input.trim()}
                            className="h-10 w-10 shrink-0 rounded-xl mb-0.5 mr-0.5"
                        >
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>
                    <div className="text-center text-[10px] text-muted-foreground">
                        AI có thể mắc lỗi. Vui lòng kiểm tra lại các thông tin quan trọng.
                    </div>
                </div>
            </div>
        </div>
    )
}
