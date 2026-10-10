"use client";

import React, { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFoot,
  CardHead,
  Checkbox,
  InlineAlert,
  SegmentedControl,
  Select,
  Switch,
  TextArea,
  TextField,
} from "@/components/ui";

export type BriefFormData = {
  brief: string;
  nicheId: string | null;
  characterIds: string[];
  budgetUsd: number;
  duration: 15 | 30 | 45;
  shotTrack: "i2v" | "v2v" | "mix";
  hitl: boolean;
};

export type BriefComposerProps = {
  onGenerate: (data: BriefFormData) => void;
  defaultBrief?: string;
  defaultDuration?: 15 | 30 | 45;
  defaultHitl?: boolean;
  niches: { id: string; name: string }[];
  characters: { id: string; name: string; consent: string }[];
  moderation?: string;
  estimatedCost?: { min: number; max: number };
  estimatedTime?: string;
  loading?: boolean;
};

const SCENE_COUNT: Record<15 | 30 | 45, number> = {
  15: 3,
  30: 6,
  45: 8,
};

const DURATION_OPTIONS = [
  { value: "15", label: "15 s — 3 sceny" },
  { value: "30", label: "30 s — 6 scen" },
  { value: "45", label: "45 s — 8 scen" },
];

const SHOT_TRACK_OPTIONS = [
  { value: "i2v", label: "I2V" },
  { value: "v2v", label: "V2V" },
  { value: "mix", label: "Mix" },
];

export function BriefComposer({
  onGenerate,
  defaultBrief = "",
  defaultDuration = 30,
  defaultHitl = true,
  niches,
  characters,
  moderation,
  estimatedCost,
  estimatedTime,
  loading = false,
}: BriefComposerProps) {
  const [brief, setBrief] = useState(defaultBrief);
  const [nicheId, setNicheId] = useState<string | null>(null);
  const [characterIds, setCharacterIds] = useState<string[]>([]);
  const [budgetUsd, setBudgetUsd] = useState(4);
  const [duration, setDuration] = useState<15 | 30 | 45>(defaultDuration);
  const [shotTrack, setShotTrack] = useState<"i2v" | "v2v" | "mix">("i2v");
  const [hitl, setHitl] = useState(defaultHitl);

  const sceneCount = SCENE_COUNT[duration];
  const isDisabled = brief.trim() === "" || brief.length > 280 || !!moderation;

  const briefAlertTone: "warn" | "danger" | null =
    brief.length > 280 ? "danger" : brief.length > 260 ? "warn" : null;

  function handleSubmit() {
    if (isDisabled) return;
    onGenerate({
      brief,
      nicheId,
      characterIds,
      budgetUsd,
      duration,
      shotTrack,
      hitl,
    });
  }

  function handleCharacterChange(id: string, checked: boolean) {
    setCharacterIds((prev) =>
      checked ? [...prev, id] : prev.filter((cid) => cid !== id)
    );
  }

  const nicheOptions = [
    { value: "", label: "— brak —" },
    ...niches.map((n) => ({ value: n.id, label: n.name })),
  ];

  return (
    <Card>
      <CardHead>
        <span className="vf-text-sm vf-text-bold">Nowy Short</span>
        <Badge tone="info">I2V</Badge>
      </CardHead>
      <CardBody className="flex flex-col gap-4">
        <div>
          <TextArea
            label="Brief"
            maxLength={280}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={4}
            hint={`${brief.length}/280 znaków`}
            error={
              brief.length > 280
                ? "Przekroczono limit 280 znaków"
                : undefined
            }
          />
          {briefAlertTone && (
            <InlineAlert
              tone={briefAlertTone}
              title={
                briefAlertTone === "danger"
                  ? "Przekroczono limit"
                  : "Zbliżasz się do limitu"
              }
              className="mt-2"
            >
              {briefAlertTone === "danger"
                ? "Brief przekracza 280 znaków i nie może zostać wysłany."
                : "Pozostało mniej niż 20 znaków do limitu 280."}
            </InlineAlert>
          )}
          {moderation && (
            <InlineAlert tone="danger" title="Treść zablokowana" className="mt-2">
              {moderation}
            </InlineAlert>
          )}
        </div>
        <Select
          label="Profil niszy (opcjonalnie)"
          options={nicheOptions}
          value={nicheId ?? ""}
          onChange={(e) => setNicheId(e.target.value || null)}
        />
        {characters.length > 0 && (
          <div>
            <label className="vf-label">Postacie</label>
            <div className="flex flex-col gap-1 mt-1 max-h-32 overflow-y-auto">
              {characters.map((c) => (
                <Checkbox
                  key={c.id}
                  label={c.name}
                  checked={characterIds.includes(c.id)}
                  onChange={(checked) => handleCharacterChange(c.id, checked)}
                />
              ))}
            </div>
          </div>
        )}
        <TextField
          label="Limit budżetu"
          type="number"
          suffix="USD"
          value={String(budgetUsd)}
          onChange={(e) => setBudgetUsd(Number(e.target.value))}
        />
        <div>
          <label className="vf-label">Długość</label>
          <div className="mt-1">
            <SegmentedControl
              options={DURATION_OPTIONS}
              value={String(duration)}
              onChange={(v) => setDuration(Number(v) as 15 | 30 | 45)}
            />
          </div>
        </div>
        <div>
          <label className="vf-label">Tor ujęć</label>
          <div className="mt-1">
            <SegmentedControl
              options={SHOT_TRACK_OPTIONS}
              value={shotTrack}
              onChange={(v) => setShotTrack(v as "i2v" | "v2v" | "mix")}
            />
          </div>
        </div>
        <Switch
          label="Zatwierdź klatki przed I2V"
          description="Human-in-the-loop — wymaga ręcznej akceptacji keyframe'ów"
          checked={hitl}
          onChange={setHitl}
        />
      </CardBody>
      <CardFoot className="flex items-center gap-4">
        <div className="flex-1 text-xs font-mono text-[var(--ink-faint)]">
          {sceneCount} scen
          {estimatedCost &&
            ` · $${estimatedCost.min.toFixed(2)}–$${estimatedCost.max.toFixed(2)}`}
          {estimatedTime && ` · ${estimatedTime}`}
        </div>
        <Button
          variant="primary"
          loading={loading}
          disabled={isDisabled}
          onClick={handleSubmit}
        >
          Generuj Scene Plan
        </Button>
      </CardFoot>
    </Card>
  );
}
