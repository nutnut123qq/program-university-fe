/**
 * Server-side retrieval over the local mock dataset (public/mock) for the chat API.
 *
 * Simple lexical retrieval: Vietnamese diacritic-insensitive token matching with
 * IDF weighting over program names, plus university code/name matching.
 * No external dependencies; data is loaded once per server process and cached.
 */
import { readFile } from "fs/promises";
import path from "path";
import {
    AdmissionFile,
    detectAdmissionIntent,
    AdmissionIntent,
    formatQuotaLine,
    formatScoreLine,
    formatTuitionLine,
    normalizeText,
} from "./chat-admissions";

export { normalizeText };

const MOCK_DIR = path.join(process.cwd(), "public", "mock");

const MAX_CONTEXT_CHARS = 6000;
const TOP_PROGRAMS = 5;
const PROGRAMS_WITH_CURRICULUM = 3;
const MAX_COURSES_PER_PROGRAM = 40;

interface MockIndex {
    totalCount?: number;
    totalCourses?: number;
    totalPrerequisiteEdges?: number;
    chunks?: string[];
}

interface University {
    id: string;
    code: string;
    name: string;
    website?: string | null;
    region?: string | null;
}

interface Program {
    id: string;
    universityId: string;
    universityName?: string | null;
    name: string;
    code?: string | null;
    degreeType?: string | null;
    credits?: number | null;
    duration?: string | null;
    tuition?: string | null;
    language?: string | null;
    formOfStudy?: string | null;
    sourceUrl?: string | null;
    courseCount?: number | null;
    evaluationScore?: number | null;
}

interface CurriculumCourse {
    courseCode?: string | null;
    courseName?: string | null;
    credits?: number | null;
    semester?: number | null;
    knowledgeBlock?: string | null;
}

interface IndexedProgram {
    program: Program;
    nameTokens: Set<string>;
    normName: string;
}

interface IndexedUniversity {
    uni: University;
    code: string;
    coreTokens: string[];
    corePhrase: string;
}

interface Dataset {
    index: MockIndex;
    universities: IndexedUniversity[];
    programs: IndexedProgram[];
    idf: Map<string, number>;
    totalCourses: number;
}

export interface RetrievalResult {
    context: string;
    matchedProgramIds: string[];
    matchedUniversityCodes: string[];
}



function tokenize(input: string): string[] {
    const n = normalizeText(input);
    return n ? n.split(" ") : [];
}

// Very common words in questions / names that carry little retrieval signal.
const STOPWORDS = new Set([
    "truong", "dai", "hoc", "nganh", "mon", "chuong", "trinh", "dao", "tao", "ctdt",
    "co", "khong", "la", "gi", "nao", "bao", "nhieu", "cua", "va", "cho", "toi", "em",
    "minh", "ve", "o", "tai", "nhu", "the", "duoc", "can", "muon", "biet", "hay", "voi",
    "cac", "nhung", "mot", "nay", "do", "thi", "se", "da", "dang", "trong", "tu", "den",
    "hoi", "xin", "giup", "a", "oi", "vay", "ra", "sao", "ban", "chuyen",
]);

const UNI_NAME_PREFIXES = ["truong dai hoc", "dai hoc"];

let datasetPromise: Promise<Dataset> | null = null;

async function readJson<T>(...segments: string[]): Promise<T> {
    const raw = await readFile(path.join(MOCK_DIR, ...segments), "utf8");
    return JSON.parse(raw) as T;
}

