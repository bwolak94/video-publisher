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
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">Narration</label>
      <div className="flex gap-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="flex-1 text-sm border rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
          data-testid="narration-input"
        />
        <button
          onClick={onUpdateVoice}
          disabled={isRegenerating}
          data-testid="update-voice-btn"
          className="px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 disabled:opacity-50 whitespace-nowrap"
        >
          {isRegenerating ? "..." : "Update Voice"}
        </button>
      </div>
    </div>
  );
}
