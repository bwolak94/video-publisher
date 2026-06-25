"use client";

import { clsx } from "clsx";
import { StreamingText } from "./StreamingText";
import type { ChatMessage as ChatMessageType } from "@/store/creatorStore";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={clsx("flex", isUser ? "justify-end" : "justify-start")}
      data-testid="chat-message"
      data-role={message.role}
    >
      <div
        className={clsx(
          "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-900"
        )}
      >
        {message.isStreaming ? (
          <StreamingText content={message.content} isStreaming />
        ) : (
          message.content
        )}
      </div>
    </div>
  );
}
