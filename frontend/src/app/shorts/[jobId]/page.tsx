'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { io } from 'socket.io-client'
import { ScenePlanCard } from '@/components/shorts/ScenePlanCard'
import { KeyframeReview } from '@/components/shorts/KeyframeReview'
import { ExportPanel } from '@/components/shorts/ExportPanel'
import { Button, InlineAlert } from '@/components/ui'
import type { ScenePlanScene } from '@/types/shorts'

type ShortsJob = {
  id: string
  brief: string
  status: string
  scene_plan: ScenePlanScene[]
  created_at: string
}

export default function ShortJobPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const [job, setJob] = useState<ShortsJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [acceptingScene, setAcceptingScene] = useState<Record<string, boolean>>({})
  const [wsConnected, setWsConnected] = useState(false)

  useEffect(() => {
    fetch(`/api/shorts/${jobId}`)
      .then(r => r.json())
      .then((data: ShortsJob) => {
        setJob(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [jobId])

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3002', {
      transports: ['websocket'],
    })

    socket.on('connect', () => {
      setWsConnected(true)
      socket.emit('join_job', { jobId })
    })

    socket.on('disconnect', () => {
      setWsConnected(false)
    })

    socket.on('job:scene_update', ({ sceneId, status, qaScore }: { sceneId: string; status: string; qaScore?: number }) => {
      setJob(prev => {
        if (!prev) return prev
        return {
          ...prev,
          scene_plan: prev.scene_plan.map((s: ScenePlanScene) =>
            s.scene_id === sceneId ? { ...s, status, qaScore } : s
          ),
        }
      })
    })

    socket.on('job:status_update', ({ status }: { status: string }) => {
      setJob(prev => prev ? { ...prev, status } : prev)
    })

    return () => {
      socket.emit('leave_job', { jobId })
      socket.disconnect()
    }
  }, [jobId])

  async function handleStart() {
    setStarting(true)
    setStartError(null)
    try {
      const res = await fetch(`/api/shorts/${jobId}/start`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setJob(prev => prev ? { ...prev, status: data.status } : prev)
    } catch (e: any) {
      setStartError(e.message ?? 'Błąd uruchamiania generacji')
    } finally {
      setStarting(false)
    }
  }

  async function handleAcceptKeyframe(sceneId: string, variantId: string) {
    setAcceptingScene(prev => ({ ...prev, [sceneId]: true }))
    await fetch(`/api/shorts/${jobId}/scenes/${sceneId}/accept-keyframe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId }),
    })
    setAcceptingScene(prev => ({ ...prev, [sceneId]: false }))
  }

  async function handleRegenerateKeyframe(sceneId: string) {
    await fetch(`/api/shorts/${jobId}/scenes/${sceneId}/regenerate-keyframe`, { method: 'POST' })
  }

  if (loading) {
    return (
      <div className="p-8 text-center font-mono text-[var(--ink-faint)]">Ładowanie…</div>
    )
  }

  if (!job) {
    return (
      <div className="p-8">
        <InlineAlert tone="danger" title="Nie znaleziono zadania" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-[var(--ink-faint)] uppercase tracking-wider mb-1">
            Scene Plan
          </p>
          <p className="text-sm">{job.brief}</p>
        </div>
        <Button
          variant="primary"
          loading={starting}
          disabled={starting || job.status === 'generating_i2v'}
          onClick={handleStart}
        >
          Generuj wszystkie sceny
        </Button>
      </div>

      {startError && <InlineAlert tone="danger">{startError}</InlineAlert>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <InlineAlert
          tone="info"
          title={`${job.scene_plan?.length ?? 0} scen · Status: ${job.status}`}
        />
        {wsConnected && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'monospace', color: 'var(--info)', flexShrink: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--info)', display: 'inline-block' }} />
            Live
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {(job.scene_plan ?? []).map(scene => (
          <div key={scene.scene_id} className="flex flex-col gap-3">
            <ScenePlanCard
              scene={scene}
              status="queued"
              actions={
                <Button variant="ghost" size="sm">Regeneruj</Button>
              }
            />
            {!scene.keyframe_variants?.length ? (
              <div style={{ display: 'flex', gap: 12 }}>
                {[0,1].map(i => (
                  <div key={i} style={{ width: 120, aspectRatio: '9/16', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>T2I w toku…</span>
                  </div>
                ))}
              </div>
            ) : (
                <KeyframeReview
                  sceneId={scene.scene_id}
                  title={scene.image_prompt.slice(0, 60)}
                  variants={(scene.keyframe_variants ?? []).map(v => ({
                    id: v.id,
                    src: v.s3Url,
                    seed: v.seed,
                    busy: v.status === 'generating',
                  }))}
                  loading={acceptingScene[scene.scene_id] ?? false}
                  onAccept={(variantId) => handleAcceptKeyframe(scene.scene_id, variantId)}
                  onRegenerate={() => handleRegenerateKeyframe(scene.scene_id)}
                />
              )
            }
          </div>
        ))}
      </div>

      {job.status === 'done' && (
        <ExportPanel
          jobId={jobId}
          title={job.brief?.slice(0, 50) ?? 'Short'}
          duration={30}
          cost={0}
          path={`s3://bucket/shorts/${jobId}/final.mp4`}
        />
      )}
    </div>
  )
}
