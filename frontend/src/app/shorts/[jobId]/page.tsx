'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ScenePlanCard } from '@/components/shorts/ScenePlanCard'
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
          <ScenePlanCard
            key={scene.scene_id}
            scene={scene}
            status="queued"
            actions={
              <Button variant="ghost" size="sm">Regeneruj</Button>
            }
          />
        ))}
      </div>
    </div>
  )
}
