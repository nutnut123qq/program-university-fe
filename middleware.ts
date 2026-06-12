import createMiddleware from "next-intl/middleware"
import type { NextRequest } from "next/server"
import { routing } from "./src/i18n/routing"

const intlMiddleware = createMiddleware(routing)

export default function middleware(request: NextRequest) {
    const response = intlMiddleware(request)

    const location = response.headers.get("location")
    if (location) {
        try {
            const url = new URL(location)
            const forwardedHost = (
                request.headers.get("x-forwarded-host") ||
                request.headers.get("host") ||
                url.host
            )
                .split(",")[0]
                .trim()
            const hostname = forwardedHost.replace(/:\d+$/, "")
            const isLocal =
                hostname === "localhost" ||
                hostname === "127.0.0.1" ||
                hostname.endsWith(".local")
            if (!isLocal) {
                url.protocol = "https:"
                url.hostname = hostname
                url.port = ""
                response.headers.set("location", url.toString())
            }
        } catch {
            // leave the original Location untouched on parse failure
        }
    }

    return response
}

export const config = {
    matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
}
