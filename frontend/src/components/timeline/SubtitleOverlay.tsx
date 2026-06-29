"use client";
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { WordTimestamp } from "@/types/subtitle";

const CONTEXT_WORDS_BEFORE = 3;
const CONTEXT_WORDS_AFTER = 4;
const TOTAL_CONTEXT = CONTEXT_WORDS_BEFORE + 1 + CONTEXT_WORDS_AFTER;

interface SubtitleOverlayProps {
  words: WordTimestamp[];
  fps: number;
  /** Offset in seconds added to word timestamps (non-zero for mid-timeline scenes) */
  timeOffsetSeconds?: number;
  style?: {
    fontSize?: number;
    color?: string;
    highlightColor?: string;
    position?: "top" | "center" | "bottom";
  };
}

/**
 * Karaoke-style subtitle overlay for Remotion (FEATURE-04).
 *
 * Shows a sliding context window of ~7 words around the currently spoken word.
 * The active word is highlighted; surrounding words are dimmed.
 * Renders nothing when no word is active.
 */
export function SubtitleOverlay({
  words,
  fps,
  timeOffsetSeconds = 0,
  style = {},
}: SubtitleOverlayProps) {
  const frame = useCurrentFrame();
  const currentSeconds = frame / fps - timeOffsetSeconds;

  const {
    fontSize = 28,
    color = "#ffffff",
    highlightColor = "#FFD700",
    position = "bottom",
  } = style;

  if (words.length === 0) return null;

  // Find the index of the currently spoken word
  const activeIndex = words.findIndex(
    (w) => currentSeconds >= w.start && currentSeconds <= w.end
  );

  // If no word is active, show nothing (gap between words)
  if (activeIndex === -1) return null;

  // Compute the visible window
  const start = Math.max(0, activeIndex - CONTEXT_WORDS_BEFORE);
  const end = Math.min(words.length, start + TOTAL_CONTEXT);
  const visibleWords = words.slice(start, end);

  // Vertical placement
  const verticalStyle: React.CSSProperties =
    position === "top"
      ? { top: "8%", alignItems: "flex-start" }
      : position === "center"
      ? { top: "50%", transform: "translateY(-50%)", alignItems: "center" }
      : { bottom: "8%", alignItems: "flex-end" };

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        pointerEvents: "none",
        ...verticalStyle,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0.25em",
          padding: "0.4em 0.8em",
          background: "rgba(0,0,0,0.55)",
          borderRadius: 6,
          maxWidth: "90%",
        }}
      >
        {visibleWords.map((w, i) => {
          const isActive = start + i === activeIndex;
          return (
            <span
              key={`${w.start}-${i}`}
              style={{
                fontSize,
                fontFamily: "Inter, system-ui, sans-serif",
                fontWeight: isActive ? 700 : 400,
                color: isActive ? highlightColor : color,
                opacity: isActive ? 1 : 0.75,
                textShadow: isActive ? `0 0 8px ${highlightColor}55` : "none",
                transition: "color 0.1s, font-weight 0.1s",
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
