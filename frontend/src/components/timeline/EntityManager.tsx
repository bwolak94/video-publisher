"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Entity, EntityType, CreateEntityDto, UpdateEntityDto } from "@/types/api";

interface EntityManagerProps {
  projectId: string;
}

const TYPE_LABELS: Record<EntityType, string> = {
  character: "Character",
  location: "Location",
  prop: "Prop",
  costume: "Costume",
};

const TYPE_BADGE: Record<EntityType, string> = {
  character: "bg-accent/10 text-accent border border-accent/20",
  location:  "bg-success-bg text-success-text border border-success-border",
  prop:      "bg-warning-bg text-warning-text border border-warning-border",
  costume:   "bg-info-dim text-info-glow border border-info/20",
};

const EMPTY_FORM: CreateEntityDto = { name: "", type: "character", description: "", referenceImageUrls: [] };

export function EntityManager({ projectId }: EntityManagerProps) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<CreateEntityDto>(EMPTY_FORM);
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/entities`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Entity[];
      setEntities(data);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Failed to load entities");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const handleCreate = useCallback(async () => {
    if (!form.name.trim()) return;
    const body: CreateEntityDto = {
      ...form,
      referenceImageUrls: form.referenceImageUrls ?? [],
    };
    try {
      const res = await fetch(`/api/projects/${projectId}/entities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json() as Entity;
      setEntities((prev) => [...prev, created]);
      setForm(EMPTY_FORM);
      setUrlInput("");
      setShowAdd(false);
    } catch {
      setError("Failed to create entity");
    }
  }, [projectId, form]);

  const handleUpdate = useCallback(async (id: string, dto: UpdateEntityDto) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/entities/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dto),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json() as Entity;
      setEntities((prev) => prev.map((e) => (e.id === id ? updated : e)));
      setEditingId(null);
    } catch {
      setError("Failed to update entity");
    }
  }, [projectId]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/entities/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setEntities((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setError("Failed to delete entity");
    }
  }, [projectId]);

  const handleApproveReference = useCallback(async (id: string, imageUrl: string | null) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/entities/${id}/approve-reference`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json() as Entity;
      setEntities((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch {
      setError("Failed to update reference image");
    }
  }, [projectId]);

  const addUrl = useCallback(() => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setForm((f) => ({ ...f, referenceImageUrls: [...(f.referenceImageUrls ?? []), trimmed] }));
    setUrlInput("");
  }, [urlInput]);

  const removeUrl = useCallback((idx: number) => {
    setForm((f) => ({ ...f, referenceImageUrls: (f.referenceImageUrls ?? []).filter((_, i) => i !== idx) }));
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-panel">
        <span className="text-xs font-semibold text-ink uppercase tracking-wide">Entities</span>
        <button
          onClick={() => { setShowAdd((v) => !v); setForm(EMPTY_FORM); setUrlInput(""); }}
          className={`px-2 py-0.5 text-xs border rounded-md transition-colors ${
            showAdd
              ? "bg-accent/15 text-accent border-accent/25"
              : "bg-subtle text-ink-secondary border-line hover:bg-hover hover:text-ink"
          }`}
        >
          {showAdd ? "Cancel" : "+ Add"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-2 px-2 py-1.5 text-xs bg-danger-bg text-danger-text border border-danger-border rounded-lg flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="m-3 p-3 bg-accent/6 border border-accent/15 rounded-xl space-y-2">
          <p className="text-2xs font-semibold text-accent uppercase tracking-wide">New Entity</p>
          <input
            type="text"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full text-sm text-ink bg-muted border border-line rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as EntityType }))}
            className="w-full text-xs text-ink bg-muted border border-line rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-accent/50"
          >
            <option value="character">Character</option>
            <option value="location">Location</option>
            <option value="prop">Prop</option>
            <option value="costume">Costume</option>
          </select>
          <textarea
            placeholder="Description (injected into visual prompts)"
            value={form.description ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            className="w-full text-sm text-ink bg-muted border border-line rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          {/* Reference image URLs */}
          <div>
            <p className="text-2xs text-ink-muted mb-1">Reference Image URLs</p>
            {(form.referenceImageUrls ?? []).map((url, i) => (
              <div key={i} className="flex items-center gap-1 mb-1">
                <span className="flex-1 text-2xs text-ink-secondary truncate bg-muted border border-line rounded px-1.5 py-0.5">{url}</span>
                <button onClick={() => removeUrl(i)} className="text-danger-text hover:opacity-70 text-xs">✕</button>
              </div>
            ))}
            <div className="flex gap-1">
              <input
                type="url"
                placeholder="https://…"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addUrl()}
                className="flex-1 text-xs text-ink bg-muted border border-line rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
              <button
                onClick={addUrl}
                className="px-2 py-0.5 text-xs bg-subtle border border-line rounded-md hover:bg-hover text-ink-secondary hover:text-ink transition-colors"
              >
                + URL
              </button>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={!form.name.trim()}
            className="w-full py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-40 transition-opacity"
            style={{ background: "linear-gradient(135deg,#5b6ef5 0%,#3d52e8 100%)" }}
          >
            Create Entity
          </button>
        </div>
      )}

      {/* Entity list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {loading && (
          <p className="text-xs text-ink-muted text-center py-6">Loading…</p>
        )}
        {!loading && entities.length === 0 && !showAdd && (
          <div className="text-center py-8">
            <p className="text-xs text-ink-muted">No entities yet.</p>
            <p className="text-2xs text-ink-muted/60 mt-1">Add characters, locations, or props to keep visuals consistent.</p>
          </div>
        )}
        {entities.map((entity) => (
          <EntityRow
            key={entity.id}
            entity={entity}
            isEditing={editingId === entity.id}
            onEdit={() => setEditingId(entity.id)}
            onCancelEdit={() => setEditingId(null)}
            onSave={(dto) => handleUpdate(entity.id, dto)}
            onDelete={() => handleDelete(entity.id)}
            onApproveReference={(imageUrl) => handleApproveReference(entity.id, imageUrl)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Entity row (inline edit) ────────────────────────────────────────────────

interface EntityRowProps {
  entity: Entity;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (dto: UpdateEntityDto) => void;
  onDelete: () => void;
  onApproveReference: (imageUrl: string | null) => void;
}

function EntityRow({ entity, isEditing, onEdit, onCancelEdit, onSave, onDelete, onApproveReference }: EntityRowProps) {
  const [draft, setDraft] = useState<UpdateEntityDto>({
    name: entity.name,
    type: entity.type,
    description: entity.description ?? "",
    referenceImageUrls: entity.referenceImageUrls,
  });
  const [urlInput, setUrlInput] = useState("");

  // Reset draft when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setDraft({
        name: entity.name,
        type: entity.type,
        description: entity.description ?? "",
        referenceImageUrls: entity.referenceImageUrls,
      });
    }
  }, [isEditing, entity]);

  const addUrl = () => {
    const t = urlInput.trim();
    if (!t) return;
    setDraft((d) => ({ ...d, referenceImageUrls: [...(d.referenceImageUrls ?? []), t] }));
    setUrlInput("");
  };

  const removeUrl = (idx: number) => {
    setDraft((d) => ({ ...d, referenceImageUrls: (d.referenceImageUrls ?? []).filter((_, i) => i !== idx) }));
  };

  if (isEditing) {
    return (
      <div className="p-3 bg-accent/6 border border-accent/15 rounded-xl space-y-2">
        <input
          type="text"
          value={draft.name ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full text-sm text-ink bg-muted border border-line rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        <select
          value={draft.type ?? "character"}
          onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as EntityType }))}
          className="w-full text-xs text-ink bg-muted border border-line rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          <option value="character">Character</option>
          <option value="location">Location</option>
          <option value="prop">Prop</option>
          <option value="costume">Costume</option>
        </select>
        <textarea
          value={draft.description ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          rows={2}
          className="w-full text-sm text-ink bg-muted border border-line rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        {/* Reference URLs */}
        <div>
          {(draft.referenceImageUrls ?? []).map((url, i) => (
            <div key={i} className="flex items-center gap-1 mb-1">
              <span className="flex-1 text-2xs text-ink-secondary truncate bg-muted border border-line rounded px-1.5 py-0.5">{url}</span>
              <button onClick={() => removeUrl(i)} className="text-danger-text hover:opacity-70 text-xs">✕</button>
            </div>
          ))}
          <div className="flex gap-1">
            <input
              type="url"
              placeholder="https://…"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addUrl()}
              className="flex-1 text-xs text-ink bg-muted border border-line rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <button onClick={addUrl} className="px-2 text-xs bg-subtle border border-line rounded-md hover:bg-hover text-ink-secondary transition-colors">+ URL</button>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onSave(draft)}
            className="flex-1 py-1 text-xs font-semibold text-white rounded-lg"
            style={{ background: "linear-gradient(135deg,#5b6ef5 0%,#3d52e8 100%)" }}
          >
            Save
          </button>
          <button
            onClick={onCancelEdit}
            className="px-3 py-1 text-xs bg-subtle text-ink-secondary border border-line rounded-lg hover:bg-hover transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2.5 bg-panel border border-line rounded-xl hover:border-line-strong transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-2xs font-medium ${TYPE_BADGE[entity.type]}`}>
            {TYPE_LABELS[entity.type]}
          </span>
          <span className="text-sm font-medium text-ink truncate">{entity.name}</span>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="px-1.5 py-0.5 text-2xs bg-subtle text-ink-secondary border border-line rounded hover:bg-hover hover:text-ink transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="px-1.5 py-0.5 text-2xs bg-danger-bg text-danger-text border border-danger-border rounded hover:opacity-80 transition-opacity"
          >
            ✕
          </button>
        </div>
      </div>
      {entity.description && (
        <p className="mt-1 text-2xs text-ink-muted line-clamp-2">{entity.description}</p>
      )}
      {entity.referenceImageUrls.length > 0 && (
        <div className="mt-1.5 flex gap-1.5 flex-wrap">
          {entity.referenceImageUrls.map((url, i) => {
            const isApproved = entity.approvedReferenceImageUrl === url;
            return (
              <div key={i} className="relative group/thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`${entity.name} ref ${i + 1}`}
                  className={`w-9 h-9 rounded object-cover border-2 transition-colors ${isApproved ? "border-accent" : "border-line"}`}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = "none"; }}
                />
                {isApproved && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-accent rounded-full border border-panel" title="Approved reference" />
                )}
                <button
                  onClick={() => onApproveReference(isApproved ? null : url)}
                  title={isApproved ? "Clear reference" : "Set as reference"}
                  className="absolute inset-0 flex items-center justify-center rounded bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity text-white text-2xs font-medium"
                >
                  {isApproved ? "✕" : "✓"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
