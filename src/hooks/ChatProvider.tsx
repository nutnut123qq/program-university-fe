"use client"

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { querySlmRag } from '@/lib/slmRagEngine';

export type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
};

export interface ChatSession {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: ChatMessage[];
}

interface ChatContextType {
    sessions: ChatSession[];
    currentSessionId: string;
    currentSession: ChatSession | null;
    messages: ChatMessage[];
    isLoading: boolean;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    createSession: () => string;
    switchSession: (sessionId: string) => void;
    deleteSession: (sessionId: string) => void;
    clearAllSessions: () => void;
    sendMessage: (text: string) => Promise<void>;
    clearMessages: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const SESSIONS_STORAGE_KEY = 'tedo_chat_sessions_v2';
const LEGACY_STORAGE_KEY = 'tedo-chat-history';

const createDefaultGreeting = (greetingText: string): ChatMessage => ({
    id: `greet-${Date.now()}`,
    role: 'assistant',
    content: greetingText,
    timestamp: new Date().toISOString(),
});

const generateNewSession = (title: string, greetingText: string): ChatSession => {
    const now = new Date().toISOString();
    return {
        id: `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title,
        createdAt: now,
        updatedAt: now,
        messages: [createDefaultGreeting(greetingText)],
    };
};

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const t = useTranslations('chat');
    const greetingText = t('greeting');
    const newChatTitle = t('newChat');
    const previousChatTitle = t('previousChat');
    const errorText = t('error');
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);

    // Initialize from LocalStorage on mount
    useEffect(() => {
        try {
            const rawSessions = localStorage.getItem(SESSIONS_STORAGE_KEY);
            if (rawSessions) {
                const parsed: ChatSession[] = JSON.parse(rawSessions);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setSessions(parsed);
                    setCurrentSessionId(parsed[0].id);
                    setIsInitialized(true);
                    return;
                }
            }

            // Check legacy storage
            const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacyRaw) {
                const legacyMsgs: ChatMessage[] = JSON.parse(legacyRaw);
                if (Array.isArray(legacyMsgs) && legacyMsgs.length > 0) {
                    const firstUserMsg = legacyMsgs.find(m => m.role === 'user');
                    const title = firstUserMsg ? firstUserMsg.content.slice(0, 35).trim() : previousChatTitle;
                    const legacySession: ChatSession = {
                        id: `sess-${Date.now()}`,
                        title,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        messages: legacyMsgs,
                    };
                    setSessions([legacySession]);
                    setCurrentSessionId(legacySession.id);
                    setIsInitialized(true);
                    return;
                }
            }

            // Fresh initial session
            const initialSession = generateNewSession(newChatTitle, greetingText);
            setSessions([initialSession]);
            setCurrentSessionId(initialSession.id);
        } catch (e) {
            const fallback = generateNewSession(newChatTitle, greetingText);
            setSessions([fallback]);
            setCurrentSessionId(fallback.id);
        } finally {
            setIsInitialized(true);
        }
    }, []);

    // Save to LocalStorage whenever sessions change
    useEffect(() => {
        if (isInitialized && sessions.length > 0) {
            try {
                localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
            } catch (e) {
                console.error('Failed to save chat sessions to localStorage:', e);
            }
        }
    }, [sessions, isInitialized]);

    const currentSession = useMemo(() => {
        return sessions.find((s) => s.id === currentSessionId) || sessions[0] || null;
    }, [sessions, currentSessionId]);

    const messages = useMemo(() => {
        return currentSession ? currentSession.messages : [];
    }, [currentSession]);

    const createSession = useCallback(() => {
        const newSession = generateNewSession(newChatTitle, greetingText);
        setSessions((prev) => [newSession, ...prev]);
        setCurrentSessionId(newSession.id);
        return newSession.id;
    }, [newChatTitle, greetingText]);

    const switchSession = useCallback((sessionId: string) => {
        const exists = sessions.some((s) => s.id === sessionId);
        if (exists) {
            setCurrentSessionId(sessionId);
        }
    }, [sessions]);

    const deleteSession = useCallback((sessionId: string) => {
        setSessions((prev) => {
            const filtered = prev.filter((s) => s.id !== sessionId);
            if (filtered.length === 0) {
                const fresh = generateNewSession(newChatTitle, greetingText);
                setCurrentSessionId(fresh.id);
                return [fresh];
            }
            if (currentSessionId === sessionId) {
                setCurrentSessionId(filtered[0].id);
            }
            return filtered;
        });
    }, [currentSessionId, newChatTitle, greetingText]);

    const clearAllSessions = useCallback(() => {
        const fresh = generateNewSession(newChatTitle, greetingText);
        setSessions([fresh]);
        setCurrentSessionId(fresh.id);
    }, [newChatTitle, greetingText]);

    const clearMessages = useCallback(() => {
        if (!currentSessionId) return;
        setSessions((prev) =>
            prev.map((s) => {
                if (s.id === currentSessionId) {
                    return {
                        ...s,
                        title: newChatTitle,
                        updatedAt: new Date().toISOString(),
                        messages: [createDefaultGreeting(greetingText)],
                    };
                }
                return s;
            })
        );
    }, [currentSessionId, newChatTitle, greetingText]);

    const sendMessage = useCallback(async (text: string) => {
        const queryText = text.trim();
        if (!queryText || !currentSessionId) return;

        const now = new Date().toISOString();
        const userMsg: ChatMessage = {
            id: `usr-${Date.now()}`,
            role: 'user',
            content: queryText,
            timestamp: now,
        };

        // Find current session and check if title needs to be updated
        let sessionTitle = currentSession?.title || newChatTitle;
        const isFirstQuestion = !currentSession || currentSession.messages.filter(m => m.role === 'user').length === 0 || sessionTitle === newChatTitle;
        if (isFirstQuestion) {
            sessionTitle = queryText.length > 35 ? queryText.slice(0, 35) + '...' : queryText;
        }

        const activeHistory = currentSession ? currentSession.messages : [];
        const updatedMessages = [...activeHistory, userMsg];

        // Optimistically update session with user message
        setSessions((prev) =>
            prev.map((s) => {
                if (s.id === currentSessionId) {
                    return {
                        ...s,
                        title: sessionTitle,
                        updatedAt: now,
                        messages: updatedMessages,
                    };
                }
                return s;
            })
        );
        setIsLoading(true);

        try {
            const historyPayload = activeHistory.map((m) => ({ role: m.role, content: m.content }));
            const replyContent = await querySlmRag(queryText, historyPayload);

            const botMsg: ChatMessage = {
                id: `bot-${Date.now()}`,
                role: 'assistant',
                content: replyContent,
                timestamp: new Date().toISOString(),
            };

            setSessions((prev) =>
                prev.map((s) => {
                    if (s.id === currentSessionId) {
                        return {
                            ...s,
                            updatedAt: new Date().toISOString(),
                            messages: [...s.messages, botMsg],
                        };
                    }
                    return s;
                })
            );
        } catch (error) {
            const errorMsg: ChatMessage = {
                id: `err-${Date.now()}`,
                role: 'assistant',
                content: errorText,
                timestamp: new Date().toISOString(),
            };
            setSessions((prev) =>
                prev.map((s) => {
                    if (s.id === currentSessionId) {
                        return {
                            ...s,
                            updatedAt: new Date().toISOString(),
                            messages: [...s.messages, errorMsg],
                        };
                    }
                    return s;
                })
            );
        } finally {
            setIsLoading(false);
        }
    }, [currentSessionId, currentSession, newChatTitle, greetingText, errorText]);

    return (
        <ChatContext.Provider
            value={{
                sessions,
                currentSessionId,
                currentSession,
                messages,
                isLoading,
                isOpen,
                setIsOpen,
                createSession,
                switchSession,
                deleteSession,
                clearAllSessions,
                sendMessage,
                clearMessages,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
};
