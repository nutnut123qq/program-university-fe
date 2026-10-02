import { NextRequest, NextResponse } from "next/server";
import { retrieveChatContext } from "@/lib/chat-retrieval";

export const runtime = "nodejs";

const MAX_QUERY_CHARS = 1000;
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_MESSAGE_CHARS = 1000;

// Simple in-memory, per-instance rate limit (best effort; resets on cold start).
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_MAX_KEYS = 5000;
const rateLimitBuckets = new Map<string, number[]>();

function clientKey(req: NextRequest): string {
    const xff = req.headers.get("x-forwarded-for");
    const first = xff?.split(",")[0]?.trim();
    if (first) return first;
    const realIp = req.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
    return "anonymous";
}

/** Returns seconds to wait if limited, or 0 if the request is allowed. */
function checkRateLimit(key: string): number {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    const recent = (rateLimitBuckets.get(key) ?? []).filter((t) => t > windowStart);
    if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
        rateLimitBuckets.set(key, recent);
        return Math.max(1, Math.ceil((recent[0] + RATE_LIMIT_WINDOW_MS - now) / 1000));
    }
    recent.push(now);
    rateLimitBuckets.set(key, recent);
    if (rateLimitBuckets.size > RATE_LIMIT_MAX_KEYS) {
        for (const [k, times] of rateLimitBuckets) {
            if (times.every((t) => t <= windowStart)) rateLimitBuckets.delete(k);
        }
    }
    return 0;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toChatMessage(value: unknown): ChatMessage | null {
    if (!isRecord(value)) return null;
    const { role, content } = value;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const trimmed = content.trim();
    if (!trimmed) return null;
    return { role, content: trimmed.slice(0, MAX_HISTORY_MESSAGE_CHARS) };
}

function parseBody(body: unknown): { query: string; history: ChatMessage[] } | null {
    if (!isRecord(body)) return null;
    let query: unknown = "";
    let history: ChatMessage[] = [];
    if (Array.isArray(body.messages) && body.messages.length > 0) {
        const msgs: unknown[] = body.messages;
        const last = msgs[msgs.length - 1];
        query = isRecord(last) ? last.content : "";
        history = msgs
            .slice(0, -1)
            .map(toChatMessage)
            .filter((m): m is ChatMessage => m !== null)
            .slice(-MAX_HISTORY_MESSAGES);
    } else {
        query = body.query ?? body.message ?? "";
    }
    if (typeof query !== "string" || !query.trim()) return null;
    return { query: query.trim().slice(0, MAX_QUERY_CHARS), history };
}

