"use client";

interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
}

export function StreamingText({ content, isStreaming }: StreamingTextProps) {
  return (
    <span>
      {content}
      {isStreaming && (
        <span className="inline-block w-0.5 h-4 bg-violet-bright animate-pulse ml-0.5 rounded-full" aria-hidden="true" />
      )}
    </span>
  );
}
