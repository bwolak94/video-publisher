"use client";
import React from "react";
import { s3ToHttpUrl } from "@/lib/s3url";

interface SceneThumbnailProps {
  videoUrl: string | null;
  isRegenerating: boolean;
}

export function SceneThumbnail({ videoUrl, isRegenerating }: SceneThumbnailProps) {
  if (isRegenerating) {
    return (
      <div
        className="w-32 h-20 flex-shrink-0 bg-gray-100 rounded flex items-center justify-center"
        data-testid="scene-thumbnail-loading"
      >
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const httpUrl = s3ToHttpUrl(videoUrl);

  if (!httpUrl) {
    return (
      <div
        className="w-32 h-20 flex-shrink-0 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400"
        data-testid="scene-thumbnail-empty"
      >
        No visual
      </div>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      src={httpUrl}
      className="w-32 h-20 flex-shrink-0 object-cover rounded"
      data-testid="scene-thumbnail"
      muted
      preload="metadata"
    />
  );
}
