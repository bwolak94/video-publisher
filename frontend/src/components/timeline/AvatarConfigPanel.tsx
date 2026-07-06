"use client";
import React, { useState } from "react";

export type AvatarProvider = "heygen" | "did" | "wav2lip_local";

interface AvatarConfigPanelProps {
  sceneId: string;
  projectId?: string;
  onGenerated?: (videoUrl: string, provider: string) => void;
}

const PROVIDER_OPTIONS: { value: AvatarProvider; label: string }[] = [
  { value: "wav2lip_local", label: "Wav2Lip (Local, free)" },
  { value: "heygen",        label: "HeyGen (Cloud)" },
  { value: "did",           label: "D-ID (Cloud)" },
];

type GenerateState = "idle" | "generating" | "done" | "error";

export function AvatarConfigPanel({ sceneId, projectId, onGenerated }: AvatarConfigPanelProps) {
  const [provider, setProvider] = useState<AvatarProvider>("wav2lip_local");
  const [avatarImageUrl, setAvatarImageUrl] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [state, setState] = useState<GenerateState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!avatarImageUrl.trim()) {
      setErrorMsg("Paste the s3:// URL of the presenter photo first.");
      return;
    }
    if (!projectId) {
      setErrorMsg("Project ID is required.");
      return;
    }

    setState("generating");
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/scenes/${sceneId}/generate-avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          avatarImageUrl: avatarImageUrl.trim(),
          provider,
          ...(avatarId.trim() ? { avatarId: avatarId.trim() } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? `Server error ${res.status}`);
      }

      const data = await res.json() as { videoUrl: string; provider: string };
      setState("done");
      onGenerated?.(data.videoUrl, data.provider);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Generation failed");
      setState("error");
    }
  };

  return (
    <div
      className="mt-2 p-3 bg-violet-50 border border-violet-200 rounded space-y-2"
      data-testid="avatar-config-panel"
    >
      <p className="text-xs font-medium text-violet-700">Talking Head / Avatar</p>

      <div>
        <label className="text-xs text-gray-500 block mb-0.5">Provider</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as AvatarProvider)}
          data-testid="avatar-provider-select"
          className="w-full text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400"
        >
          {PROVIDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-0.5">
          Presenter Photo URL <span className="text-gray-400">(s3://… or https://…)</span>
        </label>
        <input
          type="text"
          value={avatarImageUrl}
          onChange={(e) => setAvatarImageUrl(e.target.value)}
          placeholder="s3://bucket/presenter.jpg"
          data-testid="avatar-image-url-input"
          className="w-full text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400"
        />
      </div>

      {provider === "heygen" && (
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">
            HeyGen Avatar ID <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={avatarId}
            onChange={(e) => setAvatarId(e.target.value)}
            placeholder="josh_lite3_20230714"
            data-testid="heygen-avatar-id-input"
            className="w-full text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400"
          />
        </div>
      )}

      {errorMsg && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
          {errorMsg}
        </p>
      )}

      {state === "done" && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
          Avatar video generated ✓
        </p>
      )}

      <button
        onClick={handleGenerate}
        disabled={state === "generating"}
        data-testid="generate-avatar-btn"
        className="w-full px-2 py-1 text-xs bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-50"
      >
        {state === "generating" ? "Generating…" : "Generate Avatar Video"}
      </button>
    </div>
  );
}
