import { routeMetadata } from "@/lib/seo"

export const generateMetadata = routeMetadata("materialsTitle", "/materials")

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
