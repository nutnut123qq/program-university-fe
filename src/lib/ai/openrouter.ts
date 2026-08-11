import type { RagContextResult } from "./ragSearch";

export interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
    model?: string;
    ragInfo?: RagContextResult;
}

export const AVAILABLE_SLM_MODELS = [
    {
        id: "openrouter/free",
        name: "OpenRouter Auto SLM (Recommended)",
        provider: "OpenRouter / Auto Free",
        desc: "Tự động chọn mô hình SLM Free hoạt động ổn định nhất trên OpenRouter",
        isFree: true,
    },
    {
        id: "google/gemma-4-31b-it:free",
        name: "Gemma 4 31B",
        provider: "Google / OpenRouter",
        desc: "SLM thế hệ mới từ Google, lý luận logic & đọc hiểu xuất sắc",
        isFree: true,
    },
    {
        id: "nvidia/nemotron-nano-9b-v2:free",
        name: "Nemotron Nano 9B",
        provider: "Nvidia / OpenRouter",
        desc: "Mô hình SLM 9B tối ưu hóa tốc độ suy luận & tiếng Việt",
        isFree: true,
    },
    {
        id: "openai/gpt-oss-20b:free",
        name: "GPT OSS 20B",
        provider: "OpenAI / OpenRouter",
        desc: "Mô hình nguồn mở 20B hỗ trợ hỏi đáp đa mục đích",
        isFree: true,
    },
];

const DEFAULT_SYSTEM_PROMPT = `Bạn là Trợ lý AI Tư vấn Chương trình Đào tạo (CTĐT) Đại học tại Việt Nam.
Nhiệm vụ của bạn:
1. Giải đáp các thắc mắc về khung chương trình đào tạo, môn học, tín chỉ, khối kiến thức (Đại cương, Cơ sở ngành, Chuyên ngành, Tốt nghiệp).
2. Tư vấn khái niệm và mối quan hệ giữa Môn học tiên quyết (Prerequisite), Môn học trước, Môn song hành.
3. Giải thích Chuẩn đầu ra chương trình đào tạo (PLO - Program Learning Outcomes) và Chuẩn đầu ra học phần (CLO - Course Learning Outcomes).
4. Định hướng lộ trình học tập tối ưu, tư vấn kỹ năng và triển vọng nghề nghiệp cho sinh viên.

Quy tắc trả lời:
- Luôn trả lời bằng tiếng Việt lịch sự, rõ ràng, trình bày mượt mà bằng định dạng Markdown (dùng danh sách bullet, in đậm từ khóa quan trọng).
- Tránh phán đoán mò những số liệu cụ thể nếu không chắc chắn (khuyên sinh viên tham khảo thêm file CTĐT chính thức của trường).
- Giữ câu trả lời súc tích, tập trung vào trọng tâm câu hỏi.`;

export function getStoredApiKey(): string {
    if (typeof window !== "undefined") {
        const localKey = localStorage.getItem("tedo_openrouter_api_key");
        if (localKey && localKey.trim().length > 0) {
            return localKey.trim();
        }
    }
    return process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || "";
}

export function setStoredApiKey(key: string): void {
    if (typeof window !== "undefined") {
        if (key.trim()) {
            localStorage.setItem("tedo_openrouter_api_key", key.trim());
        } else {
            localStorage.removeItem("tedo_openrouter_api_key");
        }
    }
}

import { searchMockDataContext } from "./ragSearch";

export async function sendOpenRouterChatMessage({
    messages,
    model = "openrouter/free",
    customApiKey,
    onChunk,
}: {
    messages: { role: "user" | "assistant" | "system"; content: string }[];
    model?: string;
    customApiKey?: string;
    onChunk?: (chunkText: string) => void;
}): Promise<{ text: string; ragInfo?: RagContextResult }> {
    const apiKey = customApiKey || getStoredApiKey();

    if (!apiKey) {
        throw new Error(
            "Chưa tìm thấy OpenRouter API Key. Vui lòng nhập API Key trong phần Cài đặt của Chatbot hoặc cấu hình NEXT_PUBLIC_OPENROUTER_API_KEY trong file .env.local!"
        );
    }

    // 1. Perform Local Client-side RAG Search on public/mock data
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    let ragInfo: RagContextResult | undefined = undefined;

    let dynamicSystemPrompt = DEFAULT_SYSTEM_PROMPT;

    if (lastUserMsg) {
        ragInfo = await searchMockDataContext(lastUserMsg);
        if (ragInfo.hasContext && ragInfo.contextText) {
            dynamicSystemPrompt += `\n\n${ragInfo.contextText}\n\nYÊU CẦU BẮT BỘC: Hãy ưu tiên sử dụng DỮ LIỆU THỰC TẾ TRÍCH XUẤT TRÊN từ cơ sở dữ liệu Tedo để trả lời câu hỏi một cách KHẲNG ĐỊNH, CHẮC CHẮN VÀ CHÍNH XÁC 100%. Nếu dữ liệu liệt kê có môn học (ví dụ Triết học, Môn Mác-Lênin), hãy khẳng định RÕ RÀNG là BẮT BỘC HỌC.`;
        }
    }

    const formattedMessages = [
        { role: "system", content: dynamicSystemPrompt },
        ...messages,
    ];

    // Clean headers to ensure pure ASCII (ISO-8859-1) compliance for browser fetch
    const cleanApiKey = apiKey.replace(/[^\x00-\x7F]/g, "").trim();

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${cleanApiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://tedo.edu.vn",
            "X-Title": "Tedo CTDT SLM Assistant",
        },
        body: JSON.stringify({
            model: model || process.env.NEXT_PUBLIC_OPENROUTER_MODEL || "openrouter/free",
            messages: formattedMessages,
            temperature: 0.7,
            max_tokens: 1200,
        }),
    });

    if (!response.ok) {
        let errorMessage = `Lỗi HTTP ${response.status}`;
        try {
            const errorJson = await response.json();
            if (errorJson.error?.message) {
                errorMessage = errorJson.error.message;
            }
        } catch {
            // Ignore parse error
        }

        if (response.status === 401) {
            throw new Error("API Key không hợp lệ hoặc đã hết hạn trên OpenRouter. Vui lòng kiểm tra lại Key!");
        } else if (response.status === 429) {
            throw new Error("Đã vượt quá giới hạn lượt gửi (Rate Limit). Vui lòng đợi vài giây và thử lại!");
        }

        throw new Error(errorMessage);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    if (onChunk && content) {
        onChunk(content);
    }

    return { text: content, ragInfo };
}