async function buildDataset(): Promise<Dataset> {
    const [index, universities] = await Promise.all([
        readJson<MockIndex>("index.json"),
        readJson<University[]>("universities.json"),
    ]);

    const chunks = Array.isArray(index.chunks) ? index.chunks : [];
    const pages = await Promise.all(
        chunks.map(async (chunk) => {
            const safe = path.basename(chunk);
            const data = await readJson<Program[] | { items?: Program[] }>("programs", safe);
            return Array.isArray(data) ? data : data.items ?? [];
        })
    );

    const seen = new Set<string>();
    const programs: IndexedProgram[] = [];
    const df = new Map<string, number>();
    let totalCourses = 0;
    for (const page of pages) {
        for (const p of page) {
            if (!p || typeof p.id !== "string" || seen.has(p.id)) continue;
            seen.add(p.id);
            totalCourses += typeof p.courseCount === "number" ? p.courseCount : 0;
            const normName = normalizeText(p.name ?? "");
            const nameTokens = new Set(normName.split(" ").filter(Boolean));
            for (const t of nameTokens) df.set(t, (df.get(t) ?? 0) + 1);
            programs.push({ program: p, nameTokens, normName });
        }
    }

    const n = Math.max(programs.length, 1);
    const idf = new Map<string, number>();
    for (const [t, count] of df) idf.set(t, Math.log(1 + n / count));

    const indexedUnis: IndexedUniversity[] = universities.map((uni) => {
        let core = normalizeText(uni.name ?? "");
        for (const prefix of UNI_NAME_PREFIXES) {
            if (core.startsWith(prefix + " ")) {
                core = core.slice(prefix.length + 1);
                break;
            }
        }
        return {
            uni,
            code: normalizeText(uni.code ?? ""),
            coreTokens: core.split(" ").filter(Boolean),
            corePhrase: core,
        };
    });

    return { index, universities: indexedUnis, programs, idf, totalCourses };
}

function getDataset(): Promise<Dataset> {
    if (!datasetPromise) {
        datasetPromise = buildDataset().catch((err: unknown) => {
            datasetPromise = null; // allow retry on next request
            throw err;
        });
    }
    return datasetPromise;
}

/** Returns matched universities with the tokens they consumed from the query. */
function matchUniversities(
    unis: IndexedUniversity[],
    queryTokens: string[],
    normQuery: string
): { matches: IndexedUniversity[]; consumed: Set<string> } {
    const qset = new Set(queryTokens);
    const scored: Array<{ u: IndexedUniversity; score: number; tokens: string[] }> = [];
    for (const u of unis) {
        if (u.code && qset.has(u.code)) {
            scored.push({ u, score: 1, tokens: [u.code] });
            continue;
        }
        if (u.corePhrase && ` ${normQuery} `.includes(` ${u.corePhrase} `)) {
            scored.push({ u, score: 1, tokens: u.coreTokens });
            continue;
        }
        const hit = u.coreTokens.filter((t) => qset.has(t));
        const ratio = u.coreTokens.length ? hit.length / u.coreTokens.length : 0;
        if (hit.length >= 2 && ratio >= 0.75) scored.push({ u, score: ratio, tokens: hit });
    }
    if (scored.length === 0) return { matches: [], consumed: new Set() };
    const best = Math.max(...scored.map((s) => s.score));
    const top = scored.filter((s) => s.score === best);
    const consumed = new Set<string>();
    for (const s of top) for (const t of s.tokens) consumed.add(t);
    return { matches: top.map((s) => s.u), consumed };
}

function scorePrograms(
    ds: Dataset,
    contentTokens: string[],
    uniIds: Set<string>
): Array<{ ip: IndexedProgram; score: number }> {
    const bigrams: string[] = [];
    for (let i = 0; i + 1 < contentTokens.length; i++) {
        bigrams.push(`${contentTokens[i]} ${contentTokens[i + 1]}`);
    }
    const results: Array<{ ip: IndexedProgram; score: number }> = [];
    for (const ip of ds.programs) {
        const inUni = uniIds.has(ip.program.universityId);
        if (uniIds.size > 0 && !inUni) continue;
        let score = 0;
        for (const t of contentTokens) {
            if (ip.nameTokens.has(t)) score += ds.idf.get(t) ?? 0;
        }
        const padded = ` ${ip.normName} `;
        for (const b of bigrams) {
            if (padded.includes(` ${b} `)) score += 1.5;
        }
        if (contentTokens.length > 0 && score === 0 && !inUni) continue;
        if (inUni) score += 0.01; // keep university-only matches (e.g. "học phí FPT")
        if (score > 0) results.push({ ip, score });
    }
    // If some programs matched the query terms, drop university-only filler matches.
    const UNI_ONLY = 0.01;
    if (results.some((r) => r.score > UNI_ONLY)) {
        for (let i = results.length - 1; i >= 0; i--) {
            if (results[i].score <= UNI_ONLY) results.splice(i, 1);
        }
    }
    results.sort(
        (a, b) =>
            b.score - a.score ||
            a.ip.normName.length - b.ip.normName.length ||
            a.ip.program.name.localeCompare(b.ip.program.name)
    );
    return results;
}

