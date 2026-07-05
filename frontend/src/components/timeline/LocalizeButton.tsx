"use client";
import React, { useState } from "react";

/** BCP-47 language codes shown in the dropdown. */
const LANGUAGES = [
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "pl", label: "Polish" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese (Simplified)" },
];

/** ElevenLabs multilingual voices best suited for dubbing. */
const DUBBING_VOICES = [
  { voiceId: "21m00Tcm4TlvDq8ikWAM", label: "Rachel (ElevenLabs, multilingual)" },
  { voiceId: "ErXwobaYiN019PkySvjV", label: "Antoni (ElevenLabs, multilingual)" },
  { voiceId: "piper_de_de_thorsten_medium", label: "Thorsten (Local DE, free)" },
  { voiceId: "piper_fr_fr_upmc_pierre_medium", label: "Pierre (Local FR, free)" },
  { voiceId: "piper_pl_pl_gosia_medium", label: "Gosia (Local PL, free)" },
  { voiceId: "piper_es_es_carlfm_x_low", label: "Carlos (Local ES, free)" },
];

interface LocalizeButtonProps {
  projectId: string;
  /** Called when the localization job is successfully started. */
  onStarted?: (childProjectId: string) => void;
}

type State = "idle" | "open" | "submitting" | "done" | "error";

export function LocalizeButton({ projectId, onStarted }: LocalizeButtonProps) {
  const [state, setState] = useState<State>("idle");
  const [targetLanguage, setTargetLanguage] = useState(LANGUAGES[0].code);
  const [targetVoiceId, setTargetVoiceId] = useState(DUBBING_VOICES[0].voiceId);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleOpen = () => {
    setState("open");
    setErrorMsg(null);
  };

  const handleClose = () => setState("idle");

  const handleSubmit = async () => {
    setState("submitting");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/localize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLanguage, targetVoiceId, regenerateVisuals: false }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? `Server error ${res.status}`);
      }

      const data = await res.json() as { childProjectId: string };
      setState("done");
      onStarted?.(data.childProjectId);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Unexpected error");
      setState("error");
    }
  };

  if (state === "idle") {
    return (
      <button
        onClick={handleOpen}
        data-testid="localize-btn"
        className="px-3 py-1.5 text-sm bg-violet-50 text-violet-700 border border-violet-200 rounded hover:bg-violet-100"
      >
        Localize / Dub
      </button>
    );
  }

  if (state === "done") {
    return (
      <span className="text-sm text-green-700 font-medium px-3 py-1.5 bg-green-50 border border-green-200 rounded">
        Localization started ✓
      </span>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="localize-modal"
    >
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Localize & Dub Project</h2>
        <p className="text-sm text-gray-600">
          Translate all scene narrations and regenerate audio in the target language.
          A new child project will be created — the original is not modified.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Target Language</label>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              data-testid="language-select"
              className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Voice for Dubbing</label>
            <select
              value={targetVoiceId}
              onChange={(e) => setTargetVoiceId(e.target.value)}
              data-testid="voice-select"
              className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
            >
              {DUBBING_VOICES.map((v) => (
                <option key={v.voiceId} value={v.voiceId}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {state === "error" && errorMsg && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {errorMsg}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleClose}
            disabled={state === "submitting"}
            className="px-4 py-2 text-sm text-gray-600 border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={state === "submitting"}
            data-testid="localize-submit-btn"
            className="px-4 py-2 text-sm bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-50"
          >
            {state === "submitting" ? "Starting…" : "Start Localization"}
          </button>
        </div>
      </div>
    </div>
  );
}
