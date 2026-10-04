"use client"

import React, { createContext, useContext, useEffect, useState, useMemo, useSyncExternalStore } from 'react';
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

// Read persisted chat state (v2 sessions, then the legacy flat history, then
// a fresh greeting session). Client-only — callers must gate on mount.
const loadInitialSessions = (
    newChatTitle: string,
    greetingText: string,
    previousChatTitle: string
): { sessions: ChatSession[]; currentSessionId: string } => {
    try {
        const rawSessions = localStorage.getItem(SESSIONS_STORAGE_KEY);
        if (rawSessions) {
            const parsed: ChatSession[] = JSON.parse(rawSessions);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return { sessions: parsed, currentSessionId: parsed[0].id };
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
                return { sessions: [legacySession], currentSessionId: legacySession.id };
            }
        }

        // Fresh initial session
        const initialSession = generateNewSession(newChatTitle, greetingText);
        return { sessions: [initialSession], currentSessionId: initialSession.id };
    } catch {
        const fallback = generateNewSession(newChatTitle, greetingText);
        return { sessions: [fallback], currentSessionId: fallback.id };
    }
};

// Hydration-safe mount flag (same pattern as Navbar): false during SSR and
// the first client render, true afterwards.
const useMounted = () =>
    useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );

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
    const mounted = useMounted();

    // Initialize from LocalStorage on the first post-hydration render.
    // Adjusting state during render is React's documented alternative to a
    // mount effect: SSR and the hydration render stay identical
    // (isInitialized=false), then the stored sessions land before paint.
    if (mounted && !isInitialized) {
        const init = loadInitialSessions(newChatTitle, greetingText, previousChatTitle);
        setSessions(init.sessions);
        setCurrentSessionId(init.currentSessionId);
        setIsInitialized(true);
    }

    // Save to LocalStorage whenever sessions change
    useEffect(() => {
        if (isInitialized && sessions.length > 0) {
            try {
                localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
            } catch (error) {
                console.error('Failed to save chat sessions to localStorage:', error);
            }
        }
    }, [sessions, isInitialized]);

    const currentSession = useMemo(() => {
        return sessions.find((s) => s.id === currentSessionId) || sessions[0] || null;
    }, [sessions, currentSessionId]);

    const messages = useMemo(() => {
        return currentSession ? currentSession.messages : [];
    }, [currentSession]);

    const createSession = () => {
        const newSession = generateNewSession(newChatTitle, greetingText);
        setSessions((prev) => [newSession, ...prev]);
        setCurrentSessionId(newSession.id);
        return newSession.id;
    };

    const switchSession = (sessionId: string) => {
        const exists = sessions.some((s) => s.id === sessionId);
        if (exists) {
            setCurrentSessionId(sessionId);
        }
    };

    const deleteSession = (sessionId: string) => {
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
    };

    const clearAllSessions = () => {
        const fresh = generateNewSession(newChatTitle, greetingText);
        setSessions([fresh]);
        setCurrentSessionId(fresh.id);
    };

    const clearMessages = () => {
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
    };

    const sendMessage = async (text: string) => {
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
        } catch {
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
    };

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