function sourceOf(p: Program): string {
    const uni = p.universityName ?? "không rõ trường";
    return p.sourceUrl ? `${p.name} — ${uni} — ${p.sourceUrl}` : `${p.name} — ${uni}`;
}

function describeProgram(p: Program): string {
    const parts: string[] = [];
    if (p.degreeType) parts.push(`Bậc: ${p.degreeType}`);
    if (typeof p.credits === "number") parts.push(`Tổng tín chỉ: ${p.credits}`);
    if (p.duration) parts.push(`Thời gian: ${p.duration}`);
    if (typeof p.courseCount === "number") parts.push(`Số môn trong dữ liệu: ${p.courseCount}`);
    if (p.formOfStudy) parts.push(`Hình thức: ${p.formOfStudy}`);
    if (p.language) parts.push(`Ngôn ngữ: ${p.language}`);
    parts.push(`Học phí: ${p.tuition ? p.tuition : "không có trong dữ liệu"}`);
    if (typeof p.evaluationScore === "number") parts.push(`Điểm SLM tham khảo (đánh giá tự động, chưa hiệu chuẩn chuyên gia): ${p.evaluationScore}`);
    return `- Chương trình "${p.name}" (${p.universityName ?? "không rõ trường"}). ${parts.join("; ")}.\n  Nguồn: ${sourceOf(p)}`;
}

async function loadCurriculum(programId: string): Promise<CurriculumCourse[]> {
    // programId comes from our own dataset, but sanitize anyway to avoid path traversal.
    if (!/^[A-Za-z0-9-]+$/.test(programId)) return [];
    try {
        const data = await readJson<unknown>("curricula", `${programId}.json`);
        return Array.isArray(data) ? (data as CurriculumCourse[]) : [];
    } catch {
        return [];
    }
}

function formatCurriculum(p: Program, courses: CurriculumCourse[], queryTokens: Set<string>): string {
    // Courses matching query tokens first, then by semester.
    const ranked = courses
        .map((c) => {
            const toks = tokenize(`${c.courseName ?? ""} ${c.courseCode ?? ""}`);
            const hits = toks.filter((t) => queryTokens.has(t)).length;
            return { c, hits };
        })
        .sort(
            (a, b) =>
                b.hits - a.hits ||
                (a.c.semester ?? 99) - (b.c.semester ?? 99)
        );
    const shown = ranked.slice(0, MAX_COURSES_PER_PROGRAM);
    const lines = shown.map(({ c }) => {
        const credits = typeof c.credits === "number" ? `${c.credits} TC` : "? TC";
        return `  ${c.courseCode ?? "-"} | ${c.courseName ?? "-"} | ${credits} | ${c.knowledgeBlock ?? "-"}`;
    });
    const header = `- Danh sách môn của "${p.name}" (${p.universityName ?? "không rõ trường"}), hiển thị ${shown.length}/${courses.length} môn (mã | tên | tín chỉ | khối kiến thức). Nguồn: ${sourceOf(p)}`;
    return [header, ...lines].join("\n");
}

function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    const cut = text.slice(0, Math.max(max - 20, 0));
    const lastNl = cut.lastIndexOf("\n");
    return (lastNl > max * 0.5 ? cut.slice(0, lastNl) : cut) + "\n  …(đã rút gọn)";
}

// ---------------------------------------------------------------------------
// Admission snapshots: public/mock/admissions/<CODE>.json — lazy per-university
// load, cached like the main dataset. 404/missing file → null ("no data").
// ---------------------------------------------------------------------------

const ADMISSION_PROGRAM_ROWS = 10;
const ADMISSION_CONTEXT_ROWS = 8;
const ADMISSION_OTHER_ROWS = 8;

const admissionsCache = new Map<string, Promise<AdmissionFile | null>>();

function loadAdmissions(code: string): Promise<AdmissionFile | null> {
    const safe = code.replace(/[^A-Za-z0-9_-]/g, "");
    if (!safe) return Promise.resolve(null);
    let cached = admissionsCache.get(safe);
    if (!cached) {
        cached = readJson<AdmissionFile>("admissions", `${safe}.json`).catch(() => null);
        admissionsCache.set(safe, cached);
    }
    return cached;
}

