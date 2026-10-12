'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
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
  const [acceptingScene, setAcceptingScene] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch(`/api/shorts/${jobId}`)
      .then(r => r.json())
      .then((data: ShortsJob) => {
        setJob(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [jobId])

  async function handleStart() {
    setStarting(true)
    await fetch(`/api/shorts/${jobId}/start`, { method: 'POST' })
    setStarting(false)
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
        <Button variant="primary" loading={starting} onClick={handleStart}>
          Generuj wszystkie sceny
        </Button>
      </div>

      <InlineAlert
        tone="info"
        title={`${job.scene_plan?.length ?? 0} scen · Status: ${job.status}`}
      />

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
