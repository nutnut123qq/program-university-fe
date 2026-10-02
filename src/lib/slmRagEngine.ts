/**
 * Tedo Hybrid RAG Knowledge Retriever & Query Synthesizer
 * 1. Calls secure Serverless API Route (/api/chat) if LLM API Key is configured on Vercel.
 * 2. Seamlessly falls back to local grounded CSDL search if offline / no key.
 *
 * Client-side only — uses fetch() against /mock static files. No fs imports.
 */
import {
    AdmissionFile,
    admissionKindVi,
    detectAdmissionIntent,
    formatTuitionAmount,
    normalizeText,
    sourceDomain,
    tuitionBasisVi,
    AdmissionScore,
} from "./chat-admissions"

// ---------------------------------------------------------------------------
// University alias table (normalized phrases) — shared between matching and
// token-stripping when we extract the program-name part of a query.
// ---------------------------------------------------------------------------
const UNI_ALIASES: Record<string, string[]> = {
    HUST: ["bach khoa ha noi", "bach khoa hn", "hust"],
    HCMUT: ["bach khoa tphcm", "bach khoa hcm", "hcmut"],
    FPT: ["fpt"],
    FTU: ["ngoai thuong", "ftu"],
    NEU: ["kinh te quoc dan", "neu"],
    UIT: ["cntt dhqg", "uit"],
    UET: ["cong nghe dhqghn", "uet"],
    UEH: ["kinh te tphcm", "kinh te tp hcm", "ueh"],
    TDTU: ["ton duc thang", "tdtu"],
    DTU: ["duy tan", "dtu"],
    HCMUS: ["khoa hoc tu nhien", "hcmus"],
    VNU: ["dhqghn", "dai hoc quoc gia", "vnu"],
}

const ADMISSION_DISCLAIMER =
    "Số liệu từ snapshot hệ thống, chỉ mang tính tham khảo — hãy kiểm tra trang tuyển sinh chính thức của trường."

// Words that are never part of a program name in an admission question.
const ADMISSION_NOISE_TOKENS = new Set([
    "diem", "chuan", "san", "xet", "tuyen", "sinh", "dau", "vao", "trung", "nguong",
    "hoc", "phi", "tien", "chi", "tieu", "nganh", "truong", "dai", "ma", "so", "muc",
    "bao", "nhieu", "la", "gi", "nao", "cua", "va", "cho", "toi", "em", "minh", "ve",
    "o", "tai", "nhu", "the", "duoc", "can", "muon", "biet", "hay", "voi", "cac",
    "nhung", "mot", "nay", "do", "thi", "se", "da", "dang", "trong", "tu", "den",
    "hoi", "xin", "giup", "a", "oi", "vay", "ra", "sao", "ban", "chuyen", "co",
    "khong", "nam", "ap", "dung", "theo", "con", "ty", "le", "phan", "tram", "nhap",
    "ky", "ctdt", "dao", "tao", "chinh", "quy", "dh cq", "moi", "nhat", "cap", "nhat",
])

interface ProgramMeta {
    id: string
    name?: string | null
    code?: string | null
    universityId?: string
}

const admissionsMemCache = new Map<string, Promise<AdmissionFile | null>>()
const programMetaCache = new Map<string, Promise<ProgramMeta | null>>()

function fetchAdmissionsFile(code: string): Promise<AdmissionFile | null> {
    const safe = code.replace(/[^A-Za-z0-9_-]/g, "")
    if (!safe) return Promise.resolve(null)
    let cached = admissionsMemCache.get(safe)
    if (!cached) {
        cached = fetch(`/mock/admissions/${safe}.json`)
            .then((res) => (res.ok ? (res.json() as Promise<AdmissionFile>) : null))
            .catch(() => null)
        admissionsMemCache.set(safe, cached)
    }
    return cached
}

