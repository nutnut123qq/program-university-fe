import { ProgramList } from "@/features/programs"
import { routeMetadata } from "@/lib/seo"

// Page-level (not a layout): a string title in a layout would drop the root
// title template for the program pages below it.
export const generateMetadata = routeMetadata("programsTitle", "/programs")

export default function ProgramsPage() {
    return <ProgramList />
}
