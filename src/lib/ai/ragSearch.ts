export interface UniversityMock {
    id: string;
    name: string;
    code: string;
    region?: string;
}

export interface ProgramMock {
    id: string;
    universityId: string;
    universityName: string;
    name: string;
    code: string;
    degreeType?: string;
    credits?: number;
}

export interface CourseMock {
    id: string;
    courseName: string;
    courseCode?: string | null;
    credits?: number | null;
    mandatory?: boolean;
    semester?: number | null;
    knowledgeBlock?: string | null;
    prerequisites?: string | null;
}

let cachedUniversities: UniversityMock[] | null = null;
let cachedProgramsIndex: ProgramMock[] | null = null;

// Cache map of programId -> CourseMock[]
const cachedCurriculaMap = new Map<string, CourseMock[]>();

export async function loadUniversities(): Promise<UniversityMock[]> {
    if (cachedUniversities) return cachedUniversities;
    try {
        const res = await fetch("/mock/universities.json");
        if (res.ok) {
            cachedUniversities = await res.json();
            return cachedUniversities || [];
        }
    } catch (e) {
        console.warn("Could not load /mock/universities.json:", e);
    }
    return [];
}

export async function loadSamplePrograms(): Promise<ProgramMock[]> {
    if (cachedProgramsIndex) return cachedProgramsIndex;
    try {
        // Load first 3 pages of mock programs for instant search
        const programs: ProgramMock[] = [];
        for (let page = 1; page <= 3; page++) {
            const res = await fetch(`/mock/programs/page-${page}.json`);
            if (res.ok) {
                const data = await res.json();
                if (data.items && Array.isArray(data.items)) {
                    programs.push(...data.items);
                } else if (Array.isArray(data)) {
                    programs.push(...data);
                }
            }
        }
        cachedProgramsIndex = programs;
        return programs;
    } catch (e) {
        console.warn("Could not load mock programs:", e);
    }
    return [];
}

export async function loadCurriculum(programId: string): Promise<CourseMock[]> {
    if (cachedCurriculaMap.has(programId)) {
        return cachedCurriculaMap.get(programId)!;
    }
    try {
        const res = await fetch(`/mock/curricula/${programId}.json`);
        if (res.ok) {
            const courses: CourseMock[] = await res.json();
            cachedCurriculaMap.set(programId, courses);
            return courses;
        }
    } catch (e) {
        console.warn(`Could not load curriculum for program ${programId}:`, e);
    }
    return [];
}

export interface RagContextResult {
    hasContext: boolean;
    universityName?: string;
    universityCode?: string;
    programName?: string;
    matchedCoursesCount?: number;
    contextText: string;
}

/**
 * Searches local mock DB (fe/public/mock) for university & course data matching user prompt.
 */
