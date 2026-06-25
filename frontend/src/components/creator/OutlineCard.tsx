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

  // Ctrl+Enter keyboard shortcut to approve (Rule #5)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter" && !isStreaming) {
        handleApprove();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleApprove, isStreaming]);

  return (
    <div className="border rounded-xl p-4 bg-white shadow-sm" data-testid="outline-card">
      <h3 className="font-semibold text-sm text-gray-700 mb-3">Outline</h3>
      <ol className="space-y-2 mb-4" data-testid="outline-list">
        {bullets.map((bullet) => (
          <li key={bullet.id} className="flex items-start gap-2 text-sm" data-testid="outline-bullet">
            {editingId === bullet.id ? (
              <div className="flex-1 flex gap-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="flex-1 border rounded px-2 py-1 text-sm resize-none"
                  rows={2}
                  data-testid="bullet-textarea"
                />
                <button
                  onClick={saveEdit}
                  className="text-xs bg-blue-600 text-white px-2 py-1 rounded"
                  data-testid="save-bullet"
                >
                  Save
                </button>
              </div>
            ) : (
              <>
                <span className="flex-1">{bullet.text}</span>
                <button
                  onClick={() => startEdit(bullet)}
                  className="text-gray-400 hover:text-gray-600 text-xs"
                  aria-label="Edit bullet"
                  data-testid="edit-bullet"
                >
                  ✏️
                </button>
              </>
            )}
          </li>
        ))}
      </ol>
      <button
        onClick={handleApprove}
        disabled={isStreaming}
        className="w-full bg-blue-600 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="approve-button"
      >
        {isStreaming ? "Generating outline..." : "Approve →"}
      </button>
    </div>
  );
}
