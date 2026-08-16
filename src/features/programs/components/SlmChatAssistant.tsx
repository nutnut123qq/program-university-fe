"use client"

import React, { useState } from "react"
import { MessageSquare, X, Send, Bot, User, Copy, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { querySlmRag } from "@/lib/slmRagEngine"

interface Message {
    id: string
    sender: "bot" | "user"
    text: string
    timestamp: string
}

const QUICK_PROMPTS = [
    "Ở FPT có môn Triết học Mác - Lênin không?",
    "Ngành Công nghệ Thông tin học mấy năm và bao nhiêu tín chỉ?",
    "Sơ đồ cây môn học tiên quyết hoạt động như thế nào?",
    "Khối kiến thức cơ sở ngành và chuyên ngành khác nhau thế nào?",
]

export const SlmChatAssistant = () => {
    const [isOpen, setIsOpen] = useState(false)
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "msg-1",
            sender: "bot",
            text: "Xin chào! Tôi có thể hỗ trợ gì về thông tin chương trình đào tạo và môn học của các trường đại học?",
            timestamp: "",
        },
    ])

    const handleSend = async (textToSend?: string) => {
        const query = textToSend || input
        if (!query.trim() || isLoading) return

        const userMsg: Message = {
            id: `user-${Date.now()}`,
            sender: "user",
            text: query,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }

        setMessages((prev) => [...prev, userMsg])
        if (!textToSend) setInput("")
        setIsLoading(true)

        try {
            const reply = await querySlmRag(query)

            const botMsg: Message = {
                id: `bot-${Date.now()}`,
                sender: "bot",
                text: reply,
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            }
            setMessages((prev) => [...prev, botMsg])
        } catch (err) {
            const errorMsg: Message = {
                id: `bot-${Date.now()}`,
                sender: "bot",
                text: "Không thể tải câu trả lời vào lúc này. Vui lòng thử lại sau.",
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            }
            setMessages((prev) => [...prev, errorMsg])
        } finally {
            setIsLoading(false)
        }
    }

    const copyText = (text: string, id: string) => {
        navigator.clipboard.writeText(text)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
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
                    <span>AI Hỏi đáp</span>
                </Button>
            )}

            {/* Chat Modal Box */}
            {isOpen && (
                <Card className="w-[360px] sm:w-[400px] h-[520px] shadow-xl border flex flex-col animate-in slide-in-from-bottom-5 duration-200">
                    <CardHeader className="p-3.5 border-b flex flex-row items-center justify-between space-y-0">
                        <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4 text-primary" />
                            <CardTitle className="text-sm font-semibold">AI Hỏi đáp</CardTitle>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-7 w-7">
                            <X className="w-4 h-4" />
                        </Button>
                    </CardHeader>

                    {/* Messages Body */}
                    <CardContent className="flex-1 p-3.5 overflow-y-auto space-y-3 text-xs">
                        {messages.map((m) => (
                            <div
                                key={m.id}
                                className={`flex items-start gap-2 ${m.sender === "user" ? "flex-row-reverse" : ""}`}
                            >
                                <div className={`p-1.5 rounded-full ${m.sender === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                    {m.sender === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                                </div>
                                <div className={`group relative max-w-[85%] p-2.5 rounded-xl ${m.sender === "user" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted border rounded-tl-none"}`}>
                                    <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                                    <button
                                        onClick={() => copyText(m.text, m.id)}
                                        className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 p-1 bg-background/80 rounded text-muted-foreground hover:text-foreground transition-opacity"
                                    >
                                        {copiedId === m.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex items-center gap-2 text-muted-foreground text-[11px] p-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                <span>Đang tìm kiếm thông tin...</span>
                            </div>
                        )}
                    </CardContent>

                    {/* Quick Suggestions */}
                    <div className="p-2 border-t bg-muted/20 overflow-x-auto flex gap-1.5">
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

                    {/* Input Bar */}
                    <div className="p-2.5 border-t flex items-center gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSend()}
                            placeholder="Nhập câu hỏi về ngành hoặc môn học..."
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
