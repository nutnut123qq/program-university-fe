import React from "react"
import { Button, ButtonProps } from "@/components/ui/button"

export const TedoButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (props, ref) => <Button ref={ref} {...props} />
)
TedoButton.displayName = "TedoButton"
