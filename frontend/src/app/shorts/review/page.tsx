'use client'
import { useState, useEffect } from 'react'
import { Button, StatusPill, InlineAlert } from '@/components/ui'

type ReviewRow = {
  id: string
  job_id: string
  token: string
  status: string
  brief: string
  created_at: string
}

export default function ShortReviewPage() {
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<Record<string, boolean>>({})

  async function loadReviews() {
    try {
      const data = await fetch('/api/shorts/reviews').then(r => r.json())
      setReviews(Array.isArray(data) ? data : [])
    } catch {
      // silent — table may not exist yet in dev
    }
  }

  useEffect(() => {
    loadReviews().finally(() => setLoading(false))
  }, [])

  async function handleSendReview(jobId: string) {
    setSending(jobId)
    try {
      await fetch(`/api/shorts/${jobId}/send-review`, { method: 'POST' })
      setSent(prev => ({ ...prev, [jobId]: true }))
      await loadReviews()
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="vf-content">
      <h2 className="vf-top-title">Do akceptacji</h2>
      <p style={{ color: 'var(--ink-muted)', fontSize: 13, marginBottom: 16 }}>
        Wyślij link do osoby przedstawionej w filmie, aby uzyskała jej zgodę przed eksportem (FR-18).
      </p>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{ height: 48, borderRadius: 8, background: 'var(--surface-raised)', opacity: 0.6 }}
            />
          ))}
        </div>
      )}

      {!loading && reviews.length === 0 && (
        <InlineAlert tone="info">Brak filmów oczekujących na recenzję.</InlineAlert>
      )}

      {!loading && reviews.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {['Job ID', 'Brief', 'Status', 'Akcje'].map(h => (
                <th
                  key={h}
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: 'var(--ink-faint)',
                    textTransform: 'uppercase',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reviews.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 12px' }}>
                  <code style={{ fontSize: 11 }}>{r.job_id?.slice(0, 8)}</code>
                </td>
                <td style={{ padding: '10px 12px', maxWidth: 240 }}>
                  <span style={{ fontSize: 13 }}>{r.brief?.slice(0, 50)}</span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <StatusPill
                    status={
                      r.status === 'pending'
                        ? 'queued'
                        : r.status === 'approved'
                          ? 'done'
                          : 'failed'
                    }
                  />
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {sent[r.job_id] ? (
                    <InlineAlert tone="info" title="Wysłano" />
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={sending === r.job_id || r.status !== 'pending'}
                      onClick={() => handleSendReview(r.job_id)}
                    >
                      {sending === r.job_id ? '…' : 'Wyślij zaproszenie'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
