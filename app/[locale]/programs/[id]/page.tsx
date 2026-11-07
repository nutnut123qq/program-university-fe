import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations, setRequestLocale } from "next-intl/server"
import type { AdmissionQuota, AdmissionScore, TuitionRecord } from "@/features/programs/types"
import {
    admissionKindText,
    admissionScopeText,
    admissionsForProgram,
    formatAdmissionNumber,
    newestPerMethod,
    tuitionAmountText,
    tuitionBasisText,
} from "@/lib/admissions-display"
import { isoDate, loadAdmissions, loadCourses, loadProgram, snapshotGeneratedAt } from "@/lib/program-snapshot"
import { SITE_OPEN_GRAPH, SITE_URL, alternates } from "@/lib/seo"
import { safeHttpUrl, urlHost } from "@/lib/safe-url"
import { isUniversitySource } from "@/lib/source-label"

/**
 * Program page for search engines and sharing (v2.52, audit V9; v2.60, audit V6): server-rendered from the
 * snapshot. Factual fields, the detail dialog's admissions rows (newest year per method), the course list and
 * attribution (AGENTS §9); every admissions year, the reference score and documents stay in the dialog,
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
        // og:title / og:description / twitter:* come from the title and description above (seo.ts).
        openGraph: { ...SITE_OPEN_GRAPH, url: `/${locale}/programs/${program.id}` },
    }
}

export default async function ProgramPage({ params }: Props) {
    const { locale, id } = await params
    setRequestLocale(locale)
    const program = await programOr404(id)
    const [courses, generatedAt, admissions, t, tp] = await Promise.all([
        loadCourses(program.id),
        snapshotGeneratedAt(),
        loadAdmissions(program.universityId),
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
    const source = safeHttpUrl(program.sourceUrl)
    // The dialog's rows; scores only in the newest year of each method, own rows and school/group rows apart.
    const view = admissions ? admissionsForProgram(admissions, program.id) : null
    const ownScores = newestPerMethod(view?.programScores ?? [])
    const contextScores = newestPerMethod(view?.contextScores ?? [])
    const quotas = [...(view?.programQuotas ?? []), ...(view?.contextQuotas ?? [])]
    const tuitions = [...(view?.programTuitions ?? []), ...(view?.contextTuitions ?? [])]
    const num = (n: number) => formatAdmissionNumber(n, locale)
    // Facts the page prints, nothing else (AGENTS §9).
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "EducationalOccupationalProgram",
        name: program.name,
        url: new URL(`/${locale}/programs/${program.id}`, SITE_URL).toString(),
        provider: { "@type": "CollegeOrUniversity", name: program.universityName },
        ...(program.code ? { identifier: program.code } : {}),
        ...(program.degreeType ? { educationalCredentialAwarded: program.degreeType } : {}),
        ...(program.credits ? { numberOfCredits: program.credits } : {}),
    }

    const provenance = (r: { sourceUrl: string | null; publishedAt: string | null }) => {
        const href = safeHttpUrl(r.sourceUrl)
        const published = isoDate(r.publishedAt)
        return (
            <p className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                {href ? (
                    <span>
                        {t("admissionSourceLabel")}:{" "}
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {urlHost(href)}
                        </a>
                    </span>
                ) : (
                    <span className="italic">{t("admissionNoSource")}</span>
                )}
                {published && (
                    <span>
                        {t("admissionPublishedLabel")}: {published}
                    </span>
                )}
            </p>
        )
    }
    const scoreItem = (s: AdmissionScore, i: number) => (
        <li key={i} className="rounded-lg border border-border p-3 space-y-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="font-mono text-sm font-bold text-primary">
                    {s.score == null ? "—" : num(s.score)}
                    {s.scale != null && ` / ${num(s.scale)}`}
                </span>
                <span>{admissionKindText(t, s.kind)}</span>
                <span className="text-muted-foreground">{s.year}</span>
                {(s.scope !== "program" || s.scopeLabel) && <span>{admissionScopeText(t, s.scope, s.scopeLabel)}</span>}
                {s.methodLabel && <span className="text-muted-foreground">{s.methodLabel}</span>}
            </p>
            {s.comboNote && <p className="text-[11px] italic text-muted-foreground">{s.comboNote}</p>}
            {provenance(s)}
        </li>
    )
    const quotaItem = (q: AdmissionQuota, i: number) => (
        <li key={i} className="rounded-lg border border-border p-3 space-y-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="font-mono text-sm font-bold">{q.quota != null ? num(q.quota) : "—"}</span>
                <span>{t("admissionQuotaUnit")}</span>
                <span>{admissionScopeText(t, q.scope, q.scopeLabel)}</span>
                <span className="text-muted-foreground">{q.year}</span>
            </p>
            {q.scope !== "program" && <p className="text-[11px] italic text-muted-foreground">{t("admissionQuotaScopedNote")}</p>}
            {provenance(q)}
        </li>
    )
    const tuitionItem = (x: TuitionRecord, i: number) => {
        const amount = tuitionAmountText(x)
        return (
            <li key={i} className="rounded-lg border border-border p-3 space-y-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="text-sm font-bold">
                        {amount ?? "—"}
                        {amount && x.basis && ` ${tuitionBasisText(t, x.basis)}`}
                    </span>
                    {x.academicYear && (
                        <span>
                            {t("admissionAcademicYear")}: {x.academicYear}
                        </span>
                    )}
                    {x.programId === null && <span>{t("admissionScopeSchool")}</span>}
                </p>
                {x.appliesTo && (
                    <p className="text-[11px] text-muted-foreground">
                        {t("admissionAppliesTo")}: {x.appliesTo}
                    </p>
                )}
                {x.notes && <p className="text-[11px] italic text-muted-foreground">{x.notes}</p>}
                {provenance(x)}
            </li>
        )
    }

    return (
        <article className="mx-auto max-w-4xl px-4 py-8 space-y-6">
            {/* `<` escaped: a data string can never close the script element. */}
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
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
                        {t(isUniversitySource(source, program.universityId) ? "sourceUrl" : "sourceUrlCollected")}:{" "}
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

            <section aria-labelledby="program-admissions" data-testid="program-admissions" className="space-y-3">
                <h2 id="program-admissions" className="text-lg font-bold text-foreground">
                    {t("admissionsTitleNoYear")}
                </h2>
                {!view || view.isEmpty ? (
                    <p className="text-sm text-muted-foreground">{t("noAdmissions")}</p>
                ) : (
                    <>
                        {ownScores.length + contextScores.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-foreground">{t("admissionScoresTitle")}</h3>
                                {ownScores.length > 0 && (
                                    <ul data-testid="admission-scores-own" className="space-y-2">
                                        {ownScores.map(scoreItem)}
                                    </ul>
                                )}
                                {contextScores.length > 0 && (
                                    <>
                                        <p className="text-xs font-semibold text-muted-foreground">{t("admissionContextTitle")}</p>
                                        <ul data-testid="admission-scores-context" className="space-y-2">
                                            {contextScores.map(scoreItem)}
                                        </ul>
                                    </>
                                )}
                            </div>
                        )}
                        {quotas.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-foreground">{t("admissionQuotasTitle")}</h3>
                                <ul data-testid="admission-quotas" className="space-y-2">
                                    {quotas.map(quotaItem)}
                                </ul>
                            </div>
                        )}
                        {tuitions.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-foreground">{t("admissionTuitionTitle")}</h3>
                                <ul data-testid="admission-tuition" className="space-y-2">
                                    {tuitions.map(tuitionItem)}
                                </ul>
                            </div>
                        )}
                        <p className="text-xs italic text-muted-foreground">{t("admissionsWarning")}</p>
                    </>
                )}
            </section>

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
                                        <td className="p-2">{c.semester == null ? "—" : c.semester <= 0 ? t("semesterPrep", { n: c.semester }) : c.semester}</td>
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
