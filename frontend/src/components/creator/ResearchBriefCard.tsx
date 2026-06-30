"use client";
import React, { useState } from "react";
import type { ResearchBrief, ResearchSourceType } from "@/types/research";

const SOURCE_LABELS: Record<ResearchSourceType, string> = {
  google:      "Google",
  reddit:      "Reddit",
  news:        "News",
  duckduckgo:  "DuckDuckGo",
};

const SOURCE_BADGE: Record<ResearchSourceType, string> = {
  google:      "bg-blue-100 text-blue-700",
  reddit:      "bg-orange-100 text-orange-700",
  news:        "bg-gray-100 text-gray-700",
  duckduckgo:  "bg-green-100 text-green-700",
};

interface ResearchBriefCardProps {
  brief: ResearchBrief;
  onProceed: () => void;
  isLoading?: boolean;
}

export function ResearchBriefCard({ brief, onProceed, isLoading }: ResearchBriefCardProps) {
  const [showSources, setShowSources] = useState(false);

  return (
    <div
      className="border rounded-xl p-4 bg-white shadow-sm space-y-4"
      data-testid="research-brief-card"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-gray-700">
          Research Brief — {brief.topic}
        </h3>
        <span className="text-xs text-gray-400">
          {brief.searchCount} sources · {brief.searchDepth} depth
        </span>
      </div>

      {/* Key Points */}
      {brief.keyPoints.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Key Findings</p>
          <ul className="space-y-1">
            {brief.keyPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-indigo-500 mt-0.5 shrink-0">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Trending Angles */}
      {brief.trendingAngles.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Trending Angles</p>
          <div className="flex flex-wrap gap-1.5">
            {brief.trendingAngles.map((angle, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100"
              >
                {angle}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Audience Insights */}
      {brief.audienceInsights.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Audience Questions</p>
          <ul className="space-y-1">
            {brief.audienceInsights.map((insight, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="text-amber-500 shrink-0">?</span>
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sources toggle */}
      {brief.sources.length > 0 && (
        <div>
          <button
            onClick={() => setShowSources((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            {showSources ? "Hide" : "Show"} {brief.sources.length} sources
          </button>
          {showSources && (
            <ul className="mt-2 space-y-1.5">
              {brief.sources.map((src, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span className={`px-1 py-0.5 rounded text-xs font-medium ${SOURCE_BADGE[src.source]}`}>
                    {SOURCE_LABELS[src.source]}
                  </span>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 hover:text-indigo-600 truncate max-w-xs"
                    title={src.title}
                  >
                    {src.title || src.url}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        onClick={onProceed}
        disabled={isLoading}
        className="w-full bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="research-proceed-button"
      >
        {isLoading ? "Generating outline..." : "Generate Outline with Research →"}
      </button>
    </div>
  );
}
