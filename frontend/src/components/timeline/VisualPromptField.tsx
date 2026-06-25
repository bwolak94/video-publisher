"use client";
import React from "react";

interface VisualPromptFieldProps {
  value: string;
  onChange: (value: string) => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
}

export function VisualPromptField({
  value,
  onChange,
  onRegenerate,
  isRegenerating,
}: VisualPromptFieldProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">Visual Prompt</label>
      <div className="flex gap-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="flex-1 text-sm border rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
          data-testid="visual-prompt-input"
        />
        <button
          onClick={onRegenerate}
          disabled={isRegenerating}
          data-testid="regenerate-visual-btn"
          className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100 disabled:opacity-50 whitespace-nowrap"
        >
          {isRegenerating ? "..." : "Regenerate Visual"}
        </button>
      </div>
    </div>
  );
}