function fetchProgramMeta(id: string): Promise<ProgramMeta | null> {
    const safe = id.replace(/[^A-Za-z0-9_-]/g, "")
    if (!safe) return Promise.resolve(null)
    let cached = programMetaCache.get(safe)
    if (!cached) {
        cached = fetch(`/mock/programs-by-id/${safe}.json`)
            .then((res) => (res.ok ? (res.json() as Promise<ProgramMeta>) : null))
            .catch(() => null)
        programMetaCache.set(safe, cached)
    }
    return cached
}

function scopeLabel(s: { scope: string; scopeLabel: string | null }): string {
    return s.scope === "program" ? "" : ` (phạm vi ${s.scopeLabel ?? s.scope} — không riêng một ngành)`
}

/** Resolve the program the user asked about: programId → name via /mock/programs-by-id. */
async function matchAdmissionProgram(
    adm: AdmissionFile,
    programTokens: string[]
): Promise<ProgramMeta | null> {
    const ids = new Set<string>()
    for (const rows of [adm.scores ?? [], adm.quotas ?? [], adm.tuitions ?? []]) {
        for (const r of rows) if (r.programId) ids.add(r.programId)
    }
    const metas = (await Promise.all([...ids].map(fetchProgramMeta))).filter(
        (m): m is ProgramMeta => !!m && typeof m.name === "string" && !!m.name
    )
    const phrase = programTokens.join(" ")
    let best: ProgramMeta | null = null
    let bestScore = 0
    for (const meta of metas) {
        const normName = normalizeText(meta.name as string)
        let score = 0
        if (normName.includes(phrase)) {
            score = 100 + phrase.length
        } else {
            const nameToks = new Set(normName.split(" "))
            const hits = programTokens.filter((t) => nameToks.has(t)).length
            if (hits >= Math.min(2, programTokens.length)) score = (hits / programTokens.length) * 10
        }
        if (score > bestScore) {
            best = meta
            bestScore = score
        }
    }
    return best
}

function formatProgramAdmissions(
    adm: AdmissionFile,
    uniCode: string,
    uniName: string,
    prog: ProgramMeta,
    intent: { score: boolean; tuition: boolean; quota: boolean },
    years: string
): string {
    const pid = prog.id
    const scores = (adm.scores ?? []).filter((s) => s.programId === pid).slice(0, 6)
    const quotas = (adm.quotas ?? []).filter((q) => q.programId === pid).slice(0, 4)
    const ownTuitions = (adm.tuitions ?? []).filter((t) => t.programId === pid).slice(0, 4)
    const schoolTuitions = (adm.tuitions ?? []).filter((t) => t.programId === null).slice(0, 4)
    const lines: string[] = []

    if (intent.score) {
        if (scores.length > 0) {
            lines.push(`Điểm chuẩn/xét tuyển ${years} — ${prog.name} (${uniCode}):`)
            for (const s of scores) {
                lines.push(
                    `• ${admissionKindVi(s.kind)}: ${s.score}/${s.scale} (năm ${s.year})${scopeLabel(s)} — Nguồn: ${sourceDomain(s.sourceUrl)}`
                )
            }
        } else {
            lines.push(`Snapshot ${uniCode} không có số liệu điểm riêng cho ${prog.name}.`)
        }
    }
    if (intent.quota) {
        if (quotas.length > 0) {
            lines.push(`Chỉ tiêu ${years} — ${prog.name} (${uniCode}):`)
            for (const q of quotas) {
                lines.push(
                    `• ${q.quota} chỉ tiêu (năm ${q.year})${scopeLabel(q)} — Nguồn: ${sourceDomain(q.sourceUrl)}`
                )
            }
        } else {
            lines.push(`Snapshot ${uniCode} không có chỉ tiêu riêng cho ${prog.name}.`)
        }
    }
    if (intent.tuition) {
        const rows = ownTuitions.length > 0 ? ownTuitions : schoolTuitions
        if (rows.length > 0) {
            const note = ownTuitions.length === 0 ? " (mức áp dụng chung — trường không công bố riêng cho ngành này)" : ""
            lines.push(`Học phí — ${prog.name} (${uniCode})${note}:`)
            for (const t of rows) {
                const applies = t.appliesTo ? ` — ${t.appliesTo}` : ""
                const yr = t.academicYear ? `, năm học ${t.academicYear}` : ""
                lines.push(
                    `• ${formatTuitionAmount(t)}/${tuitionBasisVi(t.basis)}${yr}${applies} — Nguồn: ${sourceDomain(t.sourceUrl)}`
                )
            }
        } else {
            lines.push(`Snapshot ${uniCode} không có dữ liệu học phí cho ${prog.name}.`)
        }
    }
    lines.push(`(${uniName}) ${ADMISSION_DISCLAIMER}`)
    return lines.join("\n")
}

