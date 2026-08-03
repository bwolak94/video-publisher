"use client";
import React, { useEffect, useState } from "react";
import { s3ToHttpUrl } from "@/lib/s3url";

interface AudioPlayerProps {
  audioUrl: string | null;
  /** When the browser reads audio metadata, fires with the actual duration in seconds */
  onDurationDetected?: (seconds: number) => void;
}

export function AudioPlayer({ audioUrl, onDurationDetected }: AudioPlayerProps) {
  const [httpUrl, setHttpUrl] = useState<string | null>(() => s3ToHttpUrl(audioUrl));

  useEffect(() => {
    setHttpUrl(s3ToHttpUrl(audioUrl));
  }, [audioUrl]);

  if (!httpUrl) {
    return (
      <div
        className="h-8 bg-muted rounded-lg flex items-center px-2 text-xs text-ink-muted"
        data-testid="audio-player-empty"
      >
        {audioUrl ? "Loading audio…" : "No audio"}
      </div>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio
      controls
      src={httpUrl}
      data-testid="audio-player"
      className="w-full h-8"
      onLoadedMetadata={(e) => {
        const { duration } = e.currentTarget;
        if (duration && isFinite(duration) && onDurationDetected) {
          onDurationDetected(duration);
        }
      }}
    />
  );
}
