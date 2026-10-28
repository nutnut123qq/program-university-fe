/**
 * Export Utilities for Tedo Web App
 * Supports exporting Syllabus (CSV/JSON) and Analytics Benchmark Datasets.
 */

import { Program, Curriculum } from "@/features/programs/types"

/** Shape of src/lib/analytics-snapshot.json (written by scripts/build-analytics.mjs). */
export interface AnalyticsSnapshot {
    catalog: { programs: number; courses: number; universities: number; programsWithoutCourses: number }
    scoredPrograms: number
    /** Programs with enough data: SLM score + course list + not "insufficient". */
    basis: { programs: number; mean: number; atLeast6: number }
    /** High → low; counts over the basis. */
    bands: { range: string; count: number }[]
    /** Ranked by mean, then the n = 0 universities (mean null) by code. */
    universities: { code: string; name: string; programs: number; n: number; mean: number | null }[]
}

const BASIS_RULE = 'evaluationScore is a number && courseCount > 0 && dataSufficiency !== "insufficient"'

export const sharePct = (count: number, total: number) => `${((100 * count) / total).toFixed(1)}%`

export function downloadFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type: `${type};charset=utf-8;` })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

export function exportProgramToCsv(program: Program, courses: Curriculum[]) {
    const headers = ["STT", "Mã học phần", "Tên môn học", "Số tín chỉ", "Học kỳ", "Khối kiến thức", "Bắt buộc", "Môn tiên quyết"]
    const rows = courses.map((c, i) => [
        i + 1,
        `"${(c.courseCode || "").replace(/"/g, '""')}"`,
        `"${(c.courseName || "").replace(/"/g, '""')}"`,
        c.credits ?? "",
        c.semester ?? "",
        `"${(c.knowledgeBlock || "").replace(/"/g, '""')}"`,
        c.mandatory ? "Có" : "Không",
        `"${(c.prerequisites || "").replace(/"/g, '""')}"`,
    ])

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const filename = `CTDT_${program.code || program.id}_${program.name.replace(/[^a-zA-Z0-9]/g, "_")}.csv`
    downloadFile(csvContent, filename, "text/csv")
}

export function exportProgramToJson(program: Program, courses: Curriculum[]) {
    const data = {
        program: {
            id: program.id,
            name: program.name,
            code: program.code,
            universityName: program.universityName,
            degreeType: program.degreeType,
            credits: program.credits,
            duration: program.duration,
            tuition: program.tuition,
            language: program.language,
            evaluationScore: program.evaluationScore ?? null,
            sourceUrl: program.sourceUrl,
        },
        curricula: courses.map(c => ({
            code: c.courseCode,
            name: c.courseName,
            credits: c.credits,
            semester: c.semester,
            knowledgeBlock: c.knowledgeBlock,
            mandatory: c.mandatory,
            prerequisites: c.prerequisites,
        })),
        exportedAt: new Date().toISOString(),
    }

    const filename = `CTDT_${program.code || program.id}.json`
    downloadFile(JSON.stringify(data, null, 2), filename, "application/json")
}

const analyticsFileName = (s: AnalyticsSnapshot, ext: string) =>
    `Tedo_Analytics_Benchmark_Dataset_${s.catalog.universities}_Universities.${ext}`

export function exportAnalyticsDatasetToCsv(s: AnalyticsSnapshot) {
    const headers = ["Mã trường", "Tên trường Đại học", "Số lượng ngành", "Số ngành đủ dữ liệu (n)", "Điểm SLM tham khảo TB (thang 10)"]
    const rows = s.universities.map(u => [
        u.code,
        `"${u.name.replace(/"/g, '""')}"`,
        u.programs,
        u.n,
        u.mean ?? "", // n = 0: no mean
    ])

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    downloadFile(csvContent, analyticsFileName(s, "csv"), "text/csv")
}

export function exportAnalyticsDatasetToJson(s: AnalyticsSnapshot) {
    const share = (k: number) => sharePct(k, s.basis.programs)
    const data = {
        // Averages, shares, bands and n count only the programs matching this rule.
        basisRule: BASIS_RULE,
        catalog: {
            totalPrograms: s.catalog.programs,
            totalCourses: s.catalog.courses,
            totalUniversities: s.catalog.universities,
            programsWithoutCourses: s.catalog.programsWithoutCourses,
        },
        // Automatic SLM reference score, not an accreditation.
        slmReference: {
            scoredPrograms: s.scoredPrograms,
            evaluatedPrograms: s.basis.programs,
            meanScore: s.basis.mean,
            shareAtLeast6: share(s.basis.atLeast6),
            shareTopBand: share(s.bands[0].count),
        },
        universityRankings: s.universities.map((u, i) => ({
            rank: u.mean === null ? null : i + 1,
            code: u.code,
            name: u.name,
            programs: u.programs,
            n: u.n,
            meanScore: u.mean,
        })),
        scoreDistributions: s.bands.map(b => ({ range: b.range, count: b.count, share: share(b.count) })),
        exportedAt: new Date().toISOString(),
    }

    downloadFile(JSON.stringify(data, null, 2), analyticsFileName(s, "json"), "application/json")
}