async function formatUniAdmissions(
    adm: AdmissionFile,
    uniCode: string,
    uniName: string,
    intent: { score: boolean; tuition: boolean; quota: boolean },
    years: string
): Promise<string> {
    const lines: string[] = [`Dữ liệu tuyển sinh ${years} — ${uniName} (${uniCode}):`]
    let added = false

    if (intent.score) {
        const rows = (adm.scores ?? []).filter((s) => s.scope === "program").slice(0, 8)
        const metas = await Promise.all(rows.map((s) => fetchProgramMeta(s.programId as string)))
        if (rows.length > 0) {
            added = true
            lines.push(`Điểm theo ngành ${years}:`)
            rows.forEach((s: AdmissionScore, i: number) => {
                const label = metas[i]?.name ?? `mã ${s.scopeLabel ?? s.programId}`
                lines.push(
                    `• ${label}: ${admissionKindVi(s.kind)} ${s.score}/${s.scale} (${s.year}) — Nguồn: ${sourceDomain(s.sourceUrl)}`
                )
            })
        }
        const ctx = (adm.scores ?? []).filter((s) => s.programId === null).slice(0, 4)
        if (ctx.length > 0) {
            added = true
            lines.push("Ngưỡng áp dụng chung (không riêng một ngành):")
            for (const s of ctx) {
                lines.push(
                    `• ${s.scopeLabel ?? "áp dụng chung"}: ${admissionKindVi(s.kind)} ${s.score}/${s.scale} (${s.year}) — Nguồn: ${sourceDomain(s.sourceUrl)}`
                )
            }
        }
    }
    if (intent.quota) {
        const rows = (adm.quotas ?? []).filter((q) => q.scope === "program").slice(0, 6)
        const ctx = (adm.quotas ?? []).filter((q) => q.programId === null).slice(0, 3)
        const metas = await Promise.all(rows.map((q) => fetchProgramMeta(q.programId as string)))
        if (rows.length > 0 || ctx.length > 0) {
            added = true
            lines.push(`Chỉ tiêu ${years}:`)
            rows.forEach((q, i) => {
                const label = metas[i]?.name ?? `mã ${q.scopeLabel ?? q.programId}`
                lines.push(`• ${label}: ${q.quota} chỉ tiêu (${q.year}) — Nguồn: ${sourceDomain(q.sourceUrl)}`)
            })
            for (const q of ctx) {
                lines.push(
                    `• ${q.scopeLabel ?? "áp dụng chung"}: ${q.quota} chỉ tiêu (${q.year}) — phạm vi ${q.scope} — Nguồn: ${sourceDomain(q.sourceUrl)}`
                )
            }
        }
    }
    if (intent.tuition) {
        const all = adm.tuitions ?? []
        const rows = [...all.filter((t) => t.programId === null), ...all.filter((t) => t.programId !== null)].slice(0, 6)
        if (rows.length > 0) {
            added = true
            lines.push("Học phí:")
            for (const t of rows) {
                const label = t.appliesTo ?? "Học phí"
                const yr = t.academicYear ? `, năm học ${t.academicYear}` : ""
                lines.push(
                    `• ${label}: ${formatTuitionAmount(t)}/${tuitionBasisVi(t.basis)}${yr} — Nguồn: ${sourceDomain(t.sourceUrl)}`
                )
            }
        }
    }
    if (!added) return `Chưa có dữ liệu tuyển sinh cho mục bạn hỏi tại ${uniName} (${uniCode}) trong snapshot.\n${ADMISSION_DISCLAIMER}`
    lines.push(ADMISSION_DISCLAIMER)
    return lines.join("\n")
}

