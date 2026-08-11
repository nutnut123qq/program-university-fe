"use client";

import React, { useState, useEffect, useRef } from "react";
import {
    Bot,
    User,
    Send,
    Sparkles,
    X,
    RotateCcw,
    Settings,
    Key,
    Check,
    Cpu,
    ExternalLink,
    AlertCircle,
    ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    sendOpenRouterChatMessage,
    getStoredApiKey,
    setStoredApiKey,
    AVAILABLE_SLM_MODELS,
    ChatMessage,
} from "@/lib/ai/openrouter";
import { FormattedMarkdown } from "./FormattedMarkdown";

const SAMPLE_QUESTIONS = [
    "🎓 Tư vấn môn học & lộ trình ngành CNTT",
    "📌 Môn học tiên quyết khác gì môn học trước?",
    "🎯 Giải thích Chuẩn đầu ra PLO & CLO",
    "💡 Cách sắp xếp tín chỉ hợp lý từng học kỳ?",
];

export const AIChatWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState("");
    const [hasKey, setHasKey] = useState(false);
    const [selectedModel, setSelectedModel] = useState("openrouter/free");

    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: "welcome-msg",
            role: "assistant",
            content: "Xin chào! Tôi là Trợ lý AI SLM chuyên tư vấn **Chương trình Đào tạo (CTĐT)**, môn học & chuẩn đầu ra PLO.\n\nBạn cần tôi hỗ trợ thông tin gì hôm nay?",
            timestamp: Date.now(),
            model: "openrouter/free",
        },
    ]);

    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const key = getStoredApiKey();
        setHasKey(!!key);
        setApiKeyInput(key);
    }, []);

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen, isLoading]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleSaveKey = () => {
        setStoredApiKey(apiKeyInput);
        setHasKey(!!apiKeyInput.trim());
        setShowSettings(false);
        setErrorMessage(null);
    };

    const handleSendMessage = async (customPrompt?: string) => {
        const queryText = (customPrompt || input).trim();
        if (!queryText || isLoading) return;

        setInput("");
        setErrorMessage(null);

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: "user",
            content: queryText,
            timestamp: Date.now(),
        };

        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setIsLoading(true);

        try {
            // Prepare history for API (filter out initial welcome if needed or keep last 6 turns)
            const apiHistory = updatedMessages
                .filter((m) => m.role === "user" || m.role === "assistant")
                .map((m) => ({ role: m.role, content: m.content }));

            const { text, ragInfo } = await sendOpenRouterChatMessage({
                messages: apiHistory,
                model: selectedModel,
            });

            const botMsg: ChatMessage = {
                id: `bot-${Date.now()}`,
                role: "assistant",
                content: text,
                timestamp: Date.now(),
                model: selectedModel,
                ragInfo,
            };

            setMessages((prev) => [...prev, botMsg]);
        } catch (err: any) {
            setErrorMessage(err.message || "Không thể kết nối với mô hình SLM.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setMessages([
            {
                id: `welcome-${Date.now()}`,
                role: "assistant",
                content: "Đã làm mới cuộc trò chuyện. Tôi có thể giúp gì cho bạn về môn học & CTĐT?",
                timestamp: Date.now(),
            },
        ]);
        setErrorMessage(null);
    };

    return (
        <>
            {/* Floating Trigger Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-full shadow-lg hover:shadow-indigo-500/25 transition-all duration-300 transform hover:scale-105 group"
                    aria-label="Mo AI Chatbot"
                >
                    <div className="relative">
                        <Sparkles className="w-5 h-5 animate-pulse text-amber-300" />
                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                    </div>
                    <span className="font-semibold text-sm tracking-wide">Trợ lý SLM AI</span>
                    <Badge variant="secondary" className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 border-none">
                        Free
                    </Badge>
                </button>
            )}

            {/* Chat Dialog Drawer */}
            {isOpen && (
                <div className="fixed bottom-4 right-4 z-50 w-[92vw] sm:w-[420px] h-[580px] max-h-[85vh] bg-background/95 backdrop-blur-md border border-border/80 shadow-2xl rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border/50">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-sm">
                                <Cpu className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <h3 className="font-semibold text-sm text-foreground">SLM AI Chatbot</h3>
                                    <Badge variant="outline" className="text-[10px] py-0 px-1 text-emerald-500 border-emerald-500/30">
                                        OpenRouter SLM
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                                    {AVAILABLE_SLM_MODELS.find((m) => m.id === selectedModel)?.name}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowSettings(!showSettings)}
                                title="Cài đặt API Key & Model"
                            >
                                <Settings className="w-4 h-4" />
                            </Button>

                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={handleReset}
                                title="Làm mới cuộc trò chuyện"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </Button>

                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => setIsOpen(false)}
                                title="Đóng cửa sổ"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Settings Panel Toggle */}
                    {showSettings && (
                        <div className="p-3.5 bg-muted/60 border-b border-border/60 text-xs space-y-3 animate-in fade-in duration-150">
                            <div>
                                <label className="font-medium text-foreground flex items-center justify-between mb-1">
                                    <span>Chọn mô hình SLM:</span>
                                </label>
                                <select
                                    value={selectedModel}
                                    onChange={(e) => setSelectedModel(e.target.value)}
                                    className="w-full p-2 text-xs bg-background border border-input rounded-md text-foreground focus:ring-1 focus:ring-primary outline-none"
                                >
                                    {AVAILABLE_SLM_MODELS.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {m.name} ({m.provider})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="font-medium text-foreground flex items-center justify-between mb-1">
                                    <span className="flex items-center gap-1">
                                        <Key className="w-3.5 h-3.5 text-amber-500" /> OpenRouter API Key:
                                    </span>
                                    <a
                                        href="https://openrouter.ai/keys"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5"
                                    >
                                        Lấy Key free <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        type="password"
                                        placeholder="sk-or-v1-..."
                                        value={apiKeyInput}
                                        onChange={(e) => setApiKeyInput(e.target.value)}
                                        className="text-xs h-8 bg-background"
                                    />
                                    <Button size="sm" onClick={handleSaveKey} className="h-8 px-3 text-xs">
                                        Lưu Key
                                    </Button>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    Key được lưu an toàn trong Trình duyệt (localStorage) hoặc đọc từ <code>.env.local</code>.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Messages Body */}
                    <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 text-xs">
                        {!hasKey && !showSettings && (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-600 dark:text-amber-400 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium">Chưa phát hiện API Key!</p>
                                    <p className="text-[11px] mt-0.5 opacity-90">
                                        Vui lòng nhấn nút <Settings className="w-3 h-3 inline mx-0.5" /> ở góc trên hoặc điền vào <code>.env.local</code> để trò chuyện với SLM.
                                    </p>
                                </div>
                            </div>
                        )}

                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                {msg.role === "assistant" && (
                                    <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                                        <Bot className="w-4 h-4" />
                                    </div>
                                )}

                                <div
                                    className={`max-w-[82%] p-3 rounded-2xl ${
                                        msg.role === "user"
                                            ? "bg-blue-600 text-white rounded-br-xs"
                                            : "bg-muted/80 text-foreground border border-border/50 rounded-bl-xs shadow-xs"
                                    }`}
                                >
                                    {msg.ragInfo?.hasContext && (
                                        <div className="mb-2 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                            <span>🔍 Đã tra cứu dữ liệu CTĐT {msg.ragInfo.universityCode || msg.ragInfo.universityName} ({msg.ragInfo.programName})</span>
                                        </div>
                                    )}

                                    <div className="leading-relaxed">
                                        <FormattedMarkdown content={msg.content} />
                                    </div>
                                    {msg.model && msg.role === "assistant" && (
                                        <div className="mt-1.5 pt-1 border-t border-border/30 text-[9px] text-muted-foreground flex items-center justify-between">
                                            <span>Mô hình: {AVAILABLE_SLM_MODELS.find((m) => m.id === msg.model)?.name || msg.model}</span>
                                        </div>
                                    )}
                                </div>

                                {msg.role === "user" && (
                                    <div className="w-7 h-7 rounded-lg bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                                        <User className="w-4 h-4" />
                                    </div>
                                )}
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex gap-2.5 justify-start">
                                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                                    <Bot className="w-4 h-4" />
                                </div>
                                <div className="bg-muted/80 border border-border/50 p-3 rounded-2xl rounded-bl-xs text-muted-foreground flex items-center gap-2">
                                    <div className="flex space-x-1">
                                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></div>
                                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.2s]"></div>
                                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.4s]"></div>
                                    </div>
                                    <span className="text-[11px]">SLM đang suy luận câu trả lời...</span>
                                </div>
                            </div>
                        )}

                        {errorMessage && (
                            <div className="p-2.5 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-[11px] flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span className="flex-1">{errorMessage}</span>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Suggestion Pills */}
                    {messages.length <= 2 && !isLoading && (
                        <div className="px-3 py-1.5 bg-muted/40 border-t border-border/30 overflow-x-auto flex gap-1.5 text-[11px] scrollbar-none">
                            {SAMPLE_QUESTIONS.map((q, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleSendMessage(q)}
                                    className="whitespace-nowrap px-2.5 py-1 rounded-full bg-background border border-border/60 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0 text-[11px]"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Footer Input Form */}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSendMessage();
                        }}
                        className="p-2.5 bg-card border-t border-border/50 flex items-center gap-2"
                    >
                        <Input
                            placeholder="Hỏi về môn học, tín chỉ, chuẩn đầu ra..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={isLoading}
                            className="text-xs bg-background h-9 rounded-xl focus-visible:ring-1"
                        />
                        <Button
                            type="submit"
                            size="icon"
                            disabled={isLoading || !input.trim()}
                            className="h-9 w-9 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shrink-0 shadow-sm"
                        >
                            <Send className="w-4 h-4" />
                        </Button>
                    </form>
                </div>
            )}
        </>
    );
};
