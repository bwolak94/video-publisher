"use client";
import React from "react";

interface NarrationFieldProps {
  value: string;
  onChange: (value: string) => void;
  onUpdateVoice: () => void;
  isRegenerating: boolean;
}

export function NarrationField({
  value,
  onChange,
  onUpdateVoice,
  isRegenerating,
}: NarrationFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-2xs font-semibold text-ink-muted uppercase tracking-wide">Narration</label>
      <div className="flex gap-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="flex-1 text-sm text-ink bg-muted border border-line rounded-lg px-2.5 py-1.5 resize-none placeholder:text-ink-placeholder focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50"
          data-testid="narration-input"
        />
        <button
          onClick={onUpdateVoice}
          disabled={isRegenerating}
          data-testid="update-voice-btn"
          className="px-2.5 py-1 text-xs bg-success-bg text-success-text border border-success-border rounded-lg hover:opacity-80 disabled:opacity-40 whitespace-nowrap transition-opacity"
        >
          {isRegenerating ? "…" : "Update Voice"}
        </button>
      </div>
    </div>
  );
}
