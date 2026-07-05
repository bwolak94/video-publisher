"use client";
import React, { memo, useCallback, useEffect, useState } from "react";
import { useTimelineStore } from "@/store/timelineStore";
import type { SceneState } from "@/store/timelineStore";
import { SceneThumbnail } from "./SceneThumbnail";
import { AudioPlayer } from "./AudioPlayer";
import { VisualPromptField } from "./VisualPromptField";
import { NarrationField } from "./NarrationField";
import { SceneMetadata } from "./SceneMetadata";

export interface SceneCardProps {
  sceneId: string;
  onSeekClick?: () => void;
}

export function areScenesEqual(a: SceneState, b: SceneState): boolean {
  return (
    a.sceneId === b.sceneId &&
    a.narrationText === b.narrationText &&
    a.visualPrompt === b.visualPrompt &&
    a.audioUrl === b.audioUrl &&
    a.videoUrl === b.videoUrl &&
    a.isDirty === b.isDirty &&
    a.status === b.status &&
    a.durationInSeconds === b.durationInSeconds &&
    a.textOverlay?.text === b.textOverlay?.text &&
    a.textOverlay?.style === b.textOverlay?.style &&
    a.textOverlay?.position === b.textOverlay?.position &&
    a.subtitleTrack?.generatedAt === b.subtitleTrack?.generatedAt
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  runway: "Runway AI",
  kling: "Kling AI",
  pexels: "Pexels",
  archival: "Archival (free)",
};

const PROVIDER_BADGE_STYLES: Record<string, string> = {
  runway:   "bg-purple-100 text-purple-700",
  kling:    "bg-blue-100 text-blue-700",
  pexels:   "bg-green-100 text-green-700",
  archival: "bg-amber-100 text-amber-700",
};

const ELEVENLABS_VOICES = [
  { voiceId: "21m00Tcm4TlvDq8ikWAM", label: "Rachel (EN)" },
  { voiceId: "AZnzlk1XvdvUeBnXmlld", label: "Domi (EN)" },
  { voiceId: "EXAVITQu4vr4xnSDxMaL", label: "Bella (EN)" },
  { voiceId: "ErXwobaYiN019PkySvjV", label: "Antoni (EN)" },
  { voiceId: "eleven_en_adam",   label: "Adam (EN)" },
  { voiceId: "eleven_pl_marek",  label: "Marek (PL)" },
  { voiceId: "eleven_de_lukas",  label: "Lukas (DE)" },
  { voiceId: "eleven_fr_pierre", label: "Pierre (FR)" },
  { voiceId: "eleven_es_carlos", label: "Carlos (ES)" },
];

const PIPER_VOICES = [
  { voiceId: "piper_en_us_lessac_medium", label: "Amy (Local EN-US, free)" },
  { voiceId: "piper_en_gb_alan_medium",   label: "Alan (Local EN-GB, free)" },
  { voiceId: "piper_de_de_thorsten_medium", label: "Thorsten (Local DE, free)" },
  { voiceId: "piper_fr_fr_upmc_pierre_medium", label: "Pierre (Local FR, free)" },
  { voiceId: "piper_es_es_carlfm_x_low", label: "Carlos (Local ES, free)" },
  { voiceId: "piper_pl_pl_gosia_medium",  label: "Gosia (Local PL, free)" },
];

function SceneCardInner({ sceneId, onSeekClick }: SceneCardProps) {
  const scene = useTimelineStore((s) => s.scenes[sceneId], areScenesEqual);
  const [showEffects, setShowEffects] = useState(false);
  const [showVideoUrlInput, setShowVideoUrlInput] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState(ELEVENLABS_VOICES[0].voiceId);
  const [visualCostEst, setVisualCostEst] = useState<string | null>(null);

  // Fetch cost estimate for visual regeneration once per scene (FEATURE-09)
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`/api/scenes/${sceneId}/cost-estimate?action=regenerate_visual`);
        if (!r?.ok) return;
        const data = await r.json() as { estimatedCost?: number } | null;
        if (data?.estimatedCost != null) {
          setVisualCostEst(data.estimatedCost === 0 ? "free" : `~$${data.estimatedCost.toFixed(2)}`);
        }
      } catch {
        // ignore network errors or test environment
      }
    })();
  }, [sceneId]);

  const handleVisualPromptChange = useCallback(
    (value: string) => {
      useTimelineStore.getState().updateSceneField(sceneId, "visualPrompt", value);
    },
    [sceneId]
  );

  const handleNarrationChange = useCallback(
    (value: string) => {
      useTimelineStore.getState().updateSceneField(sceneId, "narrationText", value);
    },
    [sceneId]
  );

  const handleRegenerate = useCallback(() => {
    const store = useTimelineStore.getState();
    const currentScene = store.scenes[sceneId];
    store.markSceneStatus(sceneId, "regenerating");
    fetch(`/api/scenes/${sceneId}/regenerate-visual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visualPrompt: currentScene?.visualPrompt ?? "" }),
    })
      .then((res) => res.json())
      .then((data: { videoUrl: string; provider?: string }) => {
        const s = useTimelineStore.getState().scenes[sceneId];
        store.updateSceneUrls(sceneId, s?.audioUrl ?? "", data.videoUrl, data.provider);
      })
      .catch(() => {
        store.markSceneStatus(sceneId, "error");
      });
  }, [sceneId]);

  const handleUpdateVoice = useCallback(() => {
    const store = useTimelineStore.getState();
    const currentScene = store.scenes[sceneId];
    store.markSceneStatus(sceneId, "regenerating");
    fetch(`/api/scenes/${sceneId}/update-voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voiceId: selectedVoiceId,
        narrationText: currentScene?.narrationText ?? "",
      }),
    })
      .then((res) => res.json())
      .then((data: { audioUrl: string }) => {
        const s = useTimelineStore.getState().scenes[sceneId];
        store.updateSceneUrls(sceneId, data.audioUrl, s?.videoUrl ?? "");
      })
      .catch(() => {
        store.markSceneStatus(sceneId, "error");
      });
  }, [sceneId, selectedVoiceId]);

  const handleSetVideoUrl = useCallback(() => {
    if (!videoUrlInput.trim()) return;
    const store = useTimelineStore.getState();
    store.markSceneStatus(sceneId, "regenerating");
    fetch(`/api/scenes/${sceneId}/set-video-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: videoUrlInput.trim() }),
    })
      .then((res) => res.json())
      .then((data: { videoUrl: string }) => {
        const currentScene = useTimelineStore.getState().scenes[sceneId];
        store.updateSceneUrls(sceneId, currentScene?.audioUrl ?? "", data.videoUrl);
        setShowVideoUrlInput(false);
        setVideoUrlInput("");
      })
      .catch(() => store.markSceneStatus(sceneId, "error"));
  }, [sceneId, videoUrlInput]);

  const handleGenerateSubtitles = useCallback(() => {
    const store = useTimelineStore.getState();
    store.markSceneStatus(sceneId, "regenerating");
    fetch(`/api/scenes/${sceneId}/generate-subtitles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: "en" }),
    })
      .then((res) => res.json())
      .then((data: { srtUrl: string; vttUrl: string; wordCount: number; language: string; provider: string }) => {
        store.updateSceneSubtitleTrack(sceneId, {
          words: [],  // words are persisted server-side; client only needs URLs
          srtUrl: data.srtUrl,
          vttUrl: data.vttUrl,
          language: data.language,
          provider: data.provider as "whisper_local" | "whisper_api",
          generatedAt: new Date().toISOString(),
        });
        store.markSceneStatus(sceneId, "idle");
      })
      .catch(() => store.markSceneStatus(sceneId, "error"));
  }, [sceneId]);

  const handleDelete = useCallback(() => {
    useTimelineStore.getState().deleteScene(sceneId);
  }, [sceneId]);

  const handleAddAfter = useCallback(() => {
    useTimelineStore.getState().addScene(sceneId);
  }, [sceneId]);

  const handleTextOverlayChange = useCallback(
    (field: "text" | "style" | "position", value: string) => {
      const current = useTimelineStore.getState().scenes[sceneId]?.textOverlay;
      useTimelineStore.getState().updateSceneField(sceneId, "textOverlay", {
        text: current?.text ?? "",
        style: current?.style ?? "standard",
        position: current?.position ?? "bottom",
        [field]: value,
      });
    },
    [sceneId]
  );

  if (!scene) return null;

  return (
    <div
      data-testid={`scene-card-${sceneId}`}
      className="bg-white border rounded-lg p-4 shadow-sm"
    >
      <div className="flex gap-4">
        <SceneThumbnail
          videoUrl={scene.videoUrl}
          isRegenerating={scene.status === "regenerating"}
        />
        <div className="flex-1 space-y-2 min-w-0">
          {/* Header row with metadata + action buttons */}
          <div className="flex items-center justify-between">
            <SceneMetadata
              sceneId={sceneId}
              durationInSeconds={scene.durationInSeconds}
              isDirty={scene.isDirty}
              onClick={onSeekClick}
            />
            <div className="flex gap-1">
              <button
                onClick={handleAddAfter}
                title="Add scene after"
                className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 border border-gray-200 rounded hover:bg-gray-200"
              >
                + Add
              </button>
              <button
                onClick={() => setShowEffects((v) => !v)}
                title="Text overlay / effects"
                className={`px-2 py-0.5 text-xs border rounded ${showEffects ? "bg-purple-100 text-purple-700 border-purple-200" : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"}`}
              >
                Fx
              </button>
              <button
                onClick={handleDelete}
                title="Delete scene"
                className="px-2 py-0.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
              >
                ✕
              </button>
            </div>
          </div>

          <AudioPlayer audioUrl={scene.audioUrl} />

          <VisualPromptField
            value={scene.visualPrompt}
            onChange={handleVisualPromptChange}
            onRegenerate={handleRegenerate}
            isRegenerating={scene.status === "regenerating"}
            costBadge={visualCostEst}
          />

          {/* Provider badge */}
          {scene.videoProvider && (
            <div className="flex items-center gap-1">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${PROVIDER_BADGE_STYLES[scene.videoProvider] ?? "bg-gray-100 text-gray-600"}`}>
                {PROVIDER_LABELS[scene.videoProvider] ?? scene.videoProvider}
              </span>
            </div>
          )}

          {/* Custom video URL input */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVideoUrlInput((v) => !v)}
              className="text-xs text-gray-500 underline hover:text-gray-700"
            >
              {showVideoUrlInput ? "Cancel" : "Use video URL instead"}
            </button>
          </div>
          {showVideoUrlInput && (
            <div className="flex gap-2">
              <input
                type="url"
                value={videoUrlInput}
                onChange={(e) => setVideoUrlInput(e.target.value)}
                placeholder="https://..."
                className="flex-1 text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <button
                onClick={handleSetVideoUrl}
                disabled={scene.status === "regenerating"}
                className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100 disabled:opacity-50"
              >
                Set
              </button>
            </div>
          )}

          {/* Voice selector + narration */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Voice:</label>
            <select
              value={selectedVoiceId}
              onChange={(e) => setSelectedVoiceId(e.target.value)}
              className="text-xs border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <optgroup label="ElevenLabs (cloud)">
                {ELEVENLABS_VOICES.map((v) => (
                  <option key={v.voiceId} value={v.voiceId}>{v.label}</option>
                ))}
              </optgroup>
              <optgroup label="Piper (local, free)">
                {PIPER_VOICES.map((v) => (
                  <option key={v.voiceId} value={v.voiceId}>{v.label}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <NarrationField
            value={scene.narrationText}
            onChange={handleNarrationChange}
            onUpdateVoice={handleUpdateVoice}
            isRegenerating={scene.status === "regenerating"}
          />

          {/* Subtitle generation */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateSubtitles}
              disabled={!scene.audioUrl || scene.status === "regenerating"}
              title={!scene.audioUrl ? "Generate audio first" : "Generate subtitles from narration audio"}
              className="px-2 py-0.5 text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded hover:bg-teal-100 disabled:opacity-40"
            >
              {scene.subtitleTrack ? "Regenerate Subtitles" : "Generate Subtitles"}
            </button>
            {scene.subtitleTrack && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-700">
                CC {scene.subtitleTrack.provider === "whisper_local" ? "(local)" : "(API)"}
              </span>
            )}
            {scene.subtitleTrack?.vttUrl && (
              <a
                href={scene.subtitleTrack.vttUrl}
                download
                className="text-xs text-teal-600 underline hover:text-teal-800"
              >
                VTT
              </a>
            )}
            {scene.subtitleTrack?.srtUrl && (
              <a
                href={scene.subtitleTrack.srtUrl}
                download
                className="text-xs text-teal-600 underline hover:text-teal-800"
              >
                SRT
              </a>
            )}
          </div>

          {/* Text overlay / effects panel */}
          {showEffects && (
            <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded space-y-2">
              <p className="text-xs font-medium text-purple-700">Text Overlay</p>
              <input
                type="text"
                value={scene.textOverlay?.text ?? ""}
                onChange={(e) => handleTextOverlayChange("text", e.target.value)}
                placeholder="Overlay text (leave empty to disable)"
                className="w-full text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-400"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Style</label>
                  <select
                    value={scene.textOverlay?.style ?? "standard"}
                    onChange={(e) => handleTextOverlayChange("style", e.target.value)}
                    className="w-full text-xs border rounded px-1 py-0.5 mt-0.5"
                  >
                    <option value="standard">Standard</option>
                    <option value="punchy">Punchy</option>
                    <option value="funny_sub">Funny Sub</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Position</label>
                  <select
                    value={scene.textOverlay?.position ?? "bottom"}
                    onChange={(e) => handleTextOverlayChange("position", e.target.value)}
                    className="w-full text-xs border rounded px-1 py-0.5 mt-0.5"
                  >
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const SceneCard = memo(
  SceneCardInner,
  (prev, next) => prev.sceneId === next.sceneId
);
