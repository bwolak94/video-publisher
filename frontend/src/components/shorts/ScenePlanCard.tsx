"use client"

import { useState } from 'react'
import { Badge, Card, CardFoot, StatusPill } from '@/components/ui'
import type { ScenePlanScene } from '@/types/shorts'

// StatusPill does not have an 'error' variant — map it to 'failed'.
type ScenePlanStatus = 'queued' | 'generating' | 'review' | 'qa' | 'error' | 'blocked' | 'done'

const STATUS_PILL_MAP: Record<
  ScenePlanStatus,
  'queued' | 'generating' | 'review' | 'qa' | 'failed' | 'blocked' | 'done'
> = {
  queued:     'queued',
  generating: 'generating',
  review:     'review',
  qa:         'qa',
  error:      'failed',
  blocked:    'blocked',
  done:       'done',
}

const MODEL_HINT_TONE = {
  action:    'info',
  dialog:    'accent',
  landscape: 'neutral',
} as const satisfies Record<ScenePlanScene['model_hint'], 'info' | 'accent' | 'neutral'>

export type ScenePlanCardProps = {
  scene: ScenePlanScene
  status: ScenePlanStatus
  actions?: React.ReactNode
  keyframe?: string
  costEstimate?: number
}

export function ScenePlanCard({ scene, status, actions, keyframe, costEstimate }: ScenePlanCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card>
      <div className="flex gap-3 p-3">
        {/* 9:16 thumbnail */}
        <div
          className="shrink-0 rounded-lg overflow-hidden bg-[var(--surface-sunken)]"
          style={{ width: 56, aspectRatio: '9/16' }}
        >
          {keyframe ? (
            <img src={keyframe} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--ink-faint)]">
              <span className="text-xs font-mono">{scene.scene_id}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-[var(--ink-faint)] uppercase tracking-wider">
              {scene.scene_id}
            </span>
            <Badge tone={MODEL_HINT_TONE[scene.model_hint]}>{scene.model_hint}</Badge>
            <StatusPill status={STATUS_PILL_MAP[status]} />
          </div>

          <p className="text-sm line-clamp-2 text-[var(--ink-faint)]">{scene.image_prompt}</p>

          {/* Expandable details */}
          <button
            className="text-xs text-[var(--accent)] text-left"
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? '▲ Ukryj szczegóły' : '▼ Pokaż szczegóły'}
          </button>

          {expanded && (
            <div className="flex flex-col gap-2 text-xs">
              {scene.characters.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  <span className="text-[var(--ink-faint)]">Postacie:</span>
                  {scene.characters.map(c => (
                    <Badge key={c} tone="neutral">{c}</Badge>
                  ))}
                </div>
              )}
              <div>
                <span className="text-[var(--ink-faint)]">Kamera: </span>
                <span className="font-mono">{scene.camera}</span>
              </div>
              <div>
                <span className="text-[var(--ink-faint)]">Ruch: </span>
                <span>{scene.motion_prompt}</span>
              </div>
              {scene.speaker ? (
                <div>
                  <Badge tone="accent">Dialog</Badge>
                  <Badge tone="neutral" className="ml-1">{scene.speaker}</Badge>
                  <span className="ml-2 text-[var(--ink-faint)]">lip-sync</span>
                  <p className="mt-1 italic">{scene.voiceover}</p>
                </div>
              ) : (
                <div>
                  <span className="text-[var(--ink-faint)]">Lektorat: </span>
                  <span className="italic">{scene.voiceover}</span>
                </div>
              )}
              {scene.sfx_tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  <span className="text-[var(--ink-faint)]">SFX:</span>
                  {scene.sfx_tags.map(tag => (
                    <Badge key={tag} tone="neutral">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {(actions || costEstimate !== undefined) && (
        <CardFoot className="flex items-center justify-between">
          {costEstimate !== undefined ? (
            <span className="text-xs font-mono text-[var(--ink-faint)]">${costEstimate.toFixed(3)}</span>
          ) : (
            <span />
          )}
          {actions && <div className="flex gap-2">{actions}</div>}
        </CardFoot>
      )}
    </Card>
  )
}
