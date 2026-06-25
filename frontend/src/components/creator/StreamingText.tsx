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
        <span className="inline-block w-0.5 h-4 bg-current animate-pulse ml-0.5" aria-hidden="true" />
      )}
    </span>
  );
}
