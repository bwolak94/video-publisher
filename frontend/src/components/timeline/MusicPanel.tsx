"use client";
import React, { useCallback, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { useTimelineStore } from "@/store/timelineStore";
import type { MusicMood, MusicTrack } from "@/types/music";

const MOOD_OPTIONS: { value: MusicMood; label: string }[] = [
  { value: "cinematic",  label: "Cinematic" },
  { value: "upbeat",     label: "Upbeat" },
  { value: "calm",       label: "Calm" },
  { value: "dramatic",   label: "Dramatic" },
  { value: "inspiring",  label: "Inspiring" },
  { value: "fun",        label: "Fun" },
];

const PROVIDER_LABELS: Record<string, string> = {
  jamendo:        "Jamendo (CC)",
  stability_audio: "Stability AI",
  embedded:       "Embedded (CC0)",
};

export function MusicPanel() {
  const projectId   = useProjectStore((s) => s.projectId);
  const musicTrack  = useProjectStore((s) => s.musicTrack);
  const musicMood   = useProjectStore((s) => s.musicMood);
  const musicVolume = useProjectStore((s) => s.musicVolume);
  const setMusicTrack  = useProjectStore((s) => s.setMusicTrack);
  const setMusicMood   = useProjectStore((s) => s.setMusicMood);
  const setMusicVolume = useProjectStore((s) => s.setMusicVolume);

  const sceneOrder = useTimelineStore((s) => s.sceneOrder);
  const scenes     = useTimelineStore((s) => s.scenes);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalDuration = sceneOrder.reduce(
    (acc, id) => acc + (scenes[id]?.durationInSeconds ?? 5),
    0
  );

  const handleGenerate = useCallback(async () => {
    if (!projectId) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/music/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: musicMood, durationSeconds: totalDuration }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? `HTTP ${res.status}`);
      }

      const track = (await res.json()) as MusicTrack;
      setMusicTrack(track);
    } catch (err: any) {
      setError(err.message ?? "Failed to generate music");
    } finally {
      setGenerating(false);
    }
  }, [projectId, musicMood, totalDuration, setMusicTrack]);

  const handleRemove = useCallback(() => {
    setMusicTrack(null);
  }, [setMusicTrack]);

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Background Music</h3>
        {musicTrack && (
          <button
            onClick={handleRemove}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Remove
          </button>
        )}
      </div>

      {/* Mood selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 whitespace-nowrap">Mood:</label>
        <select
          value={musicMood}
          onChange={(e) => setMusicMood(e.target.value as MusicMood)}
          disabled={generating}
          className="flex-1 text-xs border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          {MOOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Volume slider */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 whitespace-nowrap">Volume:</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={musicVolume}
          onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
          className="flex-1 h-1 accent-indigo-500"
        />
        <span className="text-xs text-gray-500 w-8 text-right">
          {Math.round(musicVolume * 100)}%
        </span>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={generating || !projectId}
        className="w-full px-3 py-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generating
          ? "Generating..."
          : musicTrack
          ? "Regenerate Music"
          : "Generate Music"}
      </button>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      {/* Current track info */}
      {musicTrack && (
        <div className="flex items-start gap-2 p-2 bg-indigo-50 rounded border border-indigo-100">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-indigo-800 truncate">{musicTrack.title}</p>
            {musicTrack.artist && (
              <p className="text-xs text-indigo-600 truncate">{musicTrack.artist}</p>
            )}
            <p className="text-xs text-indigo-500">
              {PROVIDER_LABELS[musicTrack.provider] ?? musicTrack.provider}
              {" · "}{musicTrack.license}
              {" · "}{Math.round(musicTrack.durationSeconds)}s
            </p>
          </div>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 shrink-0">
            Music
          </span>
        </div>
      )}
    </div>
  );
}