export async function POST(req: NextRequest) {
    try {
        const retryAfter = checkRateLimit(clientKey(req));
        if (retryAfter > 0) {
            return NextResponse.json(
                { error: "Too many requests" },
                { status: 429, headers: { "Retry-After": String(retryAfter) } }
            );
        }

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const parsed = parseBody(body);
        if (!parsed) {
            return NextResponse.json({ error: "Query is required" }, { status: 400 });
        }
        const { query } = parsed;
        const historyMessages: Array<{ role: string; content: string }> = parsed.history;

        // Retrieve with the current query; for follow-ups with no match ("còn môn nào nữa?"),
        // retry with the previous user turn appended.
        let retrieval = await retrieveChatContext(query);
        if (retrieval.matchedProgramIds.length === 0) {
            const lastUserTurn = [...parsed.history].reverse().find((m) => m.role === "user")?.content;
            if (lastUserTurn) retrieval = await retrieveChatContext(`${query}\n${lastUserTurn}`);
        }
        const retrievedContext = retrieval.context;

        const systemPrompt = `Bạn là Trợ lý AI của hệ thống Tedo - Nền tảng tra cứu chương trình đào tạo đại học tại Việt Nam.

DỮ LIỆU TRUY XUẤT TỪ CSDL TEDO (chỉ đây là nguồn thông tin hợp lệ):
<context>
${retrievedContext}
</context>

NGUYÊN TẮC TRẢ LỜI:
1. Chỉ trả lời dựa trên dữ liệu trong <context>. Không bịa thêm số liệu, học phí, môn học hay quy định không có trong dữ liệu.
2. Nếu dữ liệu không chứa câu trả lời (ví dụ không thấy môn học, học phí ghi "không có trong dữ liệu"), hãy nói rõ là dữ liệu hiện có không có thông tin đó, và gợi ý người dùng kiểm tra nguồn chính thức của trường.
3. Danh sách môn trong <context> có thể đã bị rút gọn; nếu không thấy một môn trong danh sách rút gọn, nói là không tìm thấy trong phần dữ liệu được trích, không khẳng định là trường không dạy.
4. Khi nêu thông tin về một chương trình, ghi kèm tên chương trình và trường (và đường dẫn nguồn nếu có).
5. Trả lời bằng tiếng Việt, ngắn gọn, trực diện, chuyên nghiệp, không dùng emoji.
6. Nếu <context> có mục "DỮ LIỆU TUYỂN SINH" (điểm chuẩn, điểm sàn, học phí, chỉ tiêu), khi trích dẫn phải ghi rõ năm áp dụng, thang điểm và tên miền nguồn; tuyệt đối không suy diễn hay bịa thêm số liệu.`;

        const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;
        const openAiKey = process.env.OPENAI_API_KEY;
        const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        const deepseekKey = process.env.DEEPSEEK_API_KEY;
        const groqKey = process.env.GROQ_API_KEY;

        // 1. OpenRouter Integration
        if (openRouterKey) {
            try {
                const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat";
                const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${openRouterKey}`,
                        "HTTP-Referer": "https://program-university-fe.vercel.app",
                        "X-Title": "Tedo AI Assistant",
                    },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...historyMessages,
                            { role: "user", content: query },
                        ],
                        temperature: 0.2,
                        max_tokens: 600,
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    const reply = data.choices?.[0]?.message?.content?.trim();
                    if (reply) {
                        return NextResponse.json({ reply, provider: `openrouter (${model})` });
                    }
                } else {
                    const errData = await res.json().catch(() => ({}));
                    console.error("OpenRouter API Error:", res.status, errData);
                }
            } catch (e) {
                console.error("OpenRouter Fetch Exception:", e);
            }
        }

        // 2. OpenAI Integration
        if (openAiKey) {
            try {
                const res = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${openAiKey}`,
                    },
                    body: JSON.stringify({
                        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...historyMessages,
                            { role: "user", content: query },
                        ],
                        temperature: 0.2,
                        max_tokens: 600,
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    const reply = data.choices?.[0]?.message?.content?.trim();
                    if (reply) {
                        return NextResponse.json({ reply, provider: "openai" });
                    }
                }
            } catch (e) {
                console.error("OpenAI Fetch Exception:", e);
            }
        }

        // 3. Google Gemini Integration
        if (geminiKey) {
            try {
                const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
                let geminiConversation = `${systemPrompt}\n\n`;
                if (historyMessages.length > 0) {
                    geminiConversation += `Lịch sử hội thoại:\n`;
                    historyMessages.forEach(m => {
                        geminiConversation += `${m.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${m.content}\n`;
                    });
                    geminiConversation += `\n`;
                }
                geminiConversation += `Câu hỏi hiện tại: ${query}`;

                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: [
                                {
                                    role: "user",
                                    parts: [{ text: geminiConversation }],
                                },
                            ],
                            generationConfig: {
                                temperature: 0.2,
                                maxOutputTokens: 600,
                            },
                        }),
                    }
                );

                if (res.ok) {
                    const data = await res.json();
                    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                    if (reply) {
                        return NextResponse.json({ reply, provider: "gemini" });
                    }
                }
            } catch (e) {
                console.error("Gemini Fetch Exception:", e);
            }
        }

        // 4. Anthropic Claude Integration
        if (anthropicKey) {
            try {
                const res = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": anthropicKey,
                        "anthropic-version": "2023-06-01",
                    },
                    body: JSON.stringify({
                        model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
                        system: systemPrompt,
                        messages: [
                            ...historyMessages.map(m => ({
                                role: m.role === 'assistant' ? 'assistant' : 'user',
                                content: m.content
                            })),
                            { role: "user", content: query }
                        ],
                        max_tokens: 600,
                        temperature: 0.2,
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    const reply = data.content?.[0]?.text?.trim();
                    if (reply) {
                        return NextResponse.json({ reply, provider: "anthropic" });
                    }
                }
            } catch (e) {
                console.error("Anthropic Fetch Exception:", e);
            }
        }

        // 5. DeepSeek Direct Integration
        if (deepseekKey) {
            try {
                const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${deepseekKey}`,
                    },
                    body: JSON.stringify({
                        model: "deepseek-chat",
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...historyMessages,
                            { role: "user", content: query },
                        ],
                        temperature: 0.2,
                        max_tokens: 600,
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    const reply = data.choices?.[0]?.message?.content?.trim();
                    if (reply) {
                        return NextResponse.json({ reply, provider: "deepseek" });
                    }
                }
            } catch (e) {
                console.error("DeepSeek Fetch Exception:", e);
            }
        }

        // 6. Groq Integration
        if (groqKey) {
            try {
                const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${groqKey}`,
                    },
                    body: JSON.stringify({
                        model: "llama-3.1-8b-instant",
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...historyMessages,
                            { role: "user", content: query },
                        ],
                        temperature: 0.2,
                        max_tokens: 600,
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    const reply = data.choices?.[0]?.message?.content?.trim();
                    if (reply) {
                        return NextResponse.json({ reply, provider: "groq" });
                    }
                }
            } catch (e) {
                console.error("Groq Fetch Exception:", e);
            }
        }

        // 7. Grounded Local Fallback
        return NextResponse.json({
            reply: null,
            fallback: true,
            message: "Using grounded local RAG context.",
        });
    } catch (error: unknown) {
        console.error("API Chat Route Error:", error instanceof Error ? error.message : error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
