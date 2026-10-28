import React from "react"
import { ProgramComparison } from "@/features/compare/components/ProgramComparison"
import { routeMetadata } from "@/lib/seo"

export const generateMetadata = routeMetadata("compareTitle", "/compare")

export default function ComparePage() {
    return <ProgramComparison />
}
