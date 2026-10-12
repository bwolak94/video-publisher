'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button, StatusPill, InlineAlert, Badge } from '@/components/ui'
import { Tabs } from '@/components/ui/Tabs'

type BackendStatus =
  | 'pending'
  | 'generating_scene_plan'
  | 'keyframe_review'
  | 'generating_i2v'
  | 'qa_review'
  | 'done'
  | 'failed'

type PillStatus = 'queued' | 'generating' | 'review' | 'qa' | 'failed' | 'blocked' | 'done'

function toPillStatus(status: string): PillStatus {
  switch (status) {
    case 'pending':
    case 'generating_scene_plan':
      return 'queued'
    case 'generating_i2v':
      return 'generating'
    case 'keyframe_review':
      return 'review'
    case 'qa_review':
      return 'qa'
    case 'done':
      return 'done'
    case 'failed':
      return 'failed'
    default:
      return 'queued'
  }
}

type ShortJob = {
  id: string
  brief: string
  status: string
  scene_plan?: unknown[]
  created_at: string
}

const STATUS_TABS = [
  { value: '', label: 'Wszystkie' },
  { value: 'generating_i2v', label: 'W toku' },
  { value: 'qa_review', label: 'Do akceptacji' },
  { value: 'done', label: 'Gotowe' },
  { value: 'failed', label: 'Bledy' },
]

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'przed chwila'
  if (m < 60) return `${m} min temu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} godz. temu`
  return `${Math.floor(h / 24)} dni temu`
}

export default function ShortsListPage() {
  const router = useRouter()
  const [allJobs, setAllJobs] = useState<ShortJob[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStatus, setActiveStatus] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  useEffect(() => {
    setLoading(true)
    setPage(0)
    const params = new URLSearchParams({ limit: '100' })
    fetch(`/api/shorts?${params}`)
      .then((r) => r.json())
      .then((res) => {
        const data: ShortJob[] = Array.isArray(res) ? res : (res.data ?? [])
        setAllJobs(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered =
    activeStatus === ''
      ? allJobs
      : allJobs.filter((j) => j.status === activeStatus)

  const visible = filtered.slice(0, (page + 1) * PAGE_SIZE)
  const hasMore = visible.length < filtered.length

  function handleTabChange(value: string) {
    setActiveStatus(value)
    setPage(0)
  }

  return (
    <div className="vf-content" style={{ maxWidth: 900 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <h2 className="vf-top-title" style={{ margin: 0 }}>
          Shorts
        </h2>
        <Button variant="primary" onClick={() => router.push('/shorts/new')}>
          + Nowy brief
        </Button>
      </div>

      <Tabs
        items={STATUS_TABS}
        value={activeStatus}
        onChange={handleTabChange}
      />

      <div style={{ marginTop: 16 }}>
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  height: 48,
                  borderRadius: 8,
                  background: 'var(--surface-raised)',
                  animation: 'vf-pulse 1.4s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <InlineAlert tone="info">
            Nie masz jeszcze zadnych Shortow. Zacznij od briefu.
          </InlineAlert>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  {['ID', 'Temat', 'Sceny', 'Status', 'Data', 'Akcje'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 12px',
                        textAlign: 'left',
                        fontSize: 11,
                        fontFamily: 'monospace',
                        color: 'var(--ink-faint)',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((job) => (
                  <tr
                    key={job.id}
                    style={{ borderBottom: '1px solid var(--line)' }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <code style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                        {job.id.slice(0, 8)}
                      </code>
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: 280 }}>
                      <span style={{ fontSize: 13 }}>
                        {job.brief?.slice(0, 60)}
                        {(job.brief?.length ?? 0) > 60 ? '\u2026' : ''}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Badge tone="neutral">{job.scene_plan?.length ?? 0}</Badge>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <StatusPill status={toPillStatus(job.status)} />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: 'monospace',
                          color: 'var(--ink-faint)',
                        }}
                      >
                        {relativeTime(job.created_at)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/shorts/${job.id}`)}
                      >
                        Otworz
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && hasMore && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Button variant="ghost" onClick={() => setPage((p) => p + 1)}>
              Wczytaj wiecej
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
