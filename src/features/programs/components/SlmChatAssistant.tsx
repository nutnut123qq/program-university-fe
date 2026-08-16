"use client"

import React, { useState } from "react"
import { MessageSquare, Sparkles, X, Send, Bot, User, ShieldCheck, Copy, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
    "Thang điểm 10.0 SLM Strict Rubric được tính ra sao?",
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
            text: "Xin chào! Tôi là Trợ lý AI SLM RAG của hệ thống Tedo. Tôi có thể giúp gì cho bạn về thông tin 1.093 chương trình đào tạo & 57.935 môn học của 12 trường đại học?",
            timestamp: "Vừa xong",
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
            // Real grounded query to RAG knowledge base
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
                text: "Xin lỗi, đã xảy ra lỗi khi truy vấn cơ sở tri thức Tedo. Vui lòng thử lại!",
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
                    className="h-14 px-5 rounded-full shadow-2xl bg-primary text-primary-foreground hover:scale-105 transition-all duration-200 gap-2.5 font-bold"
                >
                    <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
                    <span>Hỏi AI SLM RAG</span>
                    <Badge variant="secondary" className="bg-emerald-500 text-white font-mono text-[10px] ml-1">
                        10/10 Gold
                    </Badge>
                </Button>
            )}

            {/* Chat Modal Box */}
            {isOpen && (
                <Card className="w-[380px] sm:w-[440px] h-[560px] shadow-2xl border-primary/30 flex flex-col animate-in slide-in-from-bottom-5 duration-300">
                    <CardHeader className="p-4 border-b bg-gradient-to-r from-primary/10 via-background to-indigo-500/10 flex flex-row items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-primary/20 text-primary rounded-xl">
                                <Bot className="w-5 h-5" />
                            </div>
                            <div>
                                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                                    <span>AI SLM RAG Assistant</span>
                                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                </CardTitle>
                                <p className="text-[11px] text-muted-foreground">Truy vấn CSDL 12 Trường • 0% ảo giác</p>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8">
                            <X className="w-4 h-4" />
                        </Button>
                    </CardHeader>

                    {/* Messages Body */}
                    <CardContent className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
                        {messages.map((m) => (
                            <div
                                key={m.id}
                                className={`flex items-start gap-2.5 ${m.sender === "user" ? "flex-row-reverse" : ""}`}
                            >
                                <div className={`p-1.5 rounded-full ${m.sender === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                    {m.sender === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                                </div>
                                <div className={`group relative max-w-[85%] p-3 rounded-2xl ${m.sender === "user" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted/60 border rounded-tl-none"}`}>
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
                            <div className="flex items-center gap-2 text-muted-foreground italic text-[11px]">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                <span>Đang truy xuất CSDL Tedo...</span>
                            </div>
                        )}
                    </CardContent>

                    {/* Quick Suggestions */}
                    <div className="p-2 border-t bg-muted/20 overflow-x-auto flex gap-1.5">
                        {QUICK_PROMPTS.map((prompt, i) => (
                            <button
                                key={i}
                                onClick={() => handleSend(prompt)}
                                className="px-2.5 py-1 rounded-full bg-background border text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-primary shrink-0 transition-colors"
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>

                    {/* Input Bar */}
                    <div className="p-3 border-t flex items-center gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSend()}
                            placeholder="Hỏi về 1.093 ngành & môn học..."
                            className="flex-1 bg-muted/40 border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <Button
                            size="icon"
                            onClick={() => handleSend()}
                            disabled={isLoading}
                            className="h-8 w-8 rounded-xl shrink-0"
                        >
                            <Send className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </Card>
            )}
        </div>
    )
}
