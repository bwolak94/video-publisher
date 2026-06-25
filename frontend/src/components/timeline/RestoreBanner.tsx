"use client";
import React from "react";

interface RestoreBannerProps {
  savedAt: number;
  isServerNewer: boolean;
  onRestore: () => void;
  onDiscard: () => void;
}

function formatAge(savedAt: number): string {
  const diffMs = Date.now() - savedAt;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  const diffH = Math.round(diffMin / 60);
  return `${diffH} hour${diffH !== 1 ? "s" : ""} ago`;
}

export function RestoreBanner({
  savedAt,
  isServerNewer,
  onRestore,
  onDiscard,
}: RestoreBannerProps) {
  return (
    <div
      className="flex items-center justify-between gap-4 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm"
      data-testid="restore-banner"
    >
      <span className="text-amber-800">
        {isServerNewer
          ? "Server version is newer than your local draft. Restore local draft anyway?"
          : `You have unsaved changes from ${formatAge(savedAt)}.`}
      </span>
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={onRestore}
          className="px-3 py-1 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700"
          data-testid="restore-btn"
        >
          {isServerNewer ? "Restore Local" : "Restore"}
        </button>
        <button
          onClick={onDiscard}
          className="px-3 py-1 text-xs font-medium bg-white text-amber-800 border border-amber-300 rounded hover:bg-amber-50"
          data-testid="discard-btn"
        >
          {isServerNewer ? "Load Server Version" : "Discard"}
        </button>
      </div>
    </div>
  );
}
