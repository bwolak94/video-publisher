'use client'

import React, { useCallback, useRef, useState } from 'react'
import { Checkbox } from '@/components/ui/Checkbox'
import { Select } from '@/components/ui/Select'
import { InlineAlert } from '@/components/ui/InlineAlert'

export interface ClipTrimmerProps {
  title: string
  duration: number
  inPoint: number
  outPoint: number
  playhead: number
  controls: ('pose' | 'depth' | 'mask' | 'camera')[]
  poster?: string
  characters?: { id: string; name: string }[]
  onTrim: (data: {
    inPoint: number
    outPoint: number
    controls: string[]
    characterId: string | null
  }) => void
}

const CONTROL_LABELS: Record<'pose' | 'depth' | 'mask' | 'camera', string> = {
  pose: 'Poza',
  depth: 'Głębia',
  mask: 'Maski',
  camera: 'Ruch kamery',
}

export function ClipTrimmer({
  title,
  duration,
  inPoint,
  outPoint,
  playhead,
  controls,
  poster,
  characters,
  onTrim,
}: ClipTrimmerProps) {
  const [localIn, setLocalIn] = useState(inPoint)
  const [localOut, setLocalOut] = useState(outPoint)
  const [localControls, setLocalControls] = useState<string[]>(controls)
  const [characterId, setCharacterId] = useState<string | null>(null)

  const scrubRef = useRef<HTMLDivElement>(null)

  const fragmentDuration = localOut - localIn
  const isWarn = fragmentDuration > 5

  const clamp = (val: number, min: number, max: number) =>
    Math.max(min, Math.min(max, val))

  const startDrag = useCallback(
    (handle: 'in' | 'out') => (e: React.MouseEvent) => {
      e.preventDefault()
      const bar = scrubRef.current
      if (!bar) return

      const onMove = (ev: MouseEvent) => {
        const rect = bar.getBoundingClientRect()
        const ratio = clamp((ev.clientX - rect.left) / rect.width, 0, 1)
        const seconds = ratio * duration

        if (handle === 'in') {
          setLocalIn(clamp(parseFloat(seconds.toFixed(1)), 0, localOut - 0.1))
        } else {
          setLocalOut(clamp(parseFloat(seconds.toFixed(1)), localIn + 0.1, duration))
        }
      }

      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [duration, localIn, localOut]
  )

  const handleControlChange = (ctrl: string, checked: boolean) => {
    setLocalControls((prev) =>
      checked ? [...prev, ctrl] : prev.filter((c) => c !== ctrl)
    )
  }

  const characterOptions = (characters ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }))

  return (
    <div className="vf-card">
      {/* Head */}
      <div className="vf-card-head">
        <span className="text-sm font-medium">{title}</span>
        <span className={`vf-badge${isWarn ? ' vf-badge-warn' : ''}`}>
          {fragmentDuration.toFixed(1)} s
        </span>
      </div>

      {/* Body */}
      <div className="vf-card-body flex flex-col gap-4">
        {/* 16:9 video preview */}
        <div
          className="vf-trim-src overflow-hidden"
          style={{ backgroundColor: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)' }}
        >
          {poster && (
            <img
              src={poster}
              className="w-full h-full object-cover"
              alt=""
              style={{ display: 'block' }}
            />
          )}
        </div>

        {/* Film strip scrub bar */}
        <div>
          <div className="vf-film" ref={scrubRef} style={{ position: 'relative', cursor: 'default' }}>
            {/* Decorative strips */}
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} aria-hidden="true" />
            ))}

            {/* Selection zone */}
            <div
              className="vf-sel"
              style={{
                left: `${(localIn / duration) * 100}%`,
                width: `${((localOut - localIn) / duration) * 100}%`,
              }}
            />

            {/* In handle */}
            <div
              aria-label="In point handle"
              role="slider"
              aria-valuenow={localIn}
              aria-valuemin={0}
              aria-valuemax={localOut - 0.1}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(localIn / duration) * 100}%`,
                width: 12,
                transform: 'translateX(-50%)',
                cursor: 'ew-resize',
                zIndex: 2,
              }}
              onMouseDown={startDrag('in')}
            />

            {/* Out handle */}
            <div
              aria-label="Out point handle"
              role="slider"
              aria-valuenow={localOut}
              aria-valuemin={localIn + 0.1}
              aria-valuemax={duration}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(localOut / duration) * 100}%`,
                width: 12,
                transform: 'translateX(-50%)',
                cursor: 'ew-resize',
                zIndex: 2,
              }}
              onMouseDown={startDrag('out')}
            />

            {/* Playhead */}
            <div
              className="vf-playhead"
              aria-hidden="true"
              style={{ left: `${(playhead / duration) * 100}%`, pointerEvents: 'none' }}
            />
          </div>

          {/* Tick labels */}
          <div className="vf-ticks">
            <span>0:00</span>
            <span>{Math.floor(duration / 4 / 60)}:{String(Math.round(duration / 4) % 60).padStart(2, '0')}</span>
            <span>{Math.floor(duration / 2 / 60)}:{String(Math.round(duration / 2) % 60).padStart(2, '0')}</span>
            <span>{Math.floor(duration / 60)}:{String(Math.round(duration) % 60).padStart(2, '0')}</span>
          </div>
        </div>

        {/* Time inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <div className="vf-field">
            <label className="vf-label" htmlFor="clip-in">In</label>
            <div className="vf-control">
              <input
                id="clip-in"
                type="number"
                className="vf-input"
                value={localIn.toFixed(1)}
                min={0}
                max={localOut - 0.1}
                step={0.1}
                onChange={(e) =>
                  setLocalIn(clamp(parseFloat(e.target.value) || 0, 0, localOut - 0.1))
                }
              />
              <span className="vf-suffix">s</span>
            </div>
          </div>
          <div className="vf-field">
            <label className="vf-label" htmlFor="clip-out">Out</label>
            <div className="vf-control">
              <input
                id="clip-out"
                type="number"
                className="vf-input"
                value={localOut.toFixed(1)}
                min={localIn + 0.1}
                max={duration}
                step={0.1}
                onChange={(e) =>
                  setLocalOut(clamp(parseFloat(e.target.value) || 0, localIn + 0.1, duration))
                }
              />
              <span className="vf-suffix">s</span>
            </div>
          </div>
        </div>

        {/* Control checkboxes */}
        <div className="flex flex-col gap-2">
          <span
            className="vf-overline"
            style={{ marginBottom: 'var(--space-1)' }}
          >
            Zachowaj z klipu
          </span>
          {(['pose', 'depth', 'mask', 'camera'] as const).map((ctrl) => (
            <Checkbox
              key={ctrl}
              label={CONTROL_LABELS[ctrl]}
              checked={localControls.includes(ctrl)}
              onChange={(checked) => handleControlChange(ctrl, checked)}
            />
          ))}
        </div>

        {/* Character select */}
        {characters && characters.length > 0 && (
          <Select
            label="Postać"
            placeholder="— brak —"
            options={characterOptions}
            value={characterId ?? ''}
            onChange={(e) => setCharacterId(e.target.value || null)}
          />
        )}

        {/* Content ID warning */}
        <InlineAlert tone="warn" title="Content ID">
          Klipy z filmów, seriali i gier mogą wywołać Content ID. Używaj krótkich fragmentów
          (≤5 s) i pełnego re-renderu scenerii.
        </InlineAlert>
      </div>

      {/* Footer */}
      <div className="vf-card-foot">
        <button
          className="vf-btn vf-btn-primary"
          onClick={() =>
            onTrim({
              inPoint: localIn,
              outPoint: localOut,
              controls: localControls,
              characterId,
            })
          }
        >
          Zastosuj trim
        </button>
      </div>
    </div>
  )
}