/**
 * Builds the "DỮ LIỆU TUYỂN SINH" context block for one university.
 * - wantedIds non-null: only rows bound to the programs matched earlier.
 * - wantedIds null (university-only question): up to ~10 program-scope rows
 *   plus context rows (programId=null, clearly labeled as school/group scope).
 */
function buildAdmissionSection(
    adm: AdmissionFile,
    uniCode: string,
    wantedIds: Set<string> | null,
    intent: AdmissionIntent,
    programNameById: Map<string, string>
): string {
    const years = Array.isArray(adm.years) && adm.years.length ? adm.years.join("/") : "không rõ năm";
    const lines: string[] = [
        `DỮ LIỆU TUYỂN SINH ${years} (${uniCode}) — snapshot trong hệ thống, chỉ mang tính tham khảo:`,
    ];
    const labelOf = (programId: string | null, scopeLabel: string | null): string => {
        if (programId) return programNameById.get(programId) ?? `mã ${scopeLabel ?? programId}`;
        return scopeLabel ?? "áp dụng chung";
    };
    const pick = <T extends { programId: string | null }>(rows: T[] | undefined, programCap: number): T[] => {
        const all = Array.isArray(rows) ? rows : [];
        if (wantedIds) return all.filter((r) => r.programId !== null && wantedIds.has(r.programId));
        return all.filter((r) => r.programId !== null).slice(0, programCap);
    };

    if (intent.score) {
        const rows = pick(adm.scores, ADMISSION_PROGRAM_ROWS).slice(0, wantedIds ? 15 : ADMISSION_PROGRAM_ROWS);
        const ctx = (adm.scores ?? []).filter((s) => s.programId === null).slice(0, ADMISSION_CONTEXT_ROWS);
        if (rows.length > 0) {
            lines.push("Điểm theo ngành:");
            for (const s of rows) lines.push(formatScoreLine(s, labelOf(s.programId, s.scopeLabel)));
        }
        if (ctx.length > 0) {
            lines.push("Ngưỡng/điểm áp dụng chung (KHÔNG phải điểm của một ngành cụ thể):");
            for (const s of ctx) lines.push(formatScoreLine(s, s.scopeLabel ?? "áp dụng chung"));
        }
    }
    if (intent.quota) {
        const rows = pick(adm.quotas, ADMISSION_OTHER_ROWS).slice(0, ADMISSION_OTHER_ROWS);
        const ctx = (adm.quotas ?? []).filter((q) => q.programId === null).slice(0, 4);
        if (rows.length > 0 || ctx.length > 0) {
            lines.push("Chỉ tiêu:");
            for (const q of rows) lines.push(formatQuotaLine(q, labelOf(q.programId, q.scopeLabel)));
            for (const q of ctx) lines.push(formatQuotaLine(q, labelOf(q.programId, q.scopeLabel)));
        }
    }
    if (intent.tuition) {
        const all = Array.isArray(adm.tuitions) ? adm.tuitions : [];
        const rows = wantedIds
            ? all.filter((t) => t.programId !== null && wantedIds.has(t.programId))
            : [...all.filter((t) => t.programId === null), ...all.filter((t) => t.programId !== null)].slice(
                  0,
                  ADMISSION_OTHER_ROWS
              );
        if (rows.length > 0) {
            lines.push("Học phí:");
            for (const t of rows.slice(0, ADMISSION_OTHER_ROWS)) {
                lines.push(formatTuitionLine(t, labelOf(t.programId, t.appliesTo)));
            }
        }
    }
    if (lines.length === 1) lines.push("(snapshot không có số liệu cho mục được hỏi)");
    return lines.join("\n");
}

