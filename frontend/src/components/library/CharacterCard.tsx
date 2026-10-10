'use client'
import { useState } from 'react'
import { Button, Badge, Card, CardBody, CardFoot } from '@/components/ui'
import type { Character } from '@/types/api'

const CONSENT_TONE: Record<string, 'neutral' | 'accent' | 'warn' | 'danger'> = {
  original: 'neutral',
  likeness: 'accent',
}

export type CharacterCardProps = {
  character: Character
  onEdit: (char: Character) => void
  onDelete: (id: string) => void
}

export function CharacterCard({ character, onEdit, onDelete }: CharacterCardProps) {
  const [hovered, setHovered] = useState(false)
  const images = character.images ?? []
  const isDeleted = !!character.deletedAt

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
    <Card className={`transition-opacity ${isDeleted ? 'opacity-40' : ''}`}>
      {/* 2×2 image grid */}
      <div className="grid grid-cols-2 gap-1 p-2">
        {([0, 1, 2, 3] as const).map(i => (
          <div
            key={i}
            className="rounded overflow-hidden bg-[var(--surface-sunken)]"
            style={{ aspectRatio: '9/16' }}
          >
            {images[i] ? (
              <img
                src={images[i].s3Url}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-[10px] font-mono text-[var(--ink-faint)]">—</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <CardBody className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold text-sm leading-tight">{character.name}</span>
          <Badge tone={CONSENT_TONE[character.consentType] ?? 'neutral'}>
            {character.consentType}
          </Badge>
        </div>
        <p className="text-xs text-[var(--ink-muted)] line-clamp-2">{character.description}</p>
        <div className="flex items-center gap-2">
          <Badge tone="neutral" mono>v{character.version}</Badge>
          {character.voiceId && (
            <span className="text-xs font-mono text-[var(--ink-faint)] truncate">
              {character.voiceId}
            </span>
          )}
        </div>
      </CardBody>

      {hovered && !isDeleted && (
        <CardFoot className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => onEdit(character)}>
            Edytuj
          </Button>
          <Button variant="danger" size="sm" onClick={() => onDelete(character.id)}>
            Usuń
          </Button>
        </CardFoot>
      )}
    </Card>
    </div>
  )
}
