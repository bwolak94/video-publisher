"use client";
import React, { useEffect, useState } from "react";

interface AudioPlayerProps {
  audioUrl: string | null;
}

export function AudioPlayer({ audioUrl }: AudioPlayerProps) {
  // Cache the URL in state on mount — do not refetch on re-renders (Rule 7)
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (audioUrl) {
      setCachedUrl(audioUrl);
    }
    // Intentionally run only on mount to cache URL once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!cachedUrl) {
    return (
      <div
        className="h-8 bg-gray-50 rounded flex items-center px-2 text-xs text-gray-400"
        data-testid="audio-player-empty"
      >
        {audioUrl ? "Loading audio..." : "No audio"}
      </div>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio
      controls
      src={cachedUrl}
      data-testid="audio-player"
      className="w-full h-8"
    />
  );
}
