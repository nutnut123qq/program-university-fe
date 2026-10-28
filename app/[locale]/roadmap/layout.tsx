import { routeMetadata } from "@/lib/seo"

export const generateMetadata = routeMetadata("roadmapTitle", "/roadmap")

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
