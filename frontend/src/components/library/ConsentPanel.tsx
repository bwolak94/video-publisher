'use client'
import { useState } from 'react'
import { Button, Badge, Card, CardHead, CardBody, CardFoot, Switch, InlineAlert } from '@/components/ui'

const FORBIDDEN_TOPICS = [
  'Treści seksualne',
  'Polityczne/wyborcze',
  'Podszywanie się w celu wprowadzenia w błąd',
  'Treści o osobach trzecich bez zgody',
  'Wizerunek niepełnoletnich',
]

export type LikenessConsent = {
  id: string
  subject_name: string
  subject_email: string
  face_match_score: number
  purpose: string
  channels: string[]
  topics_allowed: string[]
  voice_consent: boolean
  period_until?: string
  proof_hash: string
  proof_ip_hash: string
  proof_at: string
  revoked_at?: string
  version: number
  created_at: string
}

export type ConsentPanelProps = {
  consent: LikenessConsent
  onRevoke: () => void
  readOnly?: boolean
}

function getStatus(consent: LikenessConsent): 'done' | 'blocked' | 'review' | 'queued' {
  if (consent.revoked_at) return 'blocked'
  if (consent.period_until && new Date(consent.period_until) < new Date()) return 'blocked'
  const daysLeft = consent.period_until
    ? Math.ceil((new Date(consent.period_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : Infinity
  if (daysLeft <= 30) return 'review'
  return 'done'
}

export function ConsentPanel({ consent, onRevoke, readOnly = true }: ConsentPanelProps) {
  const [revokeOpen, setRevokeOpen] = useState(false)
  const status = getStatus(consent)
  const faceScore = Number(consent.face_match_score)

  return (
    <>
      <Card>
        <CardHead className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-semibold truncate">{consent.subject_name}</span>
            <Badge tone={faceScore >= 0.7 ? 'accent' : 'warn'}>{faceScore.toFixed(2)}</Badge>
          </div>
          <Badge tone={status === 'blocked' ? 'danger' : status === 'review' ? 'warn' : 'accent'}>
            {status === 'blocked' ? 'Odwołana' : status === 'review' ? 'Wygasająca' : 'Aktywna'}
          </Badge>
        </CardHead>

        <CardBody className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Badge tone="neutral" mono>v{consent.version}</Badge>
            {consent.period_until && (
              <span className="text-xs text-[var(--ink-faint)]">
                ważna do {new Date(consent.period_until).toLocaleDateString('pl-PL')}
              </span>
            )}
          </div>

          <p className="text-sm text-[var(--ink-muted)]">{consent.purpose}</p>

          <div className="flex flex-wrap gap-1">
            {consent.channels.map(ch => <Badge key={ch} tone="neutral">{ch}</Badge>)}
          </div>

          <div>
            <p className="text-xs text-[var(--ink-faint)] mb-1">Dozwolone tematy</p>
            <div className="flex flex-wrap gap-1">
              {consent.topics_allowed.map(t => <Badge key={t} tone="accent">{t}</Badge>)}
            </div>
          </div>

          <div>
            <p className="text-xs text-[var(--ink-faint)] mb-1">Zawsze zabronione</p>
            <div className="flex flex-wrap gap-1">
              {FORBIDDEN_TOPICS.map(t => <Badge key={t} tone="danger">{t}</Badge>)}
            </div>
          </div>

          <Switch
            label="Zgoda na głos"
            checked={consent.voice_consent}
            onChange={() => {}}
            disabled
          />

          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--ink-faint)] select-none">Dowód zgody</summary>
            <div className="mt-2 flex flex-col gap-1 font-mono text-[var(--ink-faint)] break-all">
              <span>{new Date(consent.proof_at).toLocaleString('pl-PL')}</span>
              <span>hash: {consent.proof_hash.slice(0, 16)}&hellip;</span>
              <span>ip: {consent.proof_ip_hash.slice(0, 16)}&hellip;</span>
            </div>
          </details>
        </CardBody>

        <CardFoot>
          {!consent.revoked_at ? (
            <Button variant="danger" size="sm" onClick={() => setRevokeOpen(true)}>
              Odwołaj zgodę
            </Button>
          ) : (
            <Badge tone="danger">
              Odwołana {new Date(consent.revoked_at).toLocaleDateString('pl-PL')}
            </Badge>
          )}
        </CardFoot>
      </Card>

      {revokeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => e.target === e.currentTarget && setRevokeOpen(false)}
        >
          <div className="w-full max-w-sm rounded-xl p-6 flex flex-col gap-4 bg-[var(--bg-panel,#18191c)]">
            <h2 className="text-lg font-semibold">Odwołać zgodę?</h2>
            <InlineAlert tone="danger" title="Skutki odwołania">
              Blokada natychmiastowa — postać nie może być używana. Usunięcie danych w ciągu 30 dni.
            </InlineAlert>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setRevokeOpen(false)}>Anuluj</Button>
              <Button variant="danger" onClick={() => { setRevokeOpen(false); onRevoke() }}>Odwołaj</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
