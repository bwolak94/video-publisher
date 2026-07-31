"use client";
import React from "react";

interface VisualPromptFieldProps {
  value: string;
  onChange: (value: string) => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
  /** Estimated cost string shown as a badge (e.g. "~$0.15" or "free") — FEATURE-09 */
  costBadge?: string | null;
}

export function VisualPromptField({
  value,
  onChange,
  onRegenerate,
  isRegenerating,
  costBadge,
}: VisualPromptFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-2xs font-semibold text-ink-muted uppercase tracking-wide">Visual Prompt</label>
      <div className="flex gap-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          placeholder="Describe the visual for this scene…"
          className="flex-1 text-sm text-ink bg-muted border border-line rounded-lg px-2.5 py-1.5 resize-none placeholder:text-ink-placeholder focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50"
          data-testid="visual-prompt-input"
        />
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={onRegenerate}
            disabled={isRegenerating}
            data-testid="regenerate-visual-btn"
            className="px-2.5 py-1 text-xs bg-accent/10 text-accent border border-accent/20 rounded-lg hover:bg-accent/15 disabled:opacity-40 whitespace-nowrap transition-colors"
          >
            {isRegenerating ? "…" : "Regenerate Visual"}
          </button>
          {costBadge && (
            <span
              className={`text-2xs font-medium px-1.5 py-0.5 rounded-full ${
                costBadge === "free"
                  ? "bg-success-bg text-success-text border border-success-border"
                  : "bg-warning-bg text-warning-text border border-warning-border"
              }`}
              data-testid="cost-badge"
            >
              {costBadge} est.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
