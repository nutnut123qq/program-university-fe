"use client"

import React, { useState, useRef, useEffect, useMemo } from "react"
import {
    ArrowLeft,
    Send,
    Bot,
    User,
    Copy,
    Check,
    Loader2,
    Plus,
    PanelLeft,
    PanelLeftClose,
    Trash2,
    MessageSquare,
    Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useChat, ChatSession } from "@/hooks/ChatProvider"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { QUICK_PROMPTS } from "@/features/programs/components/SlmChatAssistant"

export const ChatPage = () => {
    const {
        sessions,
        currentSessionId,
        currentSession,
        messages,
        isLoading,
        sendMessage,
        createSession,
        switchSession,
        deleteSession,
    } = useChat()

    const [input, setInput] = useState("")
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const t = useTranslations("chat")

    // Auto scroll to bottom when messages update
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }, [messages, isLoading])

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
        if (!dateString) return ""
        try {
            return new Date(dateString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        } catch {
            return ""
        }
    }

    // Group sessions by date relative to today
    const groupedSessions = useMemo(() => {
        const now = new Date()
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        const yesterdayStart = todayStart - 24 * 60 * 60 * 1000
        const sevenDaysAgo = todayStart - 7 * 24 * 60 * 60 * 1000

        const groups: {
            today: ChatSession[]
            yesterday: ChatSession[]
            previous7Days: ChatSession[]
            older: ChatSession[]
        } = {
            today: [],
            yesterday: [],
            previous7Days: [],
            older: [],
        }

        sessions.forEach((s) => {
            const time = new Date(s.updatedAt || s.createdAt).getTime()
            if (time >= todayStart) {
                groups.today.push(s)
            } else if (time >= yesterdayStart) {
                groups.yesterday.push(s)
            } else if (time >= sevenDaysAgo) {
                groups.previous7Days.push(s)
            } else {
                groups.older.push(s)
            }
        })

        return groups
    }, [sessions])

    const renderSessionItem = (session: ChatSession) => {
        const isActive = session.id === currentSessionId
        return (
            <div
                key={session.id}
                onClick={() => switchSession(session.id)}
                className={`group relative flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
            >
                <div className="flex items-center gap-2 overflow-hidden flex-1 mr-1">
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{session.title || t("newChat")}</span>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        deleteSession(session.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive rounded transition-opacity"
                    title={t("deleteChat") || "Xóa cuộc trò chuyện"}
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        )
    }

    return (
        <div className="flex h-[calc(100vh-4rem)] bg-background overflow-hidden">
            {/* Sidebar (Gemini-Style) */}
            <aside
                className={`border-r bg-muted/20 flex flex-col transition-all duration-300 ease-in-out ${
                    isSidebarOpen
                        ? "w-64 sm:w-72 shrink-0 translate-x-0"
                        : "w-0 -translate-x-full overflow-hidden border-r-0"
                }`}
            >
                {/* Sidebar Header */}
                <div className="p-3 border-b flex items-center justify-between">
                    <Button
                        onClick={() => createSession()}
                        variant="outline"
                        className="w-full justify-start gap-2 h-9 text-xs font-medium rounded-lg shadow-sm"
                    >
                        <Plus className="w-4 h-4 text-primary" />
                        <span>{t("newChat") || "Cuộc trò chuyện mới"}</span>
                    </Button>
                </div>

                {/* Session List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-4">
                    {groupedSessions.today.length > 0 && (
                        <div className="space-y-1">
                            <p className="px-3 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                                {t("today") || "Hôm nay"}
                            </p>
                            {groupedSessions.today.map(renderSessionItem)}
                        </div>
                    )}

                    {groupedSessions.yesterday.length > 0 && (
                        <div className="space-y-1">
                            <p className="px-3 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                                {t("yesterday") || "Hôm qua"}
                            </p>
                            {groupedSessions.yesterday.map(renderSessionItem)}
                        </div>
                    )}

                    {groupedSessions.previous7Days.length > 0 && (
                        <div className="space-y-1">
                            <p className="px-3 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                                {t("previous7Days") || "7 ngày qua"}
                            </p>
                            {groupedSessions.previous7Days.map(renderSessionItem)}
                        </div>
                    )}

                    {groupedSessions.older.length > 0 && (
                        <div className="space-y-1">
                            <p className="px-3 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                                {t("older") || "Cũ hơn"}
                            </p>
                            {groupedSessions.older.map(renderSessionItem)}
                        </div>
                    )}

                    {sessions.length === 0 && (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                            {t("noSessions") || "Chưa có đoạn chat nào"}
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Chat Area */}
            <main className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
                {/* Header */}
                <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsSidebarOpen((prev) => !prev)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                            title={isSidebarOpen ? "Thu gọn Sidebar" : "Mở rộng Sidebar"}
                        >
                            {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.back()}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                            title={t("back") || "Quay lại"}
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <span className="font-semibold text-sm sm:text-base flex items-center gap-2 truncate">
                            <Bot className="w-4 h-4 text-primary shrink-0" />
                            <span className="truncate">{currentSession?.title || t("title") || "AI Hỏi đáp"}</span>
                        </span>
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => createSession()}
                        className="gap-1.5 h-8 text-xs font-medium shrink-0"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t("newChat") || "Cuộc trò chuyện mới"}</span>
                    </Button>
                </header>

                {/* Message Stream */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-4xl w-full mx-auto">
                    {messages.map((m) => (
                        <div
                            key={m.id}
                            className={`flex items-start gap-3 sm:gap-4 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                        >
                            <div
                                className={`p-2 shrink-0 rounded-full ${
                                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                                }`}
                            >
                                {m.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                            </div>
                            <div
                                className={`group relative max-w-[85%] sm:max-w-[80%] p-3.5 sm:p-4 rounded-2xl ${
                                    m.role === "user"
                                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                                        : "bg-muted/70 border rounded-tl-sm"
                                }`}
                            >
                                <p className="leading-relaxed whitespace-pre-wrap text-xs sm:text-sm">{m.content}</p>

                                <div
                                    className={`absolute -bottom-5 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-muted-foreground ${
                                        m.role === "user" ? "right-1" : "left-1"
                                    }`}
                                >
                                    <span>{formatDate(m.timestamp)}</span>
                                </div>

                                <button
                                    onClick={() => copyText(m.content, m.id)}
                                    className={`opacity-0 group-hover:opacity-100 absolute top-2 ${
                                        m.role === "user" ? "left-2 -translate-x-full" : "right-2 translate-x-full"
                                    } p-1.5 bg-background border shadow-sm rounded-md text-muted-foreground hover:text-foreground transition-all z-10 mx-2`}
                                    title="Copy"
                                >
                                    {copiedId === m.id ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                    )}
                                </button>
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex items-center gap-3">
                            <div className="p-2 shrink-0 rounded-full bg-muted">
                                <Bot className="w-4 h-4" />
                            </div>
                            <div className="p-3.5 rounded-2xl bg-muted/70 border rounded-tl-sm flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                <span className="text-xs">{t("loading") || "Đang tìm kiếm thông tin..."}</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} className="h-2" />
                </div>

                {/* Input Area */}
                <div className="bg-background border-t p-3 sm:p-4">
                    <div className="max-w-3xl mx-auto flex flex-col gap-2.5">
                        {messages.length <= 1 && (
                            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                                {QUICK_PROMPTS.map((prompt, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSend(prompt)}
                                        className="px-3 py-1.5 rounded-full bg-muted/50 border text-xs text-muted-foreground hover:text-foreground hover:bg-muted whitespace-nowrap transition-colors"
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
                                        e.preventDefault()
                                        handleSend()
                                    }
                                }}
                                placeholder={t("placeholder") || "Nhập câu hỏi về ngành hoặc môn học..."}
                                className="flex-1 bg-transparent resize-none border-0 outline-none min-h-[40px] max-h-32 py-2 px-2 text-xs sm:text-sm scrollbar-none"
                                rows={1}
                            />
                            <Button
                                size="icon"
                                onClick={() => handleSend()}
                                disabled={isLoading || !input.trim()}
                                className="h-8 w-8 shrink-0 rounded-xl mb-0.5 mr-0.5"
                            >
                                <Send className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                        <div className="text-center text-[10px] text-muted-foreground">
                            {t("disclaimer") || "AI có thể mắc lỗi. Vui lòng kiểm tra lại các thông tin quan trọng."}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