async function answerAdmissions(
    normQuery: string,
    intent: { score: boolean; tuition: boolean; quota: boolean },
    matchedUni: { code?: string; name?: string } | undefined,
    universities: Array<{ code?: string }>
): Promise<string> {
    if (!matchedUni) {
        const codes = universities.map((u) => u.code).filter(Boolean).join(", ")
        return `Chưa có dữ liệu tuyển sinh cho trường/ngành bạn hỏi trong snapshot hệ thống. Hiện có dữ liệu điểm chuẩn/học phí/chỉ tiêu cho các trường: ${codes}.\n${ADMISSION_DISCLAIMER}`
    }
    const uniCode = String(matchedUni.code ?? "").toUpperCase()
    const uniName = String(matchedUni.name ?? uniCode)
    const adm = await fetchAdmissionsFile(uniCode)
    const hasRows =
        adm && ((adm.scores?.length ?? 0) > 0 || (adm.quotas?.length ?? 0) > 0 || (adm.tuitions?.length ?? 0) > 0)
    if (!adm || !hasRows) {
        return `Chưa có dữ liệu tuyển sinh cho ${uniName} (${uniCode}) trong snapshot hệ thống.\n${ADMISSION_DISCLAIMER}`
    }
    const years = Array.isArray(adm.years) && adm.years.length ? adm.years.join("/") : ""

    // Strip university tokens + intent words; what remains is the program name.
    const uniTokens = new Set(normalizeText(uniName).split(" ").filter(Boolean))
    uniTokens.add(normalizeText(uniCode))
    for (const alias of UNI_ALIASES[uniCode] ?? []) {
        for (const t of normalizeText(alias).split(" ")) uniTokens.add(t)
    }
    const programTokens = normQuery
        .split(" ")
        .filter((t) => t && !ADMISSION_NOISE_TOKENS.has(t) && !uniTokens.has(t) && !/^\d{4}$/.test(t))

    if (programTokens.length > 0) {
        const prog = await matchAdmissionProgram(adm, programTokens)
        if (!prog) {
            return `Chưa có dữ liệu tuyển sinh cho "${programTokens.join(" ")}" tại ${uniName} (${uniCode}) trong snapshot.\n${ADMISSION_DISCLAIMER}`
        }
        return formatProgramAdmissions(adm, uniCode, uniName, prog, intent, years)
    }
    return formatUniAdmissions(adm, uniCode, uniName, intent, years)
}

