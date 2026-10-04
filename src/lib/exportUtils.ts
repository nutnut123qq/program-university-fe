/**
 * Export Utilities for Tedo Web App
 * Supports exporting Syllabus (CSV/JSON) and Analytics Benchmark Datasets.
 */

import { Program, Curriculum } from "@/features/programs/types"

/** Row shape produced by the analytics dashboard (UNI_STATS / DISTRIBUTIONS). */
export interface AnalyticsUniStat {
    code: string
    name: string
    count: number
    score: number
    status: string
    statusKey?: string
    color?: string
}

export interface AnalyticsDistribution {
    range: string
    labelKey: string
    label: string
    count: number
    pct: string
    color: string
}

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

export function exportAnalyticsDatasetToCsv(uniStats: AnalyticsUniStat[]) {
    const headers = ["Mã trường", "Tên trường Đại học", "Số lượng ngành", "Điểm SLM tham khảo TB (thang 10)", "Xếp loại"]
    const rows = uniStats.map(u => [
        u.code,
        `"${u.name.replace(/"/g, '""')}"`,
        u.count,
        u.score,
        `"${u.status.replace(/"/g, '""')}"`,
    ])

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    downloadFile(csvContent, "Tedo_Analytics_Benchmark_Dataset_17_Universities.csv", "text/csv")
}

export function exportAnalyticsDatasetToJson(uniStats: AnalyticsUniStat[], distributions: AnalyticsDistribution[]) {
    const data = {
        // Catalog totals derived from the current public snapshot
        // (public/mock/index.json + programs/page-*.json, generatedAt 2026-10-03).
        catalog: {
            totalPrograms: uniStats.reduce((sum, u) => sum + (u.count || 0), 0),
            totalCourses: 105602,
            totalUniversities: uniStats.length,
            programsWithoutCourses: 65,
        },
        // SLM quality metrics — evaluated REFERENCE set covering the earlier
        // 1,840-program catalog (slm_strict_v2); not recomputed for the newer
        // programs, so these are not current-catalog figures.
        slmReference: {
            evaluatedPrograms: 1840,
            meanQualityScore: 6.76,
            goldRatio: "8.6%",
            satisfactoryRatio: "67.3%",
        },
        universityRankings: uniStats,
        scoreDistributions: distributions,
        exportedAt: new Date().toISOString(),
    }

    downloadFile(JSON.stringify(data, null, 2), "Tedo_Analytics_Benchmark_Dataset_17_Universities.json", "application/json")
}
