"use client";
import React, { memo, useCallback, useEffect, useState } from "react";
import { useTimelineStore } from "@/store/timelineStore";
import type { SceneState } from "@/store/timelineStore";
import { SceneThumbnail } from "./SceneThumbnail";
import { AudioPlayer } from "./AudioPlayer";
import { VisualPromptField } from "./VisualPromptField";
import { NarrationField } from "./NarrationField";
import { SceneMetadata } from "./SceneMetadata";
import { AvatarConfigPanel } from "./AvatarConfigPanel";

export interface SceneCardProps {
  sceneId: string;
  projectId?: string;
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
  runway:   "bg-accent/10 text-accent border border-accent/20",
  kling:    "bg-info-dim text-info-glow border border-info/20",
  pexels:   "bg-success-bg text-success-text border border-success-border",
  archival: "bg-warning-bg text-warning-text border border-warning-border",
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

function SceneCardInner({ sceneId, projectId, onSeekClick }: SceneCardProps) {
  const scene = useTimelineStore((s) => s.scenes[sceneId], areScenesEqual);
  const [showEffects, setShowEffects] = useState(false);
  const [showAvatar, setShowAvatar] = useState(false);
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

  const isRegenerating = scene.status === "regenerating";

  return (
    <div
      data-testid={`scene-card-${sceneId}`}
      className="bg-panel border border-line rounded-xl p-4 hover:border-line-strong transition-colors"
    >
      <div className="flex gap-3">
        <SceneThumbnail
          videoUrl={scene.videoUrl}
          isRegenerating={isRegenerating}
        />
        <div className="flex-1 space-y-3 min-w-0">
          {/* Header row */}
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
                className="px-2 py-0.5 text-xs text-ink-secondary bg-subtle border border-line rounded-md hover:bg-hover hover:text-ink transition-colors"
              >
                + Add
              </button>
              <button
                onClick={() => setShowEffects((v) => !v)}
                title="Text overlay / effects"
                className={`px-2 py-0.5 text-xs border rounded-md transition-colors ${
                  showEffects
                    ? "bg-accent/15 text-accent border-accent/25"
                    : "bg-subtle text-ink-secondary border-line hover:bg-hover hover:text-ink"
                }`}
              >
                Fx
              </button>
              <button
                onClick={() => setShowAvatar((v) => !v)}
                title="Talking head / avatar"
                data-testid="avatar-toggle-btn"
                className={`px-2 py-0.5 text-xs border rounded-md transition-colors ${
                  showAvatar
                    ? "bg-accent/15 text-accent border-accent/25"
                    : "bg-subtle text-ink-secondary border-line hover:bg-hover hover:text-ink"
                }`}
              >
                Avatar
              </button>
              <button
                onClick={handleDelete}
                title="Delete scene"
                className="px-2 py-0.5 text-xs bg-danger-bg text-danger-text border border-danger-border rounded-md hover:opacity-80 transition-opacity"
              >
                ✕
              </button>
            </div>
          </div>

          <AudioPlayer
            audioUrl={scene.audioUrl}
            onDurationDetected={(seconds) => {
              // P2: sync actual audio duration → composition durationInFrames
              if (Math.abs((scene.durationInSeconds ?? 0) - seconds) > 0.1) {
                useTimelineStore.getState().updateSceneField(sceneId, "durationInSeconds", seconds);
              }
            }}
          />

          <VisualPromptField
            value={scene.visualPrompt}
            onChange={handleVisualPromptChange}
            onRegenerate={handleRegenerate}
            isRegenerating={isRegenerating}
            costBadge={visualCostEst}
          />

          {/* Provider badge */}
          {scene.videoProvider && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-2xs font-medium ${PROVIDER_BADGE_STYLES[scene.videoProvider] ?? "bg-subtle text-ink-muted border border-line"}`}>
              {PROVIDER_LABELS[scene.videoProvider] ?? scene.videoProvider}
            </span>
          )}

          {/* S4: Transition selector */}
          <div className="flex items-center gap-2">
            <label className="text-2xs text-ink-muted font-semibold uppercase tracking-wide">Transition in:</label>
            <select
              value={scene.transitionType ?? "fade"}
              onChange={(e) =>
                useTimelineStore.getState().updateSceneField(sceneId, "transitionType", e.target.value)
              }
              className="text-xs text-ink bg-muted border border-line rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              <option value="fade">Fade</option>
              <option value="slide">Slide</option>
              <option value="wipe">Wipe</option>
              <option value="flip">Flip</option>
              <option value="clock-wipe">Clock Wipe</option>
              <option value="film-burn">Film Burn</option>
              <option value="none">Cut (none)</option>
            </select>
          </div>

          {/* Custom video URL */}
          <div>
            <button
              onClick={() => setShowVideoUrlInput((v) => !v)}
              className="text-xs text-ink-muted hover:text-ink-secondary underline underline-offset-2 transition-colors"
            >
              {showVideoUrlInput ? "Cancel" : "Use video URL instead"}
            </button>
            {showVideoUrlInput && (
              <div className="flex gap-2 mt-1.5">
                <input
                  type="url"
                  value={videoUrlInput}
                  onChange={(e) => setVideoUrlInput(e.target.value)}
                  placeholder="https://…"
                  className="flex-1 text-sm text-ink bg-muted border border-line rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
                <button
                  onClick={handleSetVideoUrl}
                  disabled={isRegenerating}
                  className="px-3 py-1 text-xs bg-accent/10 text-accent border border-accent/20 rounded-lg hover:bg-accent/15 disabled:opacity-40 transition-colors"
                >
                  Set
                </button>
              </div>
            )}
          </div>

          {/* Voice selector */}
          <div className="flex items-center gap-2">
            <label className="text-2xs text-ink-muted font-semibold uppercase tracking-wide">Voice:</label>
            <select
              value={selectedVoiceId}
              onChange={(e) => setSelectedVoiceId(e.target.value)}
              className="text-xs text-ink bg-muted border border-line rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
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
            isRegenerating={isRegenerating}
          />

          {/* Subtitles */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={handleGenerateSubtitles}
              disabled={!scene.audioUrl || isRegenerating}
              title={!scene.audioUrl ? "Generate audio first" : "Generate subtitles from narration audio"}
              className="px-2 py-0.5 text-xs bg-info-dim text-info-glow border border-info/20 rounded-md hover:opacity-80 disabled:opacity-40 transition-opacity"
            >
              {scene.subtitleTrack ? "Regenerate Subtitles" : "Generate Subtitles"}
            </button>
            {scene.subtitleTrack && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-2xs font-medium bg-info-dim text-info-glow border border-info/20">
                CC {scene.subtitleTrack.provider === "whisper_local" ? "(local)" : "(API)"}
              </span>
            )}
            {scene.subtitleTrack?.vttUrl && (
              <a href={scene.subtitleTrack.vttUrl} download className="text-xs text-accent hover:text-accent-hover transition-colors">VTT ↓</a>
            )}
            {scene.subtitleTrack?.srtUrl && (
              <a href={scene.subtitleTrack.srtUrl} download className="text-xs text-accent hover:text-accent-hover transition-colors">SRT ↓</a>
            )}
          </div>

          {/* Avatar panel */}
          {showAvatar && (
            <AvatarConfigPanel
              sceneId={sceneId}
              projectId={projectId}
              onGenerated={(videoUrl, provider) => {
                const s = useTimelineStore.getState().scenes[sceneId];
                useTimelineStore.getState().updateSceneUrls(sceneId, s?.audioUrl ?? "", videoUrl, provider);
              }}
            />
          )}

          {/* Text overlay / effects panel */}
          {showEffects && (
            <div className="p-3 bg-accent/8 border border-accent/15 rounded-xl space-y-2">
              <p className="text-2xs font-semibold text-accent uppercase tracking-wide">Text Overlay</p>
              <input
                type="text"
                value={scene.textOverlay?.text ?? ""}
                onChange={(e) => handleTextOverlayChange("text", e.target.value)}
                placeholder="Overlay text (leave empty to disable)"
                className="w-full text-sm text-ink bg-muted border border-line rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-2xs text-ink-muted">Style</label>
                  <select
                    value={scene.textOverlay?.style ?? "standard"}
                    onChange={(e) => handleTextOverlayChange("style", e.target.value)}
                    className="w-full text-xs text-ink bg-muted border border-line rounded-md px-1.5 py-0.5 mt-0.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
                  >
                    <option value="standard">Standard</option>
                    <option value="punchy">Punchy</option>
                    <option value="funny_sub">Funny Sub</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-2xs text-ink-muted">Position</label>
                  <select
                    value={scene.textOverlay?.position ?? "bottom"}
                    onChange={(e) => handleTextOverlayChange("position", e.target.value)}
                    className="w-full text-xs text-ink bg-muted border border-line rounded-md px-1.5 py-0.5 mt-0.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
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
