'use client'

import { useState, useEffect, useRef } from 'react'
import { InlineAlert } from '@/components/ui'
import { ClipTrimmer } from '@/components/shorts/ClipTrimmer'

type SourceClip = {
  id: string
  name?: string | null
  s3_url: string
  duration_s?: string | null
  in_point_s?: string | null
  out_point_s?: string | null
  created_at?: string | null
}

export default function SourceClipsPage() {
  const [clips, setClips] = useState<SourceClip[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [trimmingClip, setTrimmingClip] = useState<SourceClip | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/source-clips')
      .then(r => r.json())
      .then(setClips)
      .catch(() => {})
  }, [])

  async function handleFile(file: File) {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    setUploadProgress(0)
    try {
      // 1. Get presigned PUT URL
      const urlRes = await fetch('/api/source-clips/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      })
      if (!urlRes.ok) throw new Error('Nie udało się uzyskać URL do przesyłania')
      const { uploadUrl, clipId, s3Key } = await urlRes.json()

      setUploadProgress(10)

      // 2. Upload directly to S3 via presigned PUT
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!putRes.ok) throw new Error(`Błąd przesyłania do S3: HTTP ${putRes.status}`)
      setUploadProgress(80)

      // 3. Confirm upload in backend
      const confirmRes = await fetch('/api/source-clips/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId, filename: file.name, s3Key }),
      })
      if (!confirmRes.ok) throw new Error('Nie udało się potwierdzić przesyłania')
      setUploadProgress(100)

      // 4. Refresh list
      const refreshed = await fetch('/api/source-clips').then(r => r.json())
      setClips(refreshed)
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Błąd przesyłania')
    } finally {
      setUploading(false)
      setUploadProgress(0)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleTrimSave(
    clipId: string,
    inPoint: number,
    outPoint: number,
  ) {
    await fetch(`/api/source-clips/${clipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inPoint, outPoint }),
    })
    setTrimmingClip(null)
    setClips(prev =>
      prev.map(c =>
        c.id === clipId
          ? { ...c, in_point_s: String(inPoint), out_point_s: String(outPoint) }
          : c,
      ),
    )
  }

  const durationOf = (clip: SourceClip) =>
    clip.duration_s ? parseFloat(clip.duration_s) : 30

  return (
    <div className="vf-content">
      <div
        className="vf-top"
        style={{ paddingLeft: 0, paddingRight: 0, border: 'none', height: 'auto', marginBottom: 'var(--space-4)' }}
      >
        <h1 className="vf-top-title">Klipy źródłowe V2V</h1>
        <button
          className="vf-btn vf-btn-primary"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? `Przesyłanie… ${uploadProgress}%` : 'Dodaj klip'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/*"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
      </div>

      {uploading && (
        <div
          style={{
            height: 4,
            background: 'var(--surface-sunken)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            marginBottom: 'var(--space-4)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${uploadProgress}%`,
              background: 'var(--accent)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}

      {uploadError && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <InlineAlert tone="danger" title="Blad przesylania">
            {uploadError}
          </InlineAlert>
        </div>
      )}

      {clips.length === 0 && !uploading && (
        <InlineAlert tone="info" title="Brak klipów">
          Nie wgrano jeszcze zadnych klipow zrodlowych. Wgraj plik MP4, MOV lub WebM (max 500 MB),
          aby rozpoczac przycinanie i generowanie scen V2V.
        </InlineAlert>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {clips.map(clip => {
          const duration = durationOf(clip)
          const inPt = clip.in_point_s ? parseFloat(clip.in_point_s) : 0
          const outPt = clip.out_point_s ? parseFloat(clip.out_point_s) : duration
          const trimmed = clip.in_point_s || clip.out_point_s

          return (
            <div
              key={clip.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
                background: 'var(--surface-raised)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                border: '1px solid var(--line-subtle)',
              }}
            >
              {/* Thumbnail placeholder */}
              <div
                style={{
                  aspectRatio: '16/9',
                  background: 'var(--surface-sunken)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  color: 'var(--ink-faint)',
                }}
              >
                &#9654;
              </div>

              <p
                style={{
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--ink-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  margin: 0,
                }}
                title={clip.name ?? clip.id}
              >
                {clip.name ?? clip.id}
              </p>

              <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: 0 }}>
                {duration.toFixed(1)} s
                {trimmed ? ` · trim ${inPt.toFixed(1)}–${outPt.toFixed(1)} s` : ''}
              </p>

              <button
                className="vf-btn vf-btn-ghost"
                style={{ fontSize: 12 }}
                onClick={() => setTrimmingClip(clip)}
              >
                Przytnij
              </button>
            </div>
          )
        })}
      </div>

      {trimmingClip && (() => {
        const duration = durationOf(trimmingClip)
        const inPt = trimmingClip.in_point_s ? parseFloat(trimmingClip.in_point_s) : 0
        const outPt = trimmingClip.out_point_s ? parseFloat(trimmingClip.out_point_s) : duration

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
            }}
            onClick={e => { if (e.target === e.currentTarget) setTrimmingClip(null) }}
          >
            <div
              style={{
                background: 'var(--surface-raised)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-6)',
                maxWidth: 640,
                width: '100%',
                margin: 'var(--space-4)',
              }}
            >
              <ClipTrimmer
                title={trimmingClip.name ?? trimmingClip.id}
                duration={duration}
                inPoint={inPt}
                outPoint={outPt}
                playhead={inPt}
                controls={['pose', 'depth', 'mask', 'camera']}
                onTrim={({ inPoint, outPoint }) =>
                  handleTrimSave(trimmingClip.id, inPoint, outPoint)
                }
              />
              <button
                className="vf-btn vf-btn-ghost"
                style={{ marginTop: 'var(--space-3)', width: '100%' }}
                onClick={() => setTrimmingClip(null)}
              >
                Anuluj
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
