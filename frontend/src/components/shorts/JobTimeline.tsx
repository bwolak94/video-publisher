'use client'
import React from 'react'
import { Button, Badge, StatusPill, InlineAlert } from '@/components/ui'
import { QAScore } from './QAScore'

type StageStatus = 'done' | 'active' | 'review' | 'fail' | 'pending'

type SceneStatus = 'queued' | 'generating' | 'review' | 'qa' | 'error' | 'blocked' | 'done'

type JobScene = {
  id: string
  title?: string
  track: 'i2v' | 'v2v'
  model?: string
  attempt?: number
  qa?: number
  cost?: number
  status: SceneStatus
  stages: Record<string, StageStatus>
}

export type JobData = {
  id: string
  title?: string
  status: string
  done: number
  total: number
  cost: number
  budget: number
  elapsed: number   // seconds
  eta: number       // seconds
  scenes: JobScene[]
}

export type JobTimelineProps = {
  job: JobData
  threshold?: number
  onResume?: (jobId: string) => void
}

const STAGE_ORDER_I2V = ['T2I', 'Review', 'I2V', 'QA', 'Lip-sync']
const STAGE_ORDER_V2V = ['Klip', 'V2V', 'QA', 'Lip-sync']

const STAGE_COLORS: Record<StageStatus, string> = {
  done: 'var(--accent)',
  active: 'var(--info)',
  review: 'var(--warn)',
  fail: 'var(--danger)',
  pending: 'var(--line, #2a2b2f)',
}

function formatSeconds(s: number) {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export function JobTimeline({ job, threshold = 0.75, onResume }: JobTimelineProps) {
  const [scenes, setScenes] = React.useState<JobScene[]>(job.scenes)
  const [approvingId, setApprovingId] = React.useState<string | null>(null)
  const [rejectingId, setRejectingId] = React.useState<string | null>(null)
  const [lipsyncingId, setLipsyncingId] = React.useState<string | null>(null)
  const [lipsyncError, setLipsyncError] = React.useState<string | null>(null)

  async function handleApprove(sceneId: string) {
    setApprovingId(sceneId)
    try {
      await fetch(`/api/shorts/${job.id}/scenes/${sceneId}/approve-qa`, { method: 'POST' })
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'done' as SceneStatus } : s))
    } finally {
      setApprovingId(null)
    }
  }

  async function handleLipsync(scene: JobScene) {
    setLipsyncingId(scene.id)
    setLipsyncError(null)
    try {
      await fetch(`/api/shorts/${job.id}/scenes/${scene.id}/generate-lipsync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dialog: (scene as any).voiceover ?? (scene as any).dialog ?? '',
          voiceId: (scene as any).voiceId ?? 'default',
        }),
      })
      setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, status: 'generating' as SceneStatus } : s))
    } catch {
      setLipsyncError('Lip-sync niedostępny — lektor off-screen')
    } finally {
      setLipsyncingId(null)
    }
  }

  async function handleReject(sceneId: string) {
    setRejectingId(sceneId)
    try {
      await fetch(`/api/shorts/${job.id}/scenes/${sceneId}/reject-qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual_reject' }),
      })
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'generating' as SceneStatus } : s))
    } finally {
      setRejectingId(null)
    }
  }

  const hasFailed = scenes.some(s => s.status === 'error')
  const progressPct = job.total > 0 ? (job.done / job.total) * 100 : 0

  return (
    <div className="flex flex-col gap-4">
      {/* Header stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Sceny', value: `${job.done}/${job.total}` },
          { label: 'Koszt', value: `$${job.cost.toFixed(2)}/$${job.budget.toFixed(2)}` },
          { label: 'Czas', value: formatSeconds(job.elapsed) },
          { label: 'ETA', value: formatSeconds(job.eta) },
        ].map(stat => (
          <div key={stat.label} className="flex flex-col items-center gap-0.5 p-2 rounded-lg bg-[var(--surface-sunken)]">
            <span className="text-xs text-[var(--ink-faint)]">{stat.label}</span>
            <span className="text-sm font-mono">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="relative h-2 rounded-full overflow-hidden bg-[var(--surface-sunken)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%`, backgroundColor: 'var(--accent)' }}
        />
      </div>

      {/* Scene table */}
      <div className="flex flex-col gap-2">
        {scenes.map(scene => {
          const stageOrder = scene.track === 'v2v' ? STAGE_ORDER_V2V : STAGE_ORDER_I2V
          return (
            <div key={scene.id} className="flex flex-col gap-2 p-3 rounded-lg bg-[var(--surface-sunken)]">
              <div className="flex items-center gap-3">
                {/* Scene id */}
                <span className="text-xs font-mono w-8 text-[var(--ink-faint)] shrink-0">{scene.id}</span>

                {/* Stage dots */}
                <div className="flex items-center gap-1 flex-1">
                  {stageOrder.map(stageName => {
                    const key = stageName.toLowerCase().replace('-', '_')
                    const stageStatus: StageStatus = scene.stages[key] ?? scene.stages[stageName] ?? 'pending'
                    return (
                      <div
                        key={stageName}
                        title={stageName}
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${stageStatus === 'active' ? 'animate-pulse' : ''}`}
                        style={{ backgroundColor: STAGE_COLORS[stageStatus] }}
                      />
                    )
                  })}
                </div>

                {/* Model badge */}
                {scene.model && <Badge tone="neutral">{scene.model}</Badge>}

                {/* Attempt */}
                {scene.attempt && (
                  <span className="text-xs font-mono text-[var(--ink-faint)]">{scene.attempt}/3</span>
                )}

                {/* QA score */}
                {scene.qa !== undefined && (
                  <span className="text-xs font-mono" style={{ color: scene.qa >= threshold ? 'var(--accent)' : 'var(--danger)' }}>
                    {scene.qa.toFixed(2)}
                  </span>
                )}

                {/* Cost */}
                {scene.cost !== undefined && (
                  <span className="text-xs font-mono text-[var(--ink-faint)]">${scene.cost.toFixed(3)}</span>
                )}

                {/* Status */}
                <StatusPill status={scene.status === 'error' ? 'failed' : scene.status} />
              </div>

              {/* QA approve/reject buttons — visible only when scene is awaiting manual QA review */}
              {scene.status === 'qa' && (
                <div className="flex gap-2 mt-1">
                  <Button
                    size="sm"
                    variant="primary"
                    loading={approvingId === scene.id}
                    onClick={() => handleApprove(scene.id)}
                  >
                    Akceptuj
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={rejectingId === scene.id}
                    onClick={() => handleReject(scene.id)}
                  >
                    Odrzuć i wygeneruj ponownie
                  </Button>
                </div>
              )}

              {/* Lip-sync trigger — visible for dialog i2v scenes after I2V completes */}
              {scene.track === 'i2v' && (scene.model?.includes('dialog') ?? false) && scene.status === 'done' && (
                <div className="flex gap-2 mt-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={lipsyncingId === scene.id}
                    onClick={() => handleLipsync(scene)}
                  >
                    {lipsyncingId === scene.id ? '…' : 'Generuj lip-sync'}
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Lip-sync error alert */}
      {lipsyncError && (
        <InlineAlert tone="warn">{lipsyncError}</InlineAlert>
      )}

      {/* Resume button */}
      {hasFailed && onResume && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onResume(job.id)}>
            Wznów od błędu
          </Button>
        </div>
      )}
    </div>
  )
}