export async function retrieveChatContext(query: string): Promise<RetrievalResult> {
    const ds = await getDataset();
    const normQuery = normalizeText(query);
    const queryTokens = normQuery ? normQuery.split(" ") : [];

    const { matches: uniMatches, consumed } = matchUniversities(ds.universities, queryTokens, normQuery);
    const uniIds = new Set(uniMatches.map((u) => u.uni.id));
    const contentTokens = queryTokens.filter((t) => !STOPWORDS.has(t) && !consumed.has(t));

    const sections: string[] = [];

    const totalPrograms = typeof ds.index.totalCount === "number" ? ds.index.totalCount : ds.programs.length;
    const totalCourses = typeof ds.index.totalCourses === "number" ? ds.index.totalCourses : ds.totalCourses;
    const stats = [
        `${ds.universities.length} trường`,
        `${totalPrograms} chương trình đào tạo`,
        `${totalCourses} lượt môn học trong các chương trình`,
    ];
    if (typeof ds.index.totalPrerequisiteEdges === "number") {
        stats.push(`${ds.index.totalPrerequisiteEdges} quan hệ môn tiên quyết`);
    }
    sections.push(
        `THỐNG KÊ CSDL (tính từ dữ liệu hiện có): ${stats.join(", ")}.\nDanh sách trường: ${ds.universities
            .map((u) => `${u.uni.code} (${u.uni.name})`)
            .join(", ")}.`
    );

    if (uniMatches.length > 0) {
        const lines = uniMatches.map((u) => {
            const count = ds.programs.filter((ip) => ip.program.universityId === u.uni.id).length;
            const extra = [u.uni.region, u.uni.website].filter(Boolean).join("; ");
            return `- ${u.uni.name} (mã ${u.uni.code})${extra ? `; ${extra}` : ""}: ${count} chương trình đào tạo trong dữ liệu.`;
        });
        sections.push(`TRƯỜNG LIÊN QUAN:\n${lines.join("\n")}`);
    }

    const ranked = uniIds.size > 0 || contentTokens.length > 0 ? scorePrograms(ds, contentTokens, uniIds) : [];
    const top = ranked.slice(0, TOP_PROGRAMS).map((r) => r.ip.program);

    // Admission-data intent (điểm chuẩn/học phí/chỉ tiêu/tuyển sinh): append the
    // real per-university snapshot so the LLM answers with actual numbers.
    const admissionIntent = detectAdmissionIntent(normQuery);
    const admissionBlocks: string[] = [];
    if (admissionIntent.any && uniMatches.length > 0) {
        const programNameById = new Map<string, string>(
            ds.programs.map((ip) => [ip.program.id, ip.program.name] as const)
        );
        // Only programs that matched on real content terms (score > the 0.01
        // university filler) count as "asked about" — otherwise treat it as a
        // university-wide question (e.g. "học phí NEU").
        const wantedIds = new Set(ranked.filter((r) => r.score > 0.01).map((r) => r.ip.program.id));
        for (const u of uniMatches) {
            const adm = await loadAdmissions(u.uni.code);
            if (adm) {
                admissionBlocks.push(
                    buildAdmissionSection(adm, u.uni.code, wantedIds.size > 0 ? wantedIds : null, admissionIntent, programNameById)
                );
            }
        }
    }

    if (top.length > 0) {
        sections.push(
            `CHƯƠNG TRÌNH LIÊN QUAN (${top.length}/${ranked.length} kết quả khớp):\n${top.map(describeProgram).join("\n")}`
        );
        sections.push(...admissionBlocks);
        const qset = new Set(contentTokens);
        const curricula = await Promise.all(
            top.slice(0, PROGRAMS_WITH_CURRICULUM).map(async (p) => ({ p, courses: await loadCurriculum(p.id) }))
        );
        const curriculumBlocks = curricula
            .filter((c) => c.courses.length > 0)
            .map((c) => formatCurriculum(c.p, c.courses, qset));
        if (curriculumBlocks.length > 0) {
            const used = sections.join("\n\n").length + 2;
            const budget = Math.max(MAX_CONTEXT_CHARS - used, 500);
            const perProgram = Math.floor(budget / curriculumBlocks.length);
            sections.push(curriculumBlocks.map((b) => truncate(b, perProgram)).join("\n"));
        }
    } else {
        sections.push("Không tìm thấy chương trình đào tạo nào khớp với câu hỏi trong dữ liệu.");
        sections.push(...admissionBlocks);
    }

    return {
        context: truncate(sections.join("\n\n"), MAX_CONTEXT_CHARS),
        matchedProgramIds: top.map((p) => p.id),
        matchedUniversityCodes: uniMatches.map((u) => u.uni.code),
    };
}
