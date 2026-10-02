/**
 * Shared admission-snapshot helpers for chat (server retrieval + client fallback).
 *
 * Pure functions / types only — no fs, no fetch — safe to import from both
 * server code (chat-retrieval.ts) and client code (slmRagEngine.ts).
 * Data contract: public/mock/admissions/<UNI>.json (SPEC-ADMISSION-DATA §3).
 */

export interface AdmissionScore {
    programId: string | null;
    year: number;
    method: string;
    methodLabel: string | null;
    scope: string; // "program" | "group" | "school" | "campus"
    scopeLabel: string | null;
    score: number;
    scale: number;
    kind: string; // "cutoff" | "floor" | "converted"
    comboNote: string | null;
    sourceUrl: string | null;
    publishedAt: string | null;
}

export interface AdmissionQuota {
    programId: string | null;
    year: number;
    scope: string;
    scopeLabel: string | null;
    quota: number;
    methodSplit: Record<string, number> | null;
    sourceUrl: string | null;
    publishedAt: string | null;
}

export interface TuitionRecord {
    programId: string | null;
    academicYear: string | null;
    amount: number | null;
    minAmount: number | null;
    maxAmount: number | null;
    currency: string;
    basis: string; // "per_credit" | "per_semester" | "per_year" | "per_program"
    appliesTo: string | null;
    notes: string | null;
    sourceUrl: string | null;
    publishedAt: string | null;
}

export interface AdmissionFile {
    university: string;
    generatedAt?: string;
    years: number[];
    scores: AdmissionScore[];
    quotas: AdmissionQuota[];
    tuitions: TuitionRecord[];
    coverage?: { matchedPrograms?: number; unmatched?: number; dataTypes?: string[] };
}

/** Lowercase, strip Vietnamese diacritics (NFD + combining marks, đ→d), collapse non-alphanumerics. */
export function normalizeText(input: string): string {
    return input
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

export interface AdmissionIntent {
    /** điểm chuẩn / điểm sàn / đầu vào / trúng tuyển / điểm xét */
    score: boolean;
    /** học phí / tiền học / chi phí */
    tuition: boolean;
    /** chỉ tiêu */
    quota: boolean;
    /** "tuyển sinh" chung chung → all three */
    general: boolean;
    any: boolean;
}

function hasPhrase(normQuery: string, phrase: string): boolean {
    return ` ${normQuery} `.includes(` ${phrase} `);
}

/** Detect admission-data intent on a normalized (diacritic-free) query. */
export function detectAdmissionIntent(normQuery: string): AdmissionIntent {
    const score =
        hasPhrase(normQuery, "diem chuan") ||
        hasPhrase(normQuery, "diem san") ||
        hasPhrase(normQuery, "diem xet") ||
        hasPhrase(normQuery, "trung tuyen") ||
        hasPhrase(normQuery, "dau vao") ||
        hasPhrase(normQuery, "nguong dau vao") ||
        hasPhrase(normQuery, "diem");
    const tuition =
        hasPhrase(normQuery, "hoc phi") ||
        hasPhrase(normQuery, "tien hoc") ||
        hasPhrase(normQuery, "chi phi");
    const quota = hasPhrase(normQuery, "chi tieu");
    const general = hasPhrase(normQuery, "tuyen sinh");
    const any = score || tuition || quota || general;
    return {
        score: score || general,
        tuition: tuition || general,
        quota: quota || general,
        general,
        any,
    };
}

export function admissionKindVi(kind: string): string {
    switch (kind) {
        case "cutoff":
            return "điểm chuẩn";
        case "floor":
            return "điểm sàn (ngưỡng đầu vào)";
        case "converted":
            return "điểm quy đổi tương đương";
        default:
            return kind || "điểm";
    }
}

export function admissionScopeVi(scope: string): string {
    switch (scope) {
        case "program":
            return "theo ngành";
        case "group":
            return "theo nhóm ngành";
        case "school":
            return "toàn trường";
        case "campus":
            return "theo cơ sở";
        default:
            return scope || "không rõ phạm vi";
    }
}

export function tuitionBasisVi(basis: string): string {
    switch (basis) {
        case "per_year":
            return "năm";
        case "per_semester":
            return "học kỳ";
        case "per_credit":
            return "tín chỉ";
        case "per_program":
            return "toàn chương trình";
        case "per_month":
            return "tháng";
        default:
            return basis || "kỳ";
    }
}

/** Extract host (sans www.) from a source URL for a compact "Nguồn:" citation. */
export function sourceDomain(url: string | null | undefined): string {
    if (!url) return "không rõ nguồn";
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

/** VND amount → compact Vietnamese text: 18_000_000 → "18 triệu đồng", 500_000 → "500.000 đồng". */
export function formatMoneyVnd(amount: number): string {
    if (amount >= 1_000_000) {
        const m = amount / 1_000_000;
        const txt = Number.isInteger(m)
            ? String(m)
            : m.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
        return `${txt} triệu đồng`;
    }
    return `${amount.toLocaleString("vi-VN")} đồng`;
}

export function formatTuitionAmount(t: TuitionRecord): string {
    if (typeof t.amount === "number") return formatMoneyVnd(t.amount);
    if (typeof t.minAmount === "number" && typeof t.maxAmount === "number") {
        return `${formatMoneyVnd(t.minAmount)} – ${formatMoneyVnd(t.maxAmount)}`;
    }
    if (typeof t.minAmount === "number") return `từ ${formatMoneyVnd(t.minAmount)}`;
    if (typeof t.maxAmount === "number") return `tối đa ${formatMoneyVnd(t.maxAmount)}`;
    return "không rõ mức";
}

/** Scope note appended when a row does not belong to a single program. */
export function scopeNote(scope: string): string {
    if (scope === "program") return "";
    return ` (phạm vi ${admissionScopeVi(scope)}, không riêng một ngành)`;
}

/** "- <label>: <kind> <score>/<scale>, năm <year><scope note>. Nguồn: <domain>" */
export function formatScoreLine(s: AdmissionScore, label: string): string {
    return `- ${label}: ${admissionKindVi(s.kind)} ${s.score}/${s.scale}, năm ${s.year}${scopeNote(s.scope)}. Nguồn: ${sourceDomain(s.sourceUrl)}`;
}

/** "- <label>: chỉ tiêu <n>, năm <year><scope note>. Nguồn: <domain>" */
export function formatQuotaLine(q: AdmissionQuota, label: string): string {
    return `- ${label}: chỉ tiêu ${q.quota}, năm ${q.year}${scopeNote(q.scope)}. Nguồn: ${sourceDomain(q.sourceUrl)}`;
}

/** "- <label>: <amount>/<basis>, năm học <academicYear><appliesTo>. Nguồn: <domain>" */
export function formatTuitionLine(t: TuitionRecord, label: string): string {
    const applies = t.appliesTo && t.appliesTo !== label ? ` — áp dụng: ${t.appliesTo}` : "";
    const year = t.academicYear ? `, năm học ${t.academicYear}` : "";
    return `- ${label}: ${formatTuitionAmount(t)}/${tuitionBasisVi(t.basis)}${year}${applies}. Nguồn: ${sourceDomain(
        t.sourceUrl
    )}`;
}
