'use client'
import { useState, useRef } from 'react'
import { Button, TextField, TextArea, Select, InlineAlert } from '@/components/ui'
import type { Character } from '@/types/api'

const STYLE_OPTIONS = [
  { value: 'realistic', label: 'Realistic' },
  { value: 'semi-realistic', label: 'Semi-realistic' },
  { value: 'cartoon', label: 'Cartoon' },
  { value: 'anime', label: 'Anime' },
  { value: '3d', label: '3D' },
]

export type CharacterModalProps = {
  character?: Character
  onSave: (character: Character) => void
  onClose: () => void
}

export function CharacterModal({ character, onSave, onClose }: CharacterModalProps) {
  const isEdit = !!character
  const [name, setName] = useState(character?.name ?? '')
  const [description, setDescription] = useState(character?.description ?? '')
  const [style, setStyle] = useState(character?.style ?? 'realistic')
  const [voiceId, setVoiceId] = useState(character?.voiceId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    if (!name.trim() || !description.trim()) {
      setError('Nazwa i opis są wymagane')
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        style,
        voiceId: voiceId || undefined,
      }
      const url = isEdit ? `/api/characters/${character!.id}` : '/api/characters'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const saved = (await res.json()) as Character & { message?: string }
      if (!res.ok) throw new Error(saved.message ?? 'Błąd zapisu')

      for (const file of pendingFiles) {
        const fd = new FormData()
        fd.append('file', file)
        await fetch(`/api/characters/${saved.id}/images`, { method: 'POST', body: fd })
      }
      onSave(saved)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Nieznany błąd')
    } finally {
      setSaving(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const existing = character?.images?.length ?? 0
    const total = existing + pendingFiles.length + files.length
    if (total > 4) {
      setError('Maksymalnie 4 obrazy referencyjne')
      return
    }
    setPendingFiles(prev => [...prev, ...files])
    // reset input so same file can be selected again if removed
    e.target.value = ''
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-md rounded-xl p-6 flex flex-col gap-4 bg-[var(--bg-panel,#18191c)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isEdit ? 'Edytuj postać' : 'Nowa postać'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--ink-faint)] hover:text-white"
            aria-label="Zamknij"
          >
            ✕
          </button>
        </div>

        {error && <InlineAlert tone="danger">{error}</InlineAlert>}

        <TextField
          label="Nazwa"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <TextArea
          label="Opis"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
        />
        <Select
          label="Styl"
          options={STYLE_OPTIONS}
          value={style}
          onChange={e => setStyle(e.target.value)}
        />
        <TextField
          label="Voice ID (opcjonalnie)"
          value={voiceId}
          onChange={e => setVoiceId(e.target.value)}
          hint="ElevenLabs voice ID"
        />

        {/* Image upload */}
        <div>
          <p className="text-xs text-[var(--ink-faint)] mb-2">
            Obrazy referencyjne (max 4)
          </p>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {(character?.images ?? []).map(img => (
              <div
                key={img.id}
                className="aspect-[9/16] rounded overflow-hidden bg-[var(--surface-sunken)]"
              >
                <img src={img.s3Url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
            {pendingFiles.map((f, i) => (
              <div
                key={i}
                className="aspect-[9/16] rounded overflow-hidden bg-[var(--surface-sunken)] flex items-center justify-center"
              >
                <span className="text-[10px] text-[var(--ink-faint)] text-center break-all px-1">
                  {f.name.slice(0, 8)}
                </span>
              </div>
            ))}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
            + Dodaj zdjęcia
          </Button>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>
            Anuluj
          </Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            Zapisz
          </Button>
        </div>
      </div>
    </div>
  )
}