export async function querySlmRag(userQuery: string, history?: Array<{role: string, content: string}>): Promise<string> {
    const q = userQuery.trim()
    if (!q) return "Xin chào! Bạn có thể đặt câu hỏi về ngành học, môn học, tín chỉ hoặc quy định đào tạo của các trường đại học."

    // 1. Attempt Serverless LLM Call (/api/chat)
    try {
        const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: [...(history || []), { role: 'user', content: q }] }),
        })

        if (res.ok) {
            const data = await res.json()
            if (data.reply && typeof data.reply === "string") {
                return data.reply
            }
        }
    } catch (e) {
        // Fall through to local RAG knowledge fallback
    }

    // 2. Grounded Local RAG Knowledge Search
    try {
        const [uniRes, indexRes] = await Promise.all([
            fetch("/mock/universities.json"),
            fetch("/mock/index.json")
        ])

        const universities: Array<{ code?: string; name?: string }> = uniRes.ok ? await uniRes.json() : []
        const indexData: { totalCount?: number } = indexRes.ok ? await indexRes.json() : {}

        const qLower = q.toLowerCase()
        const normQuery = normalizeText(q)

        // Detect University in Query
        const matchedUni = universities.find(u =>
            (u.code && qLower.includes(u.code.toLowerCase())) ||
            (u.name && qLower.includes(u.name.toLowerCase())) ||
            (u.code === "HUST" && (qLower.includes("bách khoa hà nội") || qLower.includes("bách khoa hn") || qLower.includes("hust"))) ||
            (u.code === "HCMUT" && (qLower.includes("bách khoa tphcm") || qLower.includes("bách khoa hcm") || qLower.includes("hcmut"))) ||
            (u.code === "FPT" && qLower.includes("fpt")) ||
            (u.code === "FTU" && (qLower.includes("ngoại thương") || qLower.includes("ftu"))) ||
            (u.code === "NEU" && (qLower.includes("kinh tế quốc dân") || qLower.includes("neu"))) ||
            (u.code === "UIT" && (qLower.includes("cntt đhqg") || qLower.includes("uit"))) ||
            (u.code === "UET" && (qLower.includes("công nghệ đhqghn") || qLower.includes("uet"))) ||
            (u.code === "UEH" && (qLower.includes("kinh tế tp.hcm") || qLower.includes("ueh"))) ||
            (u.code === "TDTU" && (qLower.includes("tôn đức thắng") || qLower.includes("tdtu"))) ||
            (u.code === "DTU" && (qLower.includes("duy tân") || qLower.includes("dtu"))) ||
            (u.code === "HCMUS" && (qLower.includes("khoa học tự nhiên") || qLower.includes("hcmus"))) ||
            (u.code === "VNU" && (qLower.includes("đhqghn") || qLower.includes("vnu")))
        ) ?? universities.find(u =>
            (UNI_ALIASES[u.code ?? ""] ?? []).some((a: string) => normQuery.includes(a)) ||
            normQuery.includes(normalizeText(u.name ?? ""))
        )

        // Admission intent (điểm chuẩn / học phí / chỉ tiêu / tuyển sinh) → real
        // snapshot data from /mock/admissions/<CODE>.json. Never fabricate numbers.
        const admissionIntent = detectAdmissionIntent(normQuery)
        if (admissionIntent.any) {
            return await answerAdmissions(normQuery, admissionIntent, matchedUni, universities)
        }

        // Case A: Query about "triết" / "mác" / "chính trị" / "đại cương"
        if (qLower.includes("triết") || qLower.includes("mác") || qLower.includes("tư tưởng") || qLower.includes("chính trị") || qLower.includes("pháp luật")) {
            const targetUniName = matchedUni ? matchedUni.name : "ĐH FPT và các trường đại học tại Việt Nam"
            return `Theo quy định đào tạo của Bộ GD&ĐT tại ${targetUniName}:\n\nSinh viên bậc Cử nhân/Kỹ sư bắt buộc phải học các môn Lý luận Chính trị & Đại cương, bao gồm:\n- Triết học Mác - Lênin (3 tín chỉ)\n- Kinh tế chính trị Mác - Lênin (2 tín chỉ)\n- Chủ nghĩa xã hội khoa học (2 tín chỉ)\n- Tư tưởng Hồ Chí Minh (2 tín chỉ)\n- Lịch sử Đảng Cộng sản Việt Nam (2 tín chỉ)\n\nCác môn này thường được bố trí trong Học kỳ 1 và Học kỳ 2.`
        }

        const uniText = matchedUni ? `tại ${matchedUni.name} (${matchedUni.code})` : "của các trường đại học"
        const dataScope = typeof indexData?.totalCount === "number"
            ? ` (${indexData.totalCount.toLocaleString("vi-VN")} chương trình)`
            : ""
        return `Dữ liệu chương trình đào tạo ${uniText}${dataScope} đã được chuẩn hóa theo 4 khối kiến thức: Đại cương, Cơ sở ngành, Chuyên ngành và Tốt nghiệp.\n\nBạn có thể tìm kiếm tên ngành cụ thể trên trang Danh mục để xem chi tiết từng học phần.`
    } catch (e) {
        return "Hệ thống đang truy xuất thông tin. Bạn có thể tra cứu trực tiếp trên danh mục ngành học."
    }
}
