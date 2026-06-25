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
    <div className="border-t bg-white px-4 py-3 space-y-2">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your video topic..."
          rows={2}
          disabled={isStreaming}
          className="flex-1 resize-none border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          data-testid="chat-textarea"
        />
        <button
          onClick={handleSubmit}
          disabled={isStreaming || !text.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
          data-testid="send-button"
        >
          Send
        </button>
      </div>
      <div className="flex items-center justify-between">
        <FileUploader files={uploadedFiles} onAdd={onAddFile} onRemove={onRemoveFile} />
        <LanguageSelector value={language} onChange={onLanguageChange} />
      </div>
    </div>
  );
}
