'use client'
import { useState } from 'react'
import { Button, Badge, Card, CardHead, CardBody, CardFoot, StatusPill, InlineAlert } from '@/components/ui'

export type ExportPanelProps = {
  jobId: string
  title: string
  duration: number          // seconds
  poster?: string           // video thumbnail URL
  cost: number              // USD
  path: string              // s3://bucket/key
  label?: string            // custom AI label override
  hasLikeness?: boolean     // changes AI label wording
  onDownload?: () => void
}

const LABEL_DEFAULT = 'Film zawiera postacie fikcyjne wygenerowane przez AI (C2PA).'
const LABEL_LIKENESS = 'Film zawiera syntetyczny wizerunek osoby rzeczywistej wygenerowany przez AI (deepfake, C2PA, AI Act art. 50).'

export function ExportPanel({
  jobId,
  title,
  duration,
  poster,
  cost,
  path,
  label,
  hasLikeness = false,
  onDownload,
}: ExportPanelProps) {
  const [copied, setCopied] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const aiLabel = label ?? (hasLikeness ? LABEL_LIKENESS : LABEL_DEFAULT)

  async function handleCopy() {
    await navigator.clipboard.writeText(aiLabel)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleFinalize() {
    setFinalizing(true)
    setFinalizeError(null)
    try {
      const res = await fetch(`/api/shorts/${jobId}/finalize`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const { downloadUrl } = await res.json()
      window.location.href = downloadUrl
      onDownload?.()
    } catch (e: any) {
      setFinalizeError(e.message ?? 'Błąd finalizacji')
    } finally {
      setFinalizing(false)
    }
  }

  return (
    <Card>
      <CardHead className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <StatusPill status="done" />
      </CardHead>

      <CardBody className="flex flex-col gap-4">
        {/* 9:16 preview */}
        <div className="mx-auto rounded-lg overflow-hidden bg-[var(--surface-sunken)]" style={{ width: 160, aspectRatio: '9/16' }}>
          {poster ? (
            <img src={poster} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-xs font-mono text-[var(--ink-faint)]">&#9654;</span>
            </div>
          )}
        </div>

        {/* Spec row */}
        <p className="text-sm font-mono text-center text-[var(--ink-faint)]">
          MP4 H.264 &middot; 1080&times;1920 &middot; {duration}s &middot; ${cost.toFixed(2)}
        </p>

        {/* C2PA badge */}
        <div className="flex items-center gap-2">
          <Badge tone="accent">C2PA &#10003;</Badge>
          <span className="text-xs text-[var(--ink-faint)]">Metadane AI wbudowane w plik</span>
        </div>

        {/* AI label */}
        <div className="rounded-lg p-3 flex flex-col gap-2" style={{ backgroundColor: 'var(--surface-raised, var(--surface-sunken))' }}>
          <p className="text-xs text-[var(--ink-muted)]">Etykieta do opisu:</p>
          <p className="text-sm font-mono leading-relaxed">{aiLabel}</p>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? 'Skopiowano \u2713' : 'Kopiuj'}
          </Button>
        </div>

        {/* Platform reminder */}
        <InlineAlert tone="info" title="Oznaczenie na platformie">
          Pamiętaj o oznaczeniu treści syntetycznej na YouTube i TikTok.
        </InlineAlert>

        {finalizing && <InlineAlert tone="info">Dołączam manifest C2PA i etykietę AI&hellip;</InlineAlert>}
        {finalizeError && <InlineAlert tone="danger">{finalizeError}</InlineAlert>}

        {/* S3 path */}
        <code className="text-xs font-mono text-[var(--ink-faint)] break-all">{path}</code>
      </CardBody>

      <CardFoot>
        <Button variant="primary" block onClick={handleFinalize} loading={finalizing}>
          {finalizing ? 'Finalizacja\u2026' : 'Pobierz MP4'}
        </Button>
      </CardFoot>
    </Card>
  )
}
