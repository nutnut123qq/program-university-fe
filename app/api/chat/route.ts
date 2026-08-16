import { NextRequest, NextResponse } from "next/server";

const TEDO_SYSTEM_PROMPT = `Bạn là Trợ lý AI của hệ thống Tedo - Nền tảng tra cứu, chuẩn hóa và đánh giá chương trình đào tạo (CTĐT) đại học tại Việt Nam.
CSDL Tedo bao gồm 12 trường đại học trọng điểm (VNU, HUST, HCMUT, FTU, NEU, UIT, UET, UEH, FPT, TDTU, DTU, HCMUS) với 1.093 ngành học và 57.935 môn học.
Nhiệm vụ của bạn là:
- Trả lời ngắn gọn, trực diện, chính xác, khách quan về CTĐT, môn học, số tín chỉ, môn tiên quyết, học phí và khối kiến thức (Đại cương, Cơ sở ngành, Chuyên ngành, Tốt nghiệp).
- Tuyệt đối không dùng emoji bừa bãi. Văn phong học thuật, chuyên nghiệp, tối giản.`;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const query = body?.query || body?.message || "";

        if (!query || typeof query !== "string" || !query.trim()) {
            return NextResponse.json({ error: "Query is required" }, { status: 400 });
        }

        const openAiKey = process.env.OPENAI_API_KEY;
        const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        const deepseekKey = process.env.DEEPSEEK_API_KEY;
        const groqKey = process.env.GROQ_API_KEY;

        // 1. OpenAI Integration
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
                            { role: "system", content: TEDO_SYSTEM_PROMPT },
                            { role: "user", content: query },
                        ],
                        temperature: 0.3,
                        max_tokens: 600,
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    const reply = data.choices?.[0]?.message?.content?.trim();
                    if (reply) {
                        return NextResponse.json({ reply, provider: "openai" });
                    }
                } else {
                    const errData = await res.json().catch(() => ({}));
                    console.error("OpenAI API Error:", res.status, errData);
                }
            } catch (e) {
                console.error("OpenAI Fetch Exception:", e);
            }
        }

        // 2. Google Gemini Integration
        if (geminiKey) {
            try {
                const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: [
                                {
                                    role: "user",
                                    parts: [{ text: `${TEDO_SYSTEM_PROMPT}\n\nCâu hỏi của người dùng: ${query}` }],
                                },
                            ],
                            generationConfig: {
                                temperature: 0.3,
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
                } else {
                    const errData = await res.json().catch(() => ({}));
                    console.error("Gemini API Error:", res.status, errData);
                }
            } catch (e) {
                console.error("Gemini Fetch Exception:", e);
            }
        }

        // 3. Anthropic Claude Integration
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
                        system: TEDO_SYSTEM_PROMPT,
                        messages: [{ role: "user", content: query }],
                        max_tokens: 600,
                        temperature: 0.3,
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    const reply = data.content?.[0]?.text?.trim();
                    if (reply) {
                        return NextResponse.json({ reply, provider: "anthropic" });
                    }
                } else {
                    const errData = await res.json().catch(() => ({}));
                    console.error("Anthropic API Error:", res.status, errData);
                }
            } catch (e) {
                console.error("Anthropic Fetch Exception:", e);
            }
        }

        // 4. DeepSeek Integration
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
                            { role: "system", content: TEDO_SYSTEM_PROMPT },
                            { role: "user", content: query },
                        ],
                        temperature: 0.3,
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

        // 5. Groq Integration
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
                            { role: "system", content: TEDO_SYSTEM_PROMPT },
                            { role: "user", content: query },
                        ],
                        temperature: 0.3,
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

        // 6. Diagnostics Fallback
        return NextResponse.json({
            reply: null,
            fallback: true,
            message: "No working external LLM key detected, using grounded local RAG fallback.",
        });
    } catch (error: any) {
        console.error("API Chat Route Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error", details: error.message },
            { status: 500 }
        );
    }
}
