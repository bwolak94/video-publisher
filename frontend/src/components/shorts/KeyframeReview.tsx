'use client'
import { useState } from 'react'
import { Button, Card, CardHead, CardBody, CardFoot, StatusPill } from '@/components/ui'

export type KeyframeVariant = {
  id: string
  src?: string
  seed: number
  similarity?: number
  busy?: boolean
}

export type KeyframeReviewProps = {
  sceneId: string
  title: string
  variants: KeyframeVariant[]
  value?: string
  defaultValue?: string
  onSelect?: (id: string) => void
  onAccept: (variantId: string) => void
  onRegenerate: () => void
  character?: { name: string; imageUrl?: string }
  cost?: number
  model?: string
  loading?: boolean
}

export function KeyframeReview({
  sceneId: _sceneId,
  title,
  variants,
  value,
  defaultValue,
  onSelect,
  onAccept,
  onRegenerate,
  character,
  cost,
  model,
  loading,
}: KeyframeReviewProps) {
  const [internalSelected, setInternalSelected] = useState<string | undefined>(defaultValue)
  const selectedId = value ?? internalSelected

  function handleSelect(id: string) {
    setInternalSelected(id)
    onSelect?.(id)
  }

  return (
    <Card>
      <CardHead>
        <div className="flex flex-col gap-1">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--ink-faint)]">
            Keyframe Review
          </p>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <StatusPill status="review" />
      </CardHead>

      <CardBody>
        <div className="grid grid-cols-2 gap-3">
          {variants.map(v => {
            const isSelected = selectedId === v.id
            return (
              <div
                key={v.id}
                className="relative cursor-pointer rounded-lg overflow-hidden"
                style={{
                  aspectRatio: '9/16',
                  border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--line, #2a2b2f)'}`,
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'var(--surface-sunken)',
                }}
                onClick={() => !v.busy && handleSelect(v.id)}
              >
                {v.src ? (
                  <img src={v.src} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-xs font-mono text-[var(--ink-faint)]">—</span>
                  </div>
                )}

                {v.busy && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {isSelected && !v.busy && (
                  <div
                    className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-black text-xs font-bold"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    ✓
                  </div>
                )}

                <div
                  className="absolute bottom-0 left-0 right-0 px-2 py-1 flex justify-between items-end"
                  style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}
                >
                  <span className="text-xs font-mono text-white/70">seed {v.seed}</span>
                  {v.similarity !== undefined && (
                    <span className="text-xs font-mono text-white/70">
                      {v.similarity.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardBody>

      <CardFoot className="flex items-center gap-3">
        {character && (
          <div className="flex items-center gap-2 flex-1">
            {character.imageUrl ? (
              <img
                src={character.imageUrl}
                alt=""
                className="w-6 h-6 rounded-full object-cover"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[var(--surface-sunken)]" />
            )}
            <span className="text-xs text-[var(--ink-faint)]">{character.name}</span>
          </div>
        )}
        {model && (
          <span className="text-xs font-mono text-[var(--ink-faint)] flex-1">{model}</span>
        )}
        {cost !== undefined && (
          <span className="text-xs font-mono text-[var(--ink-faint)]">${cost.toFixed(3)}</span>
        )}
        <Button variant="ghost" size="sm" onClick={onRegenerate}>
          Regeneruj
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!selectedId}
          loading={loading}
          onClick={() => selectedId && onAccept(selectedId)}
        >
          Akceptuj → I2V
        </Button>
      </CardFoot>
    </Card>
  )
}
