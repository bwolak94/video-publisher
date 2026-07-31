"use client";

import { useState, useCallback, useEffect } from "react";
import type { OutlineBullet } from "@/store/creatorStore";

interface OutlineCardProps {
  bullets: OutlineBullet[];
  isStreaming: boolean;
  onUpdateBullet: (id: string, text: string) => void;
  onApprove: (bullets: OutlineBullet[]) => void;
}

export function OutlineCard({ bullets, isStreaming, onUpdateBullet, onApprove }: OutlineCardProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const startEdit = (bullet: OutlineBullet) => {
    setEditingId(bullet.id);
    setEditText(bullet.text);
  };

  const saveEdit = () => {
    if (editingId) {
      onUpdateBullet(editingId, editText);
      setEditingId(null);
    }
  };

  const handleApprove = useCallback(() => {
    if (!isStreaming) onApprove(bullets);
  }, [bullets, isStreaming, onApprove]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter" && !isStreaming) handleApprove();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleApprove, isStreaming]);

  return (
    <div className="bg-panel border border-line rounded-xl p-5 animate-in" data-testid="outline-card">
      <p className="text-2xs font-semibold text-ink-muted uppercase tracking-wider mb-4">Outline</p>
      <ol className="space-y-2 mb-5" data-testid="outline-list">
        {bullets.map((bullet, i) => (
          <li key={bullet.id} className="flex items-start gap-3 text-sm" data-testid="outline-bullet">
            <span className="flex-shrink-0 w-5 h-5 rounded-md bg-accent/12 text-accent text-xs flex items-center justify-center font-semibold mt-0.5 border border-accent/20">
              {i + 1}
            </span>
            {editingId === bullet.id ? (
              <div className="flex-1 flex gap-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="flex-1 bg-subtle border border-line rounded-lg px-2 py-1 text-sm text-ink resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
                  rows={2}
                  data-testid="bullet-textarea"
                />
                <button
                  onClick={saveEdit}
                  className="text-xs bg-accent text-white px-2 py-1 rounded-lg hover:opacity-90 transition-opacity"
                  data-testid="save-bullet"
                >
                  Save
                </button>
              </div>
            ) : (
              <>
                <span className="flex-1 text-ink-secondary leading-relaxed">{bullet.text}</span>
                <button
                  onClick={() => startEdit(bullet)}
                  className="text-ink-muted hover:text-ink-secondary text-xs transition-colors p-1 rounded flex-shrink-0"
                  aria-label="Edit bullet"
                  data-testid="edit-bullet"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  </svg>
                </button>
              </>
            )}
          </li>
        ))}
      </ol>
      <button
        onClick={handleApprove}
        disabled={isStreaming}
        className="w-full text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-100 active:scale-[0.98] hover:opacity-90"
        style={{ background: "linear-gradient(135deg,#5b6ef5 0%,#3d52e8 100%)" }}
        data-testid="approve-button"
      >
        {isStreaming ? "Generating outline…" : "Approve outline →"}
      </button>
      <p className="text-center text-2xs text-ink-muted mt-2">or press Ctrl+Enter</p>
    </div>
  );
}
