"use client";

import { VOICE_PROFILES, type Language } from "@/lib/voice-profiles";

interface LanguageSelectorProps {
  value: Language;
  onChange: (lang: Language) => void;
}

const LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "pl", label: "PL" },
  { code: "de", label: "DE" },
  { code: "fr", label: "FR" },
  { code: "es", label: "ES" },
];

export function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  const profile = VOICE_PROFILES[value];

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Language)}
        className="text-sm border rounded px-2 py-1"
        data-testid="language-selector"
      >
        {LANGUAGES.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <span className="text-xs text-gray-500" data-testid="voice-label">
        Voice: {profile.displayName} ({profile.languageLabel})
      </span>
    </div>
  );
}
