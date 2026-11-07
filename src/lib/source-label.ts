import { safeHttpUrl } from "@/lib/safe-url"

/**
 * Whether a program's published link is on its own university's website (v2.69, audit M11): only such a link is
 * labelled the "official source" (dialog Overview, program page, card tooltip); any other link (the syllabase.online
 * mirror, Google Drive, a third-party catalog) keeps its link under the neutral "data collected from" label.
 * Each domain is the registrable domain ("<name>.edu.vn") of the university's `universities.json` website, UET one
 * label deeper because vnu.edu.vn is VNU's. A host belongs when it is the domain or a subdomain of it (www included);
 * the URL parser gives it in lower case, any port, http or https. Keyed by university id (what every surface has).
 * Measured on the snapshot: docs/_coord/round104/S2_sources_base.log (900 of 1,956 links were labelled official off
 * the university's domain). A university not listed here never gets the label.
 */
const UNIVERSITY_DOMAINS: ReadonlyMap<string, string> = new Map([
    ["5b4df235-a6f2-44be-80b6-d35ab3652740", "ctu.edu.vn"], // CTU — www.ctu.edu.vn
    ["d123a6e9-b768-4c70-b8e9-6ea96e91f7a2", "duytan.edu.vn"], // DTU — tuyensinh.duytan.edu.vn
    ["ae635684-2839-4d4e-905a-c5808f24b5f9", "fpt.edu.vn"], // FPT — daihoc.fpt.edu.vn
    ["855acc63-4fb4-48c3-8d2c-4f3eec4255af", "ftu.edu.vn"], // FTU — ftu.edu.vn
    ["b5e96a23-0889-40f6-a1dd-e147aed2d716", "hcmus.edu.vn"], // HCMUS — tuyensinh.hcmus.edu.vn
    ["1e95a16f-bea2-490f-ae3d-9debafbfb706", "hcmut.edu.vn"], // HCMUT — hcmut.edu.vn
    ["1feb587b-804d-487b-a7a1-bba2bbaa3329", "hcmute.edu.vn"], // HCMUTE — hcmute.edu.vn
    ["2058f711-80c5-4b89-b1a4-a93814baa029", "hust.edu.vn"], // HUST — www.hust.edu.vn
    ["f4c2950c-a465-4c04-b0a1-164e4e30e7df", "hutech.edu.vn"], // HUTECH — www.hutech.edu.vn
    ["dbcd3b48-4d9d-43cd-91f0-8dd079ad07e9", "neu.edu.vn"], // NEU — neu.edu.vn
    ["dea7b154-4746-4978-91bb-342a7d5d6204", "ptit.edu.vn"], // PTIT — daotao.ptit.edu.vn
    ["07fb803e-d15f-4898-9950-7293d08a0757", "tdtu.edu.vn"], // TDTU — admission.tdtu.edu.vn
    ["1ab00c57-b036-4c5f-8662-9315c8dd9bea", "ueh.edu.vn"], // UEH — tuyensinh.ueh.edu.vn
    ["ef5065f0-75a5-4e9e-9279-fe6c97beebd2", "hcmulaw.edu.vn"], // UEL — www.hcmulaw.edu.vn
    ["879c3e1d-46f8-48f1-9c0e-a0511bc3021a", "uet.vnu.edu.vn"], // UET — tuyensinh.uet.vnu.edu.vn
    ["ac07a5b8-f12e-4657-abd0-c8d1a88944ae", "uit.edu.vn"], // UIT — tuyensinh.uit.edu.vn
    ["ea7bf305-296c-487e-92c7-6125d2c8fc17", "vnu.edu.vn"], // VNU — vnu.edu.vn
])

export function isUniversitySource(url: string | null | undefined, universityId: string | null | undefined): boolean {
    const href = safeHttpUrl(url)
    const domain = UNIVERSITY_DOMAINS.get(universityId ?? "")
    if (!href || !domain) return false
    const host = new URL(href).hostname
    return host === domain || host.endsWith("." + domain)
}
