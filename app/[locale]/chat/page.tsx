import { ChatPage } from "@/features/chat/ChatPage"
import { routeMetadata } from "@/lib/seo"

export const generateMetadata = routeMetadata("chatTitle", "/chat")

export default function ChatRoute() {
    return <ChatPage />
}
