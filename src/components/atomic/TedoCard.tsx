import React from "react"
import { Card, CardProps } from "@/components/ui/card"

export const TedoCard = React.forwardRef<HTMLDivElement, CardProps>(
    (props, ref) => <Card ref={ref} {...props} />
)
TedoCard.displayName = "TedoCard"
