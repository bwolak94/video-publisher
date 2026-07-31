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
      className={clsx("flex", isUser ? "justify-end" : "justify-start items-start gap-2")}
      data-testid="chat-message"
      data-role={message.role}
    >
      {!isUser && (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: "linear-gradient(135deg,#5b6ef5 0%,#3d52e8 100%)" }}
        >
          <span className="text-[9px] font-bold text-white">AI</span>
        </div>
      )}
      <div
        className={clsx(
          "max-w-[75%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "text-white"
            : "bg-subtle border border-line text-ink"
        )}
        style={isUser ? { background: "linear-gradient(135deg,#5b6ef5 0%,#3d52e8 100%)" } : undefined}
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
