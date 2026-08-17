import React, { createContext, useContext, useEffect, useState } from 'react';
import { querySlmRag } from '@/lib/slmRagEngine';

export type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
};

interface ChatContextType {
    messages: ChatMessage[];
    isLoading: boolean;
    sendMessage: (text: string) => Promise<void>;
    clearMessages: () => void;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const STORAGE_KEY = 'tedo-chat-history';
const INITIAL_GREETING: ChatMessage = {
    id: 'greeting',
    role: 'assistant',
    content: 'Xin chào! Tôi có thể hỗ trợ gì về thông tin chương trình đào tạo và môn học của các trường đại học?',
    timestamp: new Date().toISOString()
};

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed: ChatMessage[] = JSON.parse(stored);
                // Check if older than 24h
                if (parsed.length > 0) {
                    const lastMsgTime = new Date(parsed[parsed.length - 1].timestamp).getTime();
                    const now = new Date().getTime();
                    const ageInHours = (now - lastMsgTime) / (1000 * 60 * 60);
                    
                    if (ageInHours > 24) {
                        setMessages([{ ...INITIAL_GREETING, timestamp: new Date().toISOString() }]);
                    } else {
                        setMessages(parsed);
                    }
                } else {
                    setMessages([{ ...INITIAL_GREETING, timestamp: new Date().toISOString() }]);
                }
            } catch (e) {
                setMessages([{ ...INITIAL_GREETING, timestamp: new Date().toISOString() }]);
            }
        } else {
            setMessages([{ ...INITIAL_GREETING, timestamp: new Date().toISOString() }]);
        }
        setIsInitialized(true);
    }, []);

    useEffect(() => {
        if (isInitialized) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
        }
    }, [messages, isInitialized]);

    const clearMessages = () => {
        setMessages([{ ...INITIAL_GREETING, timestamp: new Date().toISOString(), id: Date.now().toString() }]);
    };

    const sendMessage = async (text: string) => {
        if (!text.trim()) return;

        const newUserMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            timestamp: new Date().toISOString()
        };

        const currentMessages = [...messages, newUserMsg];
        setMessages(currentMessages);
        setIsLoading(true);

        try {
            const history = messages.map(m => ({ role: m.role, content: m.content }));
            const replyContent = await querySlmRag(text, history);
            
            const newBotMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: replyContent,
                timestamp: new Date().toISOString()
            };
            
            setMessages(prev => [...prev, newBotMsg]);
        } catch (error) {
            const errorMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Không thể tải câu trả lời vào lúc này. Vui lòng thử lại sau.',
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <ChatContext.Provider value={{ messages, isLoading, sendMessage, clearMessages, isOpen, setIsOpen }}>
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