export async function searchMockDataContext(userPrompt: string): Promise<RagContextResult> {
    const promptLower = userPrompt.toLowerCase();

    // 1. Identify University from prompt
    const universities = await loadUniversities();
    let matchedUni: UniversityMock | undefined;

    const uniKeywords: Record<string, string[]> = {
        FPT: ["fpt", "đại học fpt", "dh fpt"],
        HUST: ["hust", "bách khoa hà nội", "bach khoa ha noi", "bk hà nội"],
        HCMUT: ["hcmut", "bách khoa hcm", "bách khoa tphcm", "bk hcm"],
        HCMUS: ["hcmus", "khoa học tự nhiên", "khtn"],
        UIT: ["uit", "công nghệ thông tin đhqg", "cntt hcm"],
        UET: ["uet", "công nghệ đhqghn"],
        NEU: ["neu", "kinh tế quốc dân"],
        UEH: ["ueh", "kinh tế tphcm"],
        TDTU: ["tdtu", "tôn đức thắng"],
        DTU: ["dtu", "duy tân"],
        VNU: ["vnu", "đhqghn"],
        FTU: ["ftu", "ngoại thương"],
    };

    for (const uni of universities) {
        const keywords = uniKeywords[uni.code] || [uni.code.toLowerCase(), uni.name.toLowerCase()];
        if (keywords.some((kw) => promptLower.includes(kw))) {
            matchedUni = uni;
            break;
        }
    }

    if (!matchedUni) {
        // Default to FPT or HUST if mentioned in common query context
        if (promptLower.includes("fpt")) {
            matchedUni = universities.find((u) => u.code === "FPT");
        }
    }

    // 2. Identify Program & Fetch Curriculum
    const programs = await loadSamplePrograms();
    let matchedPrograms = programs;

    if (matchedUni) {
        matchedPrograms = programs.filter((p) => p.universityId === matchedUni!.id || p.universityName?.includes(matchedUni!.name));
    }

    // If searching for specific domain like CNTT / AI / Soft Engineering
    let selectedProgram = matchedPrograms.find((p) => {
        const nameLower = p.name.toLowerCase();
        if (promptLower.includes("cntt") || promptLower.includes("công nghệ thông tin")) return nameLower.includes("công nghệ thông tin") || nameLower.includes("kỹ thuật phần mềm");
        if (promptLower.includes("ai") || promptLower.includes("trí tuệ nhân tạo")) return nameLower.includes("trí tuệ nhân tạo") || nameLower.includes("công nghệ thông tin");
        if (promptLower.includes("an toàn thông tin") || promptLower.includes("mạng")) return nameLower.includes("an toàn thông tin");
        return false;
    });

    if (!selectedProgram && matchedPrograms.length > 0) {
        selectedProgram = matchedPrograms[0];
    }

    if (!selectedProgram) {
        return { hasContext: false, contextText: "" };
    }

    // 3. Load Courses for Selected Program
    const courses = await loadCurriculum(selectedProgram.id);
    if (!courses || courses.length === 0) {
        return {
            hasContext: true,
            universityName: matchedUni?.name || selectedProgram.universityName,
            universityCode: matchedUni?.code,
            programName: selectedProgram.name,
            matchedCoursesCount: 0,
            contextText: `TRƯỜNG: ${matchedUni?.name || selectedProgram.universityName} (Mã: ${matchedUni?.code || "N/A"})\nNGÀNH: ${selectedProgram.name}\n(Chưa có dữ liệu chi tiết các môn học trong cơ sở dữ liệu).`,
        };
    }

    // Filter relevant courses based on query terms (e.g., "triết", "mác", "toán", "lập trình", etc.)
    const queryTerms = ["triết", "mác", "tư tưởng", "chính trị", "toán", "lập trình", "python", "ai", "cơ sở", "chuyên ngành"];
    const matchedTerms = queryTerms.filter((term) => promptLower.includes(term));

    let relevantCourses = courses;
    if (matchedTerms.length > 0) {
        const filtered = courses.filter((c) => {
            const cName = c.courseName.toLowerCase();
            const block = (c.knowledgeBlock || "").toLowerCase();
            return matchedTerms.some((term) => cName.includes(term) || block.includes(term));
        });
        if (filtered.length > 0) {
            relevantCourses = filtered;
        }
    }

    // Format Context Text for LLM System Prompt
    const courseLines = relevantCourses.slice(0, 15).map((c, idx) => {
        const mand = c.mandatory ? "Bắt buộc" : "Tự chọn";
        const sem = c.semester ? `Học kỳ ${c.semester}` : "";
        const block = c.knowledgeBlock ? `[${c.knowledgeBlock}]` : "";
        const credits = c.credits ? `${c.credits} tín chỉ` : "";
        return `${idx + 1}. Môn: "${c.courseName}" | Mã: ${c.courseCode || "N/A"} | ${credits} | ${mand} | ${sem} ${block}`;
    });

    const contextText = `
[DỮ LIỆU THỰC TẾ TRÍCH XUẤT TỪ CƠ SỞ DỮ LIỆU TEDO (MOCK DB)]
- Trường Đại học: ${matchedUni?.name || selectedProgram.universityName} (Mã trường: ${matchedUni?.code || "N/A"})
- Ngành đào tạo: ${selectedProgram.name} (Số tín chỉ tổng: ${selectedProgram.credits || "Theo quy định"})
- Danh sách môn học chính thức tìm thấy trong chương trình đào tạo (${relevantCourses.length} môn):
${courseLines.join("\n")}
`;

    return {
        hasContext: true,
        universityName: matchedUni?.name || selectedProgram.universityName,
        universityCode: matchedUni?.code,
        programName: selectedProgram.name,
        matchedCoursesCount: relevantCourses.length,
        contextText,
    };
}
