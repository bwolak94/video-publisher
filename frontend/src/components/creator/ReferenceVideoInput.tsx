"use client";

import { useState } from "react";
import type { ReferenceAnalysisBrief, ReferencePacing, ReferenceTone } from "@/types/reference-analysis";

const PACING_COLORS: Record<ReferencePacing, string> = {
  slow:    "bg-blue-100 text-blue-800",
  medium:  "bg-green-100 text-green-800",
  fast:    "bg-orange-100 text-orange-800",
  dynamic: "bg-purple-100 text-purple-800",
};

const TONE_COLORS: Record<ReferenceTone, string> = {
  serious:       "bg-gray-100 text-gray-800",
  comedic:       "bg-yellow-100 text-yellow-800",
  inspirational: "bg-pink-100 text-pink-800",
  educational:   "bg-cyan-100 text-cyan-800",
  dramatic:      "bg-red-100 text-red-800",
};

interface Props {
  onAnalyzed: (url: string, brief: ReferenceAnalysisBrief) => void;
  isDisabled?: boolean;
  apiBase: string;
}

export function ReferenceVideoInput({ onAnalyzed, isDisabled, apiBase }: Props) {
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [brief, setBrief] = useState<ReferenceAnalysisBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    setBrief(null);

    try {
      const res = await fetch(`${apiBase}/api/creator/analyze-reference`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: url.trim() }),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "Unknown error");
        throw new Error(msg);
      }

      const result = (await res.json()) as ReferenceAnalysisBrief;
      setBrief(result);
      onAnalyzed(url.trim(), result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClear = () => {
    setUrl("");
    setBrief(null);
    setError(null);
    onAnalyzed("", null as unknown as ReferenceAnalysisBrief);
  };

  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2 bg-gray-50 border-b">
        <span className="text-sm font-medium text-gray-700">Reference Video</span>
        <span className="text-xs text-gray-400">(optional — inspires style, not content)</span>
        {brief && (
          <button
            onClick={() => setIsExpanded((v) => !v)}
            className="ml-auto text-xs text-indigo-600 hover:underline"
          >
            {isExpanded ? "Collapse" : "Show analysis"}
          </button>
        )}
      </div>

      <div className="px-4 py-3">
        {!brief ? (
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="YouTube URL or direct video link"
              disabled={isDisabled || isAnalyzing}
              className="flex-1 text-sm border rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-100"
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            />
            <button
              onClick={handleAnalyze}
              disabled={!url.trim() || isDisabled || isAnalyzing}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isAnalyzing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analyzing…
                </>
              ) : (
                "Analyze"
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 truncate">{brief.sourceUrl}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PACING_COLORS[brief.pacing]}`}>
                  {brief.pacing} pace
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TONE_COLORS[brief.toneProfile]}`}>
                  {brief.toneProfile}
                </span>
                <span className="text-xs text-gray-500">
                  {Math.round(brief.totalDurationSeconds)}s · {brief.sceneCount} scenes
                </span>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0"
              title="Remove reference video"
            >
              ✕
            </button>
          </div>
        )}

        {error && (
          <p className="mt-2 text-xs text-red-500">{error}</p>
        )}
      </div>

      {brief && isExpanded && (
        <div className="px-4 pb-4 border-t pt-3 space-y-3">
          {brief.structurePattern && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Structure</p>
              <p className="text-xs text-gray-700">{brief.structurePattern}</p>
            </div>
          )}

          {brief.visualStyle && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Visual Style</p>
              <p className="text-xs text-gray-700">{brief.visualStyle}</p>
            </div>
          )}

          {brief.keyTopics.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Key Topics</p>
              <div className="flex flex-wrap gap-1">
                {brief.keyTopics.map((t) => (
                  <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {brief.transcript && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Transcript (excerpt)</p>
              <p className="text-xs text-gray-500 line-clamp-3">{brief.transcript}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
