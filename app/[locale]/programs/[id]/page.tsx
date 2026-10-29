import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { isoDate, loadCourses, loadProgram, snapshotGeneratedAt } from "@/lib/program-snapshot"
import { alternates } from "@/lib/seo"

/**
 * Program page for search engines (v2.52, audit V9): server-rendered from the
 * snapshot. Factual fields, the course list and attribution only (AGENTS §9);
 * admissions, the reference score and documents stay in the detail dialog,
 * linked below. The id is a URL segment: `loadProgram` checks it first.
 */
type Props = { params: Promise<{ locale: string; id: string }> }

// On-demand ISR: nothing is built ahead; each URL is rendered once, on its
// first request, as a complete static page, then served from the cache. Only ids
// of src/lib/program-ids.json get here: proxy.ts answers every other path (v2.54).
export function generateStaticParams() {
    return []
}

async function programOr404(id: string) {
    const program = await loadProgram(id)
    if (!program) notFound()
    return program
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale, id } = await params
    const program = await programOr404(id)
    const t = await getTranslations({ locale, namespace: "programs" })
    const tp = await getTranslations({ locale, namespace: "programPage" })
    const title = tp("title", { name: program.name, university: program.universityName })
    const facts = [
        program.degreeType,
        program.duration,
        program.credits ? t("credits", { count: program.credits }) : null,
        program.courseCount > 0 ? t("courses", { count: program.courseCount }) : null,
    ]
    return {
        title,
        description: [title, ...facts].filter(Boolean).join(" · "),
        alternates: alternates(locale, `/programs/${program.id}`),
    }
}

export default async function ProgramPage({ params }: Props) {
    const { locale, id } = await params
    setRequestLocale(locale)
    const program = await programOr404(id)
    const [courses, generatedAt, t, tp] = await Promise.all([
        loadCourses(program.id),
        snapshotGeneratedAt(),
        getTranslations({ locale, namespace: "programs" }),
        getTranslations({ locale, namespace: "programPage" }),
    ])
    const fields: [string, string | null][] = [
        [t("programCode"), program.code],
        [t("degreeType"), program.degreeType],
        // Null when the snapshot has no plausible value (v2.54): said, never left out or shown as 0.
        [t("duration"), program.duration || tp("notVerified")],
        [t("courseCredits"), program.credits ? String(program.credits) : tp("notVerified")],
        [t("curriculumTab"), program.courseCount > 0 ? t("courses", { count: program.courseCount }) : null],
    ]
    const source = program.sourceUrl && /^https?:\/\//i.test(program.sourceUrl) ? program.sourceUrl : null

    return (
        <article className="mx-auto max-w-4xl px-4 py-8 space-y-6">
            <header className="space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-black text-foreground break-words">{program.name}</h1>
                <p className="text-sm sm:text-base text-muted-foreground font-medium">{program.universityName}</p>
            </header>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4">
                {fields.map(([label, value]) =>
                    value ? (
                        <div key={label}>
                            <dt className="text-xs text-muted-foreground">{label}</dt>
                            <dd className="text-sm font-semibold text-foreground">{value}</dd>
                        </div>
                    ) : null
                )}
            </dl>

            <section className="space-y-1 text-xs text-muted-foreground" data-testid="program-attribution">
                <p>
                    {t("sourceLabel")} {program.universityName}
                </p>
                {source && (
                    <p>
                        {t("sourceUrl")}:{" "}
                        <a href={source} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                            {source}
                        </a>
                    </p>
                )}
                <p>
                    {t("lastCrawled")}: {isoDate(program.lastCrawled) ?? "—"}
                </p>
                <p>
                    {tp("snapshotDate")}: {isoDate(generatedAt) ?? "—"}
                </p>
            </section>

            <p>
                <a href={`/${locale}?program=${program.id}`} className="text-sm font-semibold text-primary hover:underline">
                    {tp("openInList")}
                </a>
            </p>

            <section aria-labelledby="program-courses" className="space-y-3">
                <h2 id="program-courses" className="text-lg font-bold text-foreground">
                    {t("curriculumTitle")}
                </h2>
                {courses.length > 0 ? (
                    <div className="overflow-x-auto rounded-xl border border-border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                                <tr>
                                    <th className="p-2">{t("courseCode")}</th>
                                    <th className="p-2">{t("courseName")}</th>
                                    <th className="p-2">{t("courseCredits")}</th>
                                    <th className="p-2">{t("semester")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {courses.map((c, i) => (
                                    <tr key={c.id ?? i} className="border-t border-border">
                                        <td className="p-2 font-mono text-xs">{c.courseCode ?? "—"}</td>
                                        <td className="p-2">{c.courseName || "—"}</td>
                                        <td className="p-2">{c.credits ?? "—"}</td>
                                        <td className="p-2">{c.semester ?? "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">{t("noCurriculum")}</p>
                )}
            </section>
        </article>
    )
}
