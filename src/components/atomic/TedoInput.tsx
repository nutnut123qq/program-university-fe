import React from "react"
import { Input, InputProps } from "@/components/ui/input"

export const TedoInput = React.forwardRef<HTMLInputElement, InputProps>(
    (props, ref) => <Input ref={ref} {...props} />
)
TedoInput.displayName = "TedoInput"
