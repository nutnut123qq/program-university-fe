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
        const groqKey = process.env.GROQ_API_KEY;

        // 1. If OpenAI API Key is present
        if (openAiKey) {
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
            }
        }

        // 2. If Gemini API Key is present
        if (geminiKey) {
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
            }
        }

        // 3. If Groq API Key is present
        if (groqKey) {
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
        }

        // 4. Default Grounded Fallback (when no LLM API key is configured)
        return NextResponse.json({
            reply: null,
            fallback: true,
            message: "No external LLM key detected, using local RAG knowledge fallback.",
        });
    } catch (error: any) {
        console.error("API Chat Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error", details: error.message },
            { status: 500 }
        );
    }
}
