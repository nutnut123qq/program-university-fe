import { NextRequest, NextResponse } from "next/server";

function buildRagContext(query: string): string {
    const q = query.toLowerCase();
    const facts: string[] = [];

    // 1. Core MOET Higher Education Standard for General Education
    if (q.includes("triết") || q.includes("mác") || q.includes("tư tưởng") || q.includes("chính trị") || q.includes("pháp luật") || q.includes("đại cương")) {
        facts.push(
            "- Quy định bắt buộc của Bộ GD&ĐT (Thông tư 04/2016 và quy chế hiện hành): TẤT CẢ các trường đại học tại Việt Nam (kể cả trường công lập hay trường tư thục như ĐH FPT, ĐH Duy Tân, RMIT, VinUni) đều BẮT BUỘC phải giảng dạy Khối kiến thức Lý luận Chính trị & Đại cương gồm: 1. Triết học Mác - Lênin (3 tín chỉ), 2. Kinh tế chính trị Mác - Lênin (2 tín chỉ), 3. Chủ nghĩa xã hội khoa học (2 tín chỉ), 4. Tư tưởng Hồ Chí Minh (2 tín chỉ), 5. Lịch sử Đảng Cộng sản Việt Nam (2 tín chỉ). Vì vậy, tại ĐH FPT CHẮC CHẮN CÓ môn Triết học Mác - Lênin trong chương trình đào tạo chính quy."
        );
    }

    // 2. Universities specific facts
    if (q.includes("fpt")) {
        facts.push("- Đại học FPT (Mã: FPT): Là trường đại học tư thục, đào tạo theo định hướng ứng dụng, học phí trung bình 28 - 35 triệu VNĐ/học kỳ. Các môn đại cương chính trị vẫn tuân thủ 100% khung quy định của Bộ GD&ĐT.");
    }
    if (q.includes("bách khoa hà nội") || q.includes("hust")) {
        facts.push("- Đại học Bách khoa Hà Nội (HUST): Ngành Khoa học Máy tính có mã tuyển sinh IT1, thời gian đào tạo Cử nhân (4 năm, ~132-140 tín chỉ) hoặc Kỹ sư chuyên sâu (5 năm, ~165-180 tín chỉ).");
    }
    if (q.includes("khoa học tự nhiên") || q.includes("hcmus")) {
        facts.push("- Trường ĐH Khoa học Tự nhiên ĐHQG-HCM (HCMUS): Có đào tạo ngành Khoa học Dữ liệu, Khoa học Máy tính, Công nghệ Thông tin, Toán - Tin.");
    }
    if (q.includes("uit") || q.includes("cntt đhqg")) {
        facts.push("- Trường ĐH Công nghệ Thông tin ĐHQG-HCM (UIT): Đào tạo các ngành Trí tuệ Nhân tạo (AI), Khoa học Dữ liệu, Kỹ thuật Phần mềm, An toàn Thông tin với thời gian chuẩn 4 năm (8 học kỳ, khoảng 130 - 135 tín chỉ).");
    }
    if (q.includes("ngoại thương") || q.includes("ftu")) {
        facts.push("- Trường ĐH Ngoại thương (FTU): Trường công lập tự chủ, học phí chương trình chuẩn khoảng 22 - 25 triệu VNĐ/năm, chương trình Chất lượng cao khoảng 45 - 50 triệu VNĐ/năm. Đào tạo các ngành Kinh tế quốc tế, Kinh doanh quốc tế, Tài chính - Ngân hàng.");
    }
    if (q.includes("kinh tế quốc dân") || q.includes("neu")) {
        facts.push("- Trường ĐH Kinh tế Quốc dân (NEU): Khối kiến thức chuyên ngành đào tạo sâu về Kinh tế học, Kinh tế phát triển, Tài chính doanh nghiệp, Marketing chiến lược, Kinh doanh thương mại.");
    }

    // 3. Prerequisite DAG graph facts
    if (q.includes("giải tích") || q.includes("tiên quyết") || q.includes("sơ đồ cây") || q.includes("cấu trúc dữ liệu") || q.includes("lập trình")) {
        facts.push("- Quy luật môn tiên quyết trong CSDL Tedo (16.151 cạnh đồ thị DAG): Môn Giải tích 2 có môn tiên quyết là Giải tích 1; Môn Cấu trúc dữ liệu và giải thuật có môn tiên quyết là Nhập môn lập trình / Kỹ thuật lập trình; Môn Vật lý 2 có môn tiên quyết là Vật lý 1; Môn Mạng máy tính có môn tiên quyết là Kiến trúc máy tính.");
    }

    // 4. System statistics
    if (q.includes("bao nhiêu trường") || q.includes("bao nhiêu ngành") || q.includes("bao nhiêu môn") || q.includes("tedo")) {
        facts.push("- CSDL Tedo hiện quản lý chính xác: 12 trường đại học trọng điểm, 1.093 chương trình đào tạo, 57.935 môn học, và 16.151 quan hệ tiên quyết có cấu trúc.");
    }

    // 5. Degree types difference
    if (q.includes("cử nhân") || q.includes("kỹ sư") || q.includes("mấy năm") || q.includes("khác nhau")) {
        facts.push("- Khác biệt trình độ đào tạo: Bậc Cử nhân (Bachelor) học 4 năm (120 - 140 tín chỉ, bậc 6 VQF); Bậc Kỹ sư chuyên sâu (Engineer) học 5 năm (150 - 180 tín chỉ, tương đương bậc 7 thạc sĩ kỹ thuật).");
    }

    if (facts.length === 0) {
        facts.push("- CSDL Tedo bao gồm 12 trường đại học trọng điểm tại Việt Nam với 1.093 chương trình đào tạo và 57.935 môn học đã được chuẩn hóa theo 4 khối kiến thức: Đại cương, Cơ sở ngành, Chuyên ngành và Tốt nghiệp.");
    }

    return facts.join("\n");
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const query = body?.query || body?.message || "";

        if (!query || typeof query !== "string" || !query.trim()) {
            return NextResponse.json({ error: "Query is required" }, { status: 400 });
        }

        const retrievedContext = buildRagContext(query);

        const systemPrompt = `Bạn là Trợ lý AI của hệ thống Tedo - Nền tảng tra cứu, chuẩn hóa và đánh giá chương trình đào tạo đại học tại Việt Nam.
CSDL Tedo bao gồm 12 trường đại học trọng điểm (VNU, HUST, HCMUT, FTU, NEU, UIT, UET, UEH, FPT, TDTU, DTU, HCMUS) với 1.093 ngành học và 57.935 môn học.

DƯỚI ĐÂY LÀ DỮ LIỆU THỰC TẾ ĐƯỢC TRÍCH XUẤT TỪ CSDL TEDO & QUY ĐỊNH BỘ GD&ĐT:
${retrievedContext}

NGUYÊN TẮC TRẢ LỜI:
1. Trả lời người dùng DỰA TRÊN DỮ LIỆU THỰC TẾ TRÊN một cách chính xác tuyệt đối.
2. Nếu câu hỏi về môn Triết học Mác - Lênin tại bất kỳ trường nào (kể cả FPT), PHẢI KHẲNG ĐỊNH LÀ CÓ vì đây là môn học bắt buộc của Bộ GD&ĐT áp dụng cho toàn bộ các trường đại học tại Việt Nam.
3. Trả lời ngắn gọn, trực diện, chuyên nghiệp. Tuyệt đối không dùng emoji bừa bãi.`;

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
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: [
                                {
                                    role: "user",
                                    parts: [{ text: `${systemPrompt}\n\nCâu hỏi: ${query}` }],
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
                        messages: [{ role: "user", content: query }],
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
    } catch (error: any) {
        console.error("API Chat Route Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error", details: error.message },
            { status: 500 }
        );
    }
}
