"use client";

import { useEffect, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import type { ChatMessage as ChatMessageType } from "@/store/creatorStore";

interface ChatHistoryProps {
  messages: ChatMessageType[];
}

export function ChatHistory({ messages }: ChatHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 scroll-smooth" data-testid="chat-history">
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(91,110,245,0.1)", border: "1px solid rgba(91,110,245,0.2)" }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L12 7.5H18L13.5 11L15.5 17L10 13.5L4.5 17L6.5 11L2 7.5H8L10 2Z" fill="#5b6ef5" />
            </svg>
          </div>
          <div>
            <p className="text-ink font-semibold text-base">Start with a topic</p>
            <p className="text-sm text-ink-secondary mt-1 max-w-xs leading-relaxed">
              Describe the video you want to create. The AI will research it and build an outline.
            </p>
          </div>
        </div>
      )}
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
