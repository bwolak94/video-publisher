'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button, InlineAlert, Card, CardHead, CardBody, CardFoot } from '@/components/ui'

type ReviewData = {
  token: string
  status: string
  video_url: string
  brief: string
  job_id: string
}

export default function PersonReviewPage() {
  const { token } = useParams<{ token: string }>()
  const [review, setReview] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [result, setResult] = useState<'approved' | 'rejected' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/review/${token}`)
      .then(r => r.json())
      .then(data => {
        setReview(data)
        setLoading(false)
        // Pre-fill result if the review was already acted on
        if (data?.status === 'approved') setResult('approved')
        if (data?.status === 'rejected') setResult('rejected')
      })
      .catch(() => setLoading(false))
  }, [token])

  async function handleAction(action: 'approve' | 'reject') {
    setActing(true)
    setError(null)
    try {
      const res = await fetch(`/api/review/${token}/${action}`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      setResult(action === 'approve' ? 'approved' : 'rejected')
    } catch (e: any) {
      setError(e.message ?? 'Wystąpił błąd')
    } finally {
      setActing(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', fontFamily: 'monospace', color: 'var(--ink-faint)' }}>
        Ładowanie…
      </div>
    )
  }

  if (!review || (review as any).statusCode === 404) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <InlineAlert tone="danger" title="Nieprawidłowy link">
          Ten link do recenzji jest nieważny lub wygasł.
        </InlineAlert>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{ width: '100%', maxWidth: 480 }}>
        <Card>
          <CardHead>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Recenzja filmu</span>
          </CardHead>
          <CardBody className="flex flex-col gap-4">
            <p style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{review.brief}</p>

            {review.video_url && (
              <video
                src={review.video_url}
                controls
                style={{ width: '100%', borderRadius: 8, maxHeight: 400 }}
              />
            )}

            {result === 'approved' && (
              <InlineAlert tone="info" title="Zgoda udzielona">
                Dziękujemy za zaakceptowanie użycia Twojego wizerunku w tym filmie.
              </InlineAlert>
            )}
            {result === 'rejected' && (
              <InlineAlert tone="danger" title="Zgoda odwołana">
                Twoja decyzja została zapisana. Film nie zostanie opublikowany.
              </InlineAlert>
            )}
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          </CardBody>

          {!result && (
            <CardFoot>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button
                  variant="primary"
                  block
                  disabled={acting}
                  onClick={() => handleAction('approve')}
                >
                  Akceptuję użycie mojego wizerunku w tym filmie
                </Button>
                <Button
                  variant="danger"
                  block
                  disabled={acting}
                  onClick={() => handleAction('reject')}
                >
                  Odwołuję zgodę dla tego filmu
                </Button>
              </div>
            </CardFoot>
          )}
        </Card>
      </div>
    </div>
  )
}
