import { routeMetadata } from "@/lib/seo"

export const generateMetadata = routeMetadata("analyticsTitle", "/analytics")

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
