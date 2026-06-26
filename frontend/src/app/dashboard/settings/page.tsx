"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const MASK = "__STORED__";

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = "integrations" | "youtube" | "worker" | "budget" | "alerts";

interface SettingsDto {
  integrations: Record<string, string>;
  worker: { enabled: boolean; cronSchedule: string; nicheProfileId: string; minViralityScore: number; dedupWindowHours: number; aiBackendUrl: string };
  alerts: Record<string, string>;
  costRates: Record<string, string>;
}

interface Channel {
  id: string;
  channelId: string;
  channelName: string | null;
  monthlyBudgetUsd: string;
  currentMonthSpendUsd: string;
  createdAt: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPut(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
}

async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 mb-5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{children}</p>;
}

function ApiKeyInput({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  const isStored = value === MASK;
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <input
          type={show ? "text" : "password"}
          className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          placeholder={isStored ? "••••••••••••  (stored encrypted)" : placeholder}
          value={isStored ? "" : value}
          onChange={(e) => onChange(e.target.value)}
        />
        {isStored && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600 font-medium">
            ✓ Set
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="px-3 py-2 border rounded-md text-xs text-gray-500 hover:bg-gray-50 transition-colors"
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function SaveButton({ onClick, saving, saved, error }: { onClick: () => void; saving: boolean; saved: boolean; error: string | null }) {
  return (
    <div className="flex items-center gap-3 mt-4">
      <button
        onClick={onClick}
        disabled={saving}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          saved ? "bg-green-50 text-green-700 border border-green-200" : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        }`}
      >
        {saving ? "Saving…" : saved ? "✓ Saved" : "Save changes"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ── Tab: Integrations ─────────────────────────────────────────────────────────

function IntegrationsTab({ initial }: { initial: Record<string, string> }) {
  const [fields, setFields] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string) => (v: string) => { setFields((p) => ({ ...p, [k]: v })); setSaved(false); };

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await apiPut("/api/settings/integrations", fields);
      setSaved(true);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-4">AI & Media Integrations</h2>
      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <SectionLabel>Voice</SectionLabel>
          <FieldGroup label="ElevenLabs API Key" hint="Required for voice synthesis on every scene.">
            <ApiKeyInput placeholder="sk_…" value={fields.elevenLabsKey ?? ""} onChange={set("elevenLabsKey")} />
          </FieldGroup>

          <SectionLabel>AI Models</SectionLabel>
          <FieldGroup label="OpenAI API Key" hint="DALL-E 3 images + GPT-4o scripting.">
            <ApiKeyInput placeholder="sk-…" value={fields.openaiKey ?? ""} onChange={set("openaiKey")} />
          </FieldGroup>
          <FieldGroup label="Anthropic API Key" hint="Claude as Director/Scriptwriter agent.">
            <ApiKeyInput placeholder="sk-ant-…" value={fields.anthropicKey ?? ""} onChange={set("anthropicKey")} />
          </FieldGroup>
        </div>

        <div>
          <SectionLabel>Video Generation</SectionLabel>
          <FieldGroup label="Runway Gen-3 Alpha API Key" hint="Primary B-roll. Falls back to Pexels if unavailable.">
            <ApiKeyInput placeholder="rw_…" value={fields.runwayKey ?? ""} onChange={set("runwayKey")} />
          </FieldGroup>
          <FieldGroup label="Pexels API Key" hint="Free stock footage fallback.">
            <ApiKeyInput placeholder="…" value={fields.pexelsKey ?? ""} onChange={set("pexelsKey")} />
          </FieldGroup>

          <SectionLabel>Storage (AWS S3)</SectionLabel>
          <FieldGroup label="AWS Access Key ID">
            <ApiKeyInput placeholder="AKIA…" value={fields.awsAccessKey ?? ""} onChange={set("awsAccessKey")} />
          </FieldGroup>
          <FieldGroup label="AWS Secret Access Key">
            <ApiKeyInput placeholder="…" value={fields.awsSecretKey ?? ""} onChange={set("awsSecretKey")} />
          </FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Region">
              <input type="text" className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={fields.awsRegion ?? "eu-central-1"} onChange={(e) => set("awsRegion")(e.target.value)} />
            </FieldGroup>
            <FieldGroup label="S3 Bucket">
              <input type="text" className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="my-video-assets" value={fields.s3Bucket ?? ""} onChange={(e) => set("s3Bucket")(e.target.value)} />
            </FieldGroup>
          </div>
        </div>
      </div>
      <SaveButton onClick={handleSave} saving={saving} saved={saved} error={error} />
    </div>
  );
}

// ── Tab: YouTube Channels ─────────────────────────────────────────────────────

function YouTubeTab() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Channel[]>("/api/settings/channels")
      .then(setChannels)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDisconnect = async (id: string) => {
    if (!confirm("Disconnect this channel? This will remove the stored OAuth token.")) return;
    setDisconnecting(id);
    try {
      await apiDelete(`/api/settings/channels/${id}`);
      setChannels((prev) => prev.filter((c) => c.id !== id));
    } finally { setDisconnecting(null); }
  };

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-1">YouTube Channels</h2>
      <p className="text-sm text-gray-500 mb-6">
        Connect channels for direct publishing. Each requires its own OAuth2 authorization.
        Refresh tokens are encrypted with AES-256-GCM.
      </p>

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Loading channels…</div>
      ) : (
        <>
          {channels.length > 0 && (
            <div className="mb-6 space-y-3">
              {channels.map((ch) => {
                const budget = parseFloat(ch.monthlyBudgetUsd) || 0;
                const spend = parseFloat(ch.currentMonthSpendUsd) || 0;
                const pct = budget > 0 ? Math.min((spend / budget) * 100, 100) : 0;
                return (
                  <div key={ch.id} className="bg-white border rounded-lg px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="#ef4444">
                            <path d="M23.5 6.2a3.02 3.02 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5a3.02 3.02 0 0 0-2.1 2.1C0 8.1 0 12 0 12s0 3.9.5 5.8a3.02 3.02 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3.02 3.02 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{ch.channelName ?? ch.channelId}</p>
                          <p className="text-xs text-gray-400">Connected {new Date(ch.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Connected
                        </span>
                        <button
                          onClick={() => handleDisconnect(ch.id)}
                          disabled={disconnecting === ch.id}
                          className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                        >
                          {disconnecting === ch.id ? "Disconnecting…" : "Disconnect"}
                        </button>
                      </div>
                    </div>
                    {budget > 0 && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Monthly spend</span>
                          <span>${spend.toFixed(2)} / ${budget.toFixed(2)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-indigo-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#ef4444">
                <path d="M23.5 6.2a3.02 3.02 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5a3.02 3.02 0 0 0-2.1 2.1C0 8.1 0 12 0 12s0 3.9.5 5.8a3.02 3.02 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3.02 3.02 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Connect a YouTube Channel</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Redirects to Google OAuth2. PKCE flow — no passwords stored.
              </p>
            </div>
            <a
              href={`${API_BASE}/api/youtube/connect`}
              className="mt-1 inline-flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Connect with Google
            </a>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Worker Mode ──────────────────────────────────────────────────────────

const NICHE_PROFILES = [
  { id: "tech", name: "Technology" }, { id: "finance", name: "Finance" },
  { id: "science", name: "Science" }, { id: "gaming", name: "Gaming" },
  { id: "sports", name: "Sports" }, { id: "health", name: "Health & Wellness" },
  { id: "politics", name: "Politics" }, { id: "business", name: "Business" },
  { id: "entertainment", name: "Entertainment" }, { id: "environment", name: "Environment" },
  { id: "crypto", name: "Crypto & Web3" }, { id: "history", name: "History" },
  { id: "food", name: "Food & Cooking" }, { id: "travel", name: "Travel" },
  { id: "psychology", name: "Psychology" },
];

function WorkerModeTab({ initial }: { initial: SettingsDto["worker"] }) {
  const [cfg, setCfg] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof cfg>(k: K) => (v: (typeof cfg)[K]) => {
    setCfg((p) => ({ ...p, [k]: v })); setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true); setError(null);
    try { await apiPut("/api/settings/worker", cfg); setSaved(true); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-1">Worker Mode</h2>
      <p className="text-sm text-gray-500 mb-6">Autonomous Shorts pipeline. Runs on CRON — no human input needed.</p>

      <div className="flex items-center justify-between border rounded-lg px-5 py-4 mb-6 bg-white">
        <div>
          <p className="text-sm font-medium text-gray-900">Enable Worker Mode</p>
          <p className="text-xs text-gray-400 mt-0.5">Starts the CRON scheduler when enabled.</p>
        </div>
        <button
          onClick={() => set("enabled")(!cfg.enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${cfg.enabled ? "bg-indigo-600" : "bg-gray-200"}`}
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${cfg.enabled ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <FieldGroup label="CRON Schedule" hint='"0 * * * *" = every hour.'>
            <input type="text" className="border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={cfg.cronSchedule} onChange={(e) => set("cronSchedule")(e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Niche Profile" hint="Defines tone, hook pattern, and visual vocabulary.">
            <select className="border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={cfg.nicheProfileId} onChange={(e) => set("nicheProfileId")(e.target.value)}>
              {NICHE_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FieldGroup>
          <FieldGroup label="AI Backend URL" hint="FastAPI backend running CrewAI agents.">
            <input type="text" className="border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={cfg.aiBackendUrl} onChange={(e) => set("aiBackendUrl")(e.target.value)} />
          </FieldGroup>
        </div>

        <div>
          <FieldGroup label={`Min Virality Score: ${cfg.minViralityScore.toFixed(2)}`} hint="Topics below this are skipped.">
            <input type="range" min={0} max={1} step={0.05} value={cfg.minViralityScore}
              onChange={(e) => set("minViralityScore")(parseFloat(e.target.value))}
              className="w-full accent-indigo-600" />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>Low</span><span>High</span></div>
          </FieldGroup>
          <FieldGroup label={`Dedup Window: ${cfg.dedupWindowHours}h`} hint="Re-publish suppression window.">
            <input type="range" min={6} max={168} step={6} value={cfg.dedupWindowHours}
              onChange={(e) => set("dedupWindowHours")(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-600" />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>6h</span><span>7d</span></div>
          </FieldGroup>

          <div className="mt-4 bg-gray-50 border rounded-lg p-4 text-sm space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Summary</p>
            <div className="flex justify-between"><span className="text-gray-500">Status</span>
              <span className={`font-medium ${cfg.enabled ? "text-green-600" : "text-gray-400"}`}>{cfg.enabled ? "Active" : "Disabled"}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Schedule</span>
              <code className="text-xs text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{cfg.cronSchedule}</code></div>
            <div className="flex justify-between"><span className="text-gray-500">Niche</span>
              <span className="text-gray-700">{NICHE_PROFILES.find((p) => p.id === cfg.nicheProfileId)?.name}</span></div>
          </div>
        </div>
      </div>
      <SaveButton onClick={handleSave} saving={saving} saved={saved} error={error} />
    </div>
  );
}

// ── Tab: Budget ───────────────────────────────────────────────────────────────

function BudgetTab({ initialRates }: { initialRates: Record<string, string> }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [rates, setRates] = useState(initialRates);
  const [budgetSaving, setBudgetSaving] = useState<string | null>(null);
  const [ratesSaving, setRatesSaving] = useState(false);
  const [ratesSaved, setRatesSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Channel[]>("/api/settings/channels").then(setChannels).catch(() => {});
  }, []);

  const saveBudget = async (ch: Channel) => {
    setBudgetSaving(ch.id);
    try {
      await apiPut(`/api/settings/channels/${ch.id}/budget`, { monthlyBudgetUsd: ch.monthlyBudgetUsd });
    } finally { setBudgetSaving(null); }
  };

  const updateChannelBudget = (id: string, val: string) => {
    setChannels((prev) => prev.map((c) => c.id === id ? { ...c, monthlyBudgetUsd: val } : c));
  };

  const saveRates = async () => {
    setRatesSaving(true); setError(null);
    try { await apiPut("/api/settings/cost-rates", rates); setRatesSaved(true); }
    catch (e: any) { setError(e.message); }
    finally { setRatesSaving(false); }
  };

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-1">Budget & Cost Controls</h2>
      <p className="text-sm text-gray-500 mb-6">
        Monthly limits per channel. At 80% a warning fires; at 100% the pipeline halts.
      </p>

      <div className="mb-8 space-y-3">
        <SectionLabel>Per-Channel Monthly Budget</SectionLabel>
        {channels.length === 0 && (
          <p className="text-sm text-gray-400 italic">No channels connected yet.</p>
        )}
        {channels.map((ch) => (
          <div key={ch.id} className="bg-white border rounded-lg px-5 py-4 flex items-center gap-6">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{ch.channelName ?? ch.channelId}</p>
              <p className="text-xs text-gray-400">$0 = unlimited</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">$</span>
              <input type="number" min={0} step={10}
                className="w-24 border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={ch.monthlyBudgetUsd}
                onChange={(e) => updateChannelBudget(ch.id, e.target.value)} />
              <span className="text-sm text-gray-400">/ month</span>
              <button onClick={() => saveBudget(ch)} disabled={budgetSaving === ch.id}
                className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {budgetSaving === ch.id ? "…" : "Save"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <SectionLabel>Cost Model (per unit)</SectionLabel>
        <div className="bg-white border rounded-lg p-5 space-y-3">
          {([
            ["ElevenLabs (per character)", "elevenlabsPerChar"],
            ["Runway Gen-3 (per scene)", "runwayPerScene"],
            ["DALL-E 3 (per image)", "dalle3PerImage"],
            ["Lambda render (per minute)", "lambdaPerMin"],
          ] as [string, string][]).map(([label, key]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{label}</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400">$</span>
                <input type="number" step="0.0001" min={0}
                  className="w-28 border rounded px-2 py-1 text-sm text-right font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={rates[key] ?? ""}
                  onChange={(e) => { setRates((p) => ({ ...p, [key]: e.target.value })); setRatesSaved(false); }} />
              </div>
            </div>
          ))}
        </div>
        <SaveButton onClick={saveRates} saving={ratesSaving} saved={ratesSaved} error={error} />
      </div>
    </div>
  );
}

// ── Tab: Alerts ───────────────────────────────────────────────────────────────

function AlertsTab({ initial }: { initial: Record<string, string> }) {
  const [fields, setFields] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string) => (v: string) => { setFields((p) => ({ ...p, [k]: v })); setSaved(false); };
  const setPlain = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => set(k)(e.target.value);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try { await apiPut("/api/settings/alerts", fields); setSaved(true); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-1">Alert Channels</h2>
      <p className="text-sm text-gray-500 mb-6">
        DLQ escalations, high failure rates, 80%+ budget, and YouTube token failures.
        Alerts are deduplicated per 15-minute window.
      </p>

      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded bg-[#4A154B] flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="white">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zm2.521-10.123a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-800">Slack</span>
          </div>
          <FieldGroup label="Incoming Webhook URL" hint="api.slack.com/apps → Incoming Webhooks">
            <ApiKeyInput placeholder="https://hooks.slack.com/services/T…" value={fields.slackWebhookUrl ?? ""} onChange={set("slackWebhookUrl")} />
          </FieldGroup>
          <FieldGroup label="Dashboard URL (in alert messages)" hint="Link included in every Slack alert.">
            <input type="text" className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={fields.dashboardUrl ?? ""} onChange={setPlain("dashboardUrl")} />
          </FieldGroup>
          <div className="border rounded-lg p-4 bg-gray-50 text-xs text-gray-500">
            <p className="font-medium text-gray-700 mb-1">Alert triggers:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Job failure rate &gt; 10% for 5 min (critical)</li>
              <li>DLQ depth &gt; 5 jobs</li>
              <li>Monthly budget &gt; 80%</li>
            </ul>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded bg-gray-700 flex items-center justify-center">
              <svg viewBox="0 0 20 20" width="13" height="13" fill="white">
                <path d="M2.003 5.884 10 9.882l7.997-3.998A2 2 0 0 0 16 4H4a2 2 0 0 0-1.997 1.884z" />
                <path d="m18 8.118-8 4-8-4V14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.118z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-800">Email (SMTP)</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="SMTP Host">
              <input type="text" className="border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="smtp.sendgrid.net" value={fields.smtpHost ?? ""} onChange={setPlain("smtpHost")} />
            </FieldGroup>
            <FieldGroup label="Port">
              <input type="text" className="border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={fields.smtpPort ?? "587"} onChange={setPlain("smtpPort")} />
            </FieldGroup>
          </div>
          <FieldGroup label="SMTP Username">
            <input type="text" className="border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={fields.smtpUser ?? ""} onChange={setPlain("smtpUser")} />
          </FieldGroup>
          <FieldGroup label="SMTP Password">
            <ApiKeyInput placeholder="…" value={fields.smtpPass ?? ""} onChange={set("smtpPass")} />
          </FieldGroup>
          <FieldGroup label="Send alerts to">
            <input type="email" className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="you@example.com" value={fields.alertEmailTo ?? ""} onChange={setPlain("alertEmailTo")} />
          </FieldGroup>
          <FieldGroup label="From address">
            <input type="text" className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={fields.smtpFrom ?? ""} onChange={setPlain("smtpFrom")} />
          </FieldGroup>
        </div>
      </div>
      <SaveButton onClick={handleSave} saving={saving} saved={saved} error={error} />
    </div>
  );
}

// ── Root Settings Page ────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "integrations", label: "Integrations", icon: "🔌" },
  { id: "youtube", label: "YouTube Channels", icon: "▶" },
  { id: "worker", label: "Worker Mode", icon: "⚙" },
  { id: "budget", label: "Budget & Cost", icon: "💰" },
  { id: "alerts", label: "Alerts", icon: "🔔" },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("integrations");
  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const data = await apiGet<SettingsDto>("/api/settings");
      setSettings(data);
    } catch (e: any) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white">
              <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" />
              <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.6" />
              <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.6" />
              <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900">AI Video Factory</span>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/dashboard" className="px-3 py-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">Dashboard</Link>
          <Link href="/create" className="px-3 py-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">Creator Mode</Link>
          <span className="px-3 py-1.5 bg-gray-100 text-gray-900 rounded-md font-medium">Settings</span>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Configure API integrations, YouTube channels, Worker Mode, and alerts.</p>
        </div>

        {loadError && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            Failed to load settings: {loadError}
          </div>
        )}

        <div className="flex gap-6">
          <aside className="w-48 flex-shrink-0">
            <nav className="space-y-0.5">
              {TABS.map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    activeTab === tab.id ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}>
                  <span className="text-base leading-none">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
              <div className="border-t my-3" />
              <Link href="/dashboard/dlq"
                className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
                <span className="text-base leading-none">⚠</span>
                Dead Letter Queue
              </Link>
            </nav>
          </aside>

          <div className="flex-1 min-w-0 bg-white border rounded-xl p-7">
            {!settings ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                {loadError ? "Could not load settings." : "Loading…"}
              </div>
            ) : (
              <>
                {activeTab === "integrations" && <IntegrationsTab initial={settings.integrations} />}
                {activeTab === "youtube" && <YouTubeTab />}
                {activeTab === "worker" && <WorkerModeTab initial={settings.worker} />}
                {activeTab === "budget" && <BudgetTab initialRates={settings.costRates} />}
                {activeTab === "alerts" && <AlertsTab initial={settings.alerts} />}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
