"use client";

import { useState, useRef } from "react";
import { FileUploader } from "./FileUploader";
import { LanguageSelector } from "./LanguageSelector";
import type { Language } from "@/lib/voice-profiles";

interface ChatInputProps {
  isStreaming: boolean;
  language: Language;
  uploadedFiles: File[];
  onSend: (text: string, files: File[]) => void;
  onLanguageChange: (lang: Language) => void;
  onAddFile: (file: File) => void;
  onRemoveFile: (name: string) => void;
}

export function ChatInput({
  isStreaming,
  language,
  uploadedFiles,
  onSend,
  onLanguageChange,
  onAddFile,
  onRemoveFile,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed, uploadedFiles);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-line bg-panel px-4 py-3 space-y-2">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your video topic..."
          rows={2}
          disabled={isStreaming}
          className="flex-1 resize-none bg-subtle border border-line rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-ink-placeholder focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 disabled:opacity-40 transition-colors"
          data-testid="chat-textarea"
        />
        <button
          onClick={handleSubmit}
          disabled={isStreaming || !text.trim()}
          className="text-white px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-100 active:scale-95 hover:opacity-90"
          style={{ background: "linear-gradient(135deg,#5b6ef5 0%,#3d52e8 100%)" }}
          data-testid="send-button"
        >
          Send
        </button>
      </div>
      <div className="flex items-center justify-between px-1">
        <FileUploader files={uploadedFiles} onAdd={onAddFile} onRemove={onRemoveFile} />
        <LanguageSelector value={language} onChange={onLanguageChange} />
      </div>
    </div>
  );
}
